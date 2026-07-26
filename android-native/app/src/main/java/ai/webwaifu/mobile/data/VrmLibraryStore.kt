package ai.webwaifu.mobile.data

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import ai.webwaifu.mobile.model.SavedVrmModel
import ai.webwaifu.mobile.model.BUNDLED_VRM_MODELS
import java.io.File
import java.io.InputStream
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

/**
 * App-private native replacement for Waifu4's IndexedDB custom VRM library.
 *
 * Imported documents are copied into internal storage so they keep working after the document
 * picker grant expires and without depending on Termux or a browser runtime.
 */
class VrmLibraryStore(private val context: Context) {
    private val directory = File(context.filesDir, DIRECTORY_NAME).apply { mkdirs() }
    private val preferences =
        context.getSharedPreferences("webwaifu_mobile_vrm_library", Context.MODE_PRIVATE)

    fun list(): List<SavedVrmModel> {
        val entries = parseManifest()
        val existing = entries.filter { modelFile(it).isFile }
        if (existing.size != entries.size) saveManifest(existing)
        return existing
    }

    fun activeId(): String? =
        preferences.getString(ACTIVE_ID_KEY, null)?.takeIf { id -> list().any { it.id == id } }

    fun setActive(id: String?) {
        require(id == null || list().any { it.id == id }) { "That saved VRM is unavailable." }
        preferences.edit().putString(ACTIVE_ID_KEY, id).apply()
    }

    fun activeBundledId(): String {
        val stored = preferences.getString(ACTIVE_BUNDLED_ID_KEY, DEFAULT_BUNDLED_ID).orEmpty()
        return stored.takeIf { id -> BUNDLED_VRM_MODELS.any { it.id == id } }
            ?: DEFAULT_BUNDLED_ID
    }

    fun setActiveBundled(id: String) {
        require(BUNDLED_VRM_MODELS.any { it.id == id }) { "That bundled VRM is unavailable." }
        preferences.edit()
            .remove(ACTIVE_ID_KEY)
            .putString(ACTIVE_BUNDLED_ID_KEY, id)
            .apply()
    }

    fun import(uri: Uri): SavedVrmModel {
        val displayName = queryDisplayName(uri).ifBlank { "Custom VRM" }.take(120)
        val id = UUID.randomUUID().toString()
        val destination = File(directory, "$id.vrm")
        val temporary = File(directory, "$id.importing")
        var total = 0L
        try {
            context.contentResolver.openInputStream(uri)?.use { input ->
                temporary.outputStream().buffered().use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        require(total <= MAX_VRM_BYTES) {
                            "VRM files larger than ${MAX_VRM_BYTES / 1024 / 1024} MB are not supported."
                        }
                        output.write(buffer, 0, count)
                    }
                }
            } ?: error("The selected VRM could not be opened.")
            require(total >= 20L && hasGlbMagic(temporary)) {
                "The selected file is not a binary .vrm/glTF model."
            }
            require(temporary.renameTo(destination)) { "The imported VRM could not be saved." }
            val model =
                SavedVrmModel(
                    id = id,
                    name = displayName.removeSuffix(".vrm").ifBlank { "Custom VRM" },
                    storageFileName = destination.name,
                    sizeBytes = total,
                )
            saveManifest(list() + model)
            setActive(model.id)
            return model
        } catch (error: Throwable) {
            temporary.delete()
            destination.delete()
            throw error
        }
    }

    fun delete(id: String) {
        val models = list()
        val model = models.firstOrNull { it.id == id } ?: return
        modelFile(model).delete()
        saveManifest(models.filterNot { it.id == id })
        if (activeId() == id) setActive(null)
    }

    fun readBytes(model: SavedVrmModel): ByteArray {
        val file = modelFile(model)
        require(file.isFile && file.canonicalFile.parentFile == directory.canonicalFile) {
            "Saved VRM file is missing."
        }
        return file.readBytes()
    }

    fun openStream(id: String): InputStream? {
        val model = list().firstOrNull { it.id == id } ?: return null
        val file = modelFile(model)
        if (!file.isFile || file.canonicalFile.parentFile != directory.canonicalFile) return null
        return file.inputStream().buffered()
    }

    private fun modelFile(model: SavedVrmModel) = File(directory, model.storageFileName)

    private fun parseManifest(): List<SavedVrmModel> {
        val array =
            runCatching {
                JSONArray(preferences.getString(MANIFEST_KEY, "[]").orEmpty())
            }.getOrElse { JSONArray() }
        return buildList {
            for (index in 0 until array.length()) {
                val entry = array.optJSONObject(index) ?: continue
                val id = entry.optString("id").trim()
                val name = entry.optString("name").trim()
                val fileName = entry.optString("storageFileName").trim()
                if (
                    id.isBlank() ||
                    name.isBlank() ||
                    !fileName.endsWith(".vrm") ||
                    fileName.contains('/') ||
                    fileName.contains('\\')
                ) {
                    continue
                }
                add(
                    SavedVrmModel(
                        id = id,
                        name = name,
                        storageFileName = fileName,
                        sizeBytes = entry.optLong("sizeBytes").coerceAtLeast(0L),
                    ),
                )
            }
        }
    }

    private fun saveManifest(models: List<SavedVrmModel>) {
        val array = JSONArray()
        models.forEach { model ->
            array.put(
                JSONObject()
                    .put("id", model.id)
                    .put("name", model.name)
                    .put("storageFileName", model.storageFileName)
                    .put("sizeBytes", model.sizeBytes),
            )
        }
        preferences.edit().putString(MANIFEST_KEY, array.toString()).apply()
    }

    private fun queryDisplayName(uri: Uri): String =
        runCatching {
            context.contentResolver.query(
                uri,
                arrayOf(OpenableColumns.DISPLAY_NAME),
                null,
                null,
                null,
            )?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0).orEmpty() else ""
            }.orEmpty()
        }.getOrDefault("")

    private fun hasGlbMagic(file: File): Boolean =
        file.inputStream().use { input ->
            val magic = ByteArray(4)
            input.read(magic) == 4 &&
                magic[0] == 'g'.code.toByte() &&
                magic[1] == 'l'.code.toByte() &&
                magic[2] == 'T'.code.toByte() &&
                magic[3] == 'F'.code.toByte()
        }

    companion object {
        private const val DIRECTORY_NAME = "vrm-models"
        private const val MANIFEST_KEY = "models"
        private const val ACTIVE_ID_KEY = "active_id"
        private const val ACTIVE_BUNDLED_ID_KEY = "active_bundled_id"
        private const val DEFAULT_BUNDLED_ID = "neuro-sama"
        private const val MAX_VRM_BYTES = 200L * 1024L * 1024L
    }
}
