package ai.webwaifu.mobile.ui

import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.pow
import org.json.JSONArray
import org.json.JSONObject

/**
 * The native equivalent of @pixiv/three-vrm-materials-v0compat.
 *
 * VRM 0 stores MToon data outside the glTF material. gltfio consequently sees only the deliberately
 * simple fallback material. This parser ports the same VRM0 -> MToon 1.0 conversions used by
 * Waifu4's pinned three-vrm 3.5.3 package.
 */
internal object VrmMToon {
    data class Material(
        val index: Int,
        val name: String,
        val baseColor: FloatArray,
        val shadeColor: FloatArray,
        val emissionColor: FloatArray,
        val rimColor: FloatArray,
        val outlineColor: FloatArray,
        val shadingShift: Float,
        val shadingToony: Float,
        val giEqualization: Float,
        val rimLightingMix: Float,
        val rimFresnelPower: Float,
        val rimLift: Float,
        val outlineWidthMode: Int,
        val outlineWidth: Float,
        val outlineLightingMix: Float,
        val normalScale: Float,
        val transparentWithZWrite: Boolean,
        val doubleSided: Boolean,
        val baseTexture: Int?,
        val shadeTexture: Int?,
        val normalTexture: Int?,
        val emissionTexture: Int?,
        val matcapTexture: Int?,
        val outlineWidthTexture: Int?,
    )

    data class PreparedModel(
        val bytes: ByteArray,
        val materials: List<Material>,
    )

    fun prepare(bytes: ByteArray): PreparedModel {
        val glb = Glb.read(bytes)
        val json = glb.json
        val gltfMaterials = json.optJSONArray("materials") ?: JSONArray()
        val vrmMaterials =
            json.optJSONObject("extensions")
                ?.optJSONObject("VRM")
                ?.optJSONArray("materialProperties")
                ?: return PreparedModel(bytes, emptyList())

        val parsed =
            buildList {
                for (index in 0 until minOf(gltfMaterials.length(), vrmMaterials.length())) {
                    val source = vrmMaterials.optJSONObject(index) ?: continue
                    if (source.optString("shader") != "VRM/MToon") continue
                    add(parseMaterial(index, source))
                }
            }
        if (parsed.isEmpty()) return PreparedModel(bytes, emptyList())

        val byIndex = parsed.associateBy(Material::index)
        for (index in 0 until gltfMaterials.length()) {
            val material = gltfMaterials.getJSONObject(index)
            val mtoon = byIndex[index] ?: continue
            val extras =
                material.optJSONObject("extras") ?: JSONObject().also { material.put("extras", it) }
            extras.put(EXTRAS_MTOON_INDEX, index)
            val pbr =
                material.optJSONObject("pbrMetallicRoughness")
                    ?: JSONObject().also { material.put("pbrMetallicRoughness", it) }
            pbr.put("baseColorFactor", JSONArray(mtoon.baseColor.toList()))
            material.put(
                "emissiveFactor",
                JSONArray(listOf(mtoon.emissionColor[0], mtoon.emissionColor[1], mtoon.emissionColor[2])),
            )
            material.optJSONObject("normalTexture")?.put("scale", mtoon.normalScale)

            // gltfio already owns and caches all embedded image resources. The bundled Waifu4
            // models leave the spec/gloss and occlusion slots unused, so route the two VRM-only
            // textures through those slots and interpret them as matcap and outline width in the
            // native material. This avoids decoding duplicate copies of the same GLB images.
            mtoon.matcapTexture?.let { textureIndex ->
                val extensions =
                    material.optJSONObject("extensions")
                        ?: JSONObject().also { material.put("extensions", it) }
                val baseFactor =
                    pbr.optJSONArray("baseColorFactor") ?: JSONArray(mtoon.baseColor.toList())
                extensions.put(
                    "KHR_materials_pbrSpecularGlossiness",
                    JSONObject()
                        .put("diffuseFactor", baseFactor)
                        .put("specularFactor", JSONArray(listOf(1.0, 1.0, 1.0)))
                        .put("glossinessFactor", 1.0)
                        .put(
                            "specularGlossinessTexture",
                            JSONObject().put("index", textureIndex).put("texCoord", 0),
                        ),
                )
                val used =
                    json.optJSONArray("extensionsUsed")
                        ?: JSONArray().also { json.put("extensionsUsed", it) }
                if ((0 until used.length()).none { used.optString(it) == SPEC_GLOSS_EXTENSION }) {
                    used.put(SPEC_GLOSS_EXTENSION)
                }
            }
            mtoon.outlineWidthTexture?.let { textureIndex ->
                material.put(
                    "occlusionTexture",
                    JSONObject()
                        .put("index", textureIndex)
                        .put("texCoord", 0)
                        .put("strength", 1.0),
                )
            }
            // MToon's shaded side has its own color texture. Route a distinct shade texture
            // through glTF sheen color so gltfio decodes it as sRGB and supplies it to the
            // custom native material. Most VRM0 avatars (including Hikari) reuse _MainTex, in
            // which case the shader samples the already-bound base color map directly.
            mtoon.shadeTexture
                ?.takeIf { it != mtoon.baseTexture }
                ?.let { textureIndex ->
                    val extensions =
                        material.optJSONObject("extensions")
                            ?: JSONObject().also { material.put("extensions", it) }
                    extensions.put(
                        SHEEN_EXTENSION,
                        JSONObject()
                            .put("sheenColorFactor", JSONArray(listOf(0.0, 0.0, 0.0)))
                            .put(
                                "sheenColorTexture",
                                JSONObject().put("index", textureIndex).put("texCoord", 0),
                            )
                            .put("sheenRoughnessFactor", 0.0),
                    )
                    val used =
                        json.optJSONArray("extensionsUsed")
                            ?: JSONArray().also { json.put("extensionsUsed", it) }
                    if ((0 until used.length()).none { used.optString(it) == SHEEN_EXTENSION }) {
                        used.put(SHEEN_EXTENSION)
                    }
                }
        }
        return PreparedModel(glb.write(json), parsed)
    }

    private fun parseMaterial(
        index: Int,
        source: JSONObject,
    ): Material {
        val floats = source.optJSONObject("floatProperties") ?: JSONObject()
        val vectors = source.optJSONObject("vectorProperties") ?: JSONObject()
        val textures = source.optJSONObject("textureProperties") ?: JSONObject()
        val keywords = source.optJSONObject("keywordMap") ?: JSONObject()

        val legacyShift = floats.float("_ShadeShift", 0f)
        var toony = floats.float("_ShadeToony", 0.9f)
        toony = lerp(toony, 1f, 0.5f + 0.5f * legacyShift)
        val shift = -legacyShift - (1f - toony)
        val indirect = floats.float("_IndirectLightIntensity", 0.1f)
        val outlineColorMode = floats.int("_OutlineColorMode", 0)

        return Material(
            index = index,
            name = source.optString("name", "material-$index"),
            baseColor = vectors.linearColor("_Color", floatArrayOf(1f, 1f, 1f, 1f)),
            shadeColor =
                vectors.linearColor(
                    "_ShadeColor",
                    floatArrayOf(0.97f, 0.81f, 0.86f, 1f),
                ),
            emissionColor =
                vectors.linearColor("_EmissionColor", floatArrayOf(0f, 0f, 0f, 1f)),
            rimColor = vectors.linearColor("_RimColor", floatArrayOf(0f, 0f, 0f, 1f)),
            outlineColor =
                vectors.linearColor("_OutlineColor", floatArrayOf(0f, 0f, 0f, 1f)),
            shadingShift = shift,
            shadingToony = toony,
            giEqualization = if (indirect == 0f) 0.9f else 1f - indirect,
            rimLightingMix = floats.float("_RimLightingMix", 0f),
            rimFresnelPower = floats.float("_RimFresnelPower", 1f),
            rimLift = floats.float("_RimLift", 0f),
            outlineWidthMode = floats.int("_OutlineWidthMode", 0).coerceIn(0, 2),
            outlineWidth = floats.float("_OutlineWidth", 0f) * 0.01f,
            outlineLightingMix =
                if (outlineColorMode == 1) floats.float("_OutlineLightingMix", 1f) else 0f,
            normalScale = floats.float("_BumpScale", 1f),
            transparentWithZWrite =
                keywords.optBoolean("_ALPHABLEND_ON", false) &&
                    floats.int("_ZWrite", 0) == 1,
            doubleSided = floats.int("_CullMode", 2) == 0,
            baseTexture = textures.texture("_MainTex"),
            shadeTexture = textures.texture("_ShadeTexture"),
            normalTexture = textures.texture("_BumpMap"),
            emissionTexture = textures.texture("_EmissionMap"),
            matcapTexture = textures.texture("_SphereAdd"),
            outlineWidthTexture = textures.texture("_OutlineWidthTexture"),
        )
    }

    private fun JSONObject.float(
        key: String,
        fallback: Float,
    ): Float = optDouble(key, fallback.toDouble()).toFloat()

    private fun JSONObject.int(
        key: String,
        fallback: Int,
    ): Int = optInt(key, fallback)

    private fun JSONObject.texture(key: String): Int? =
        if (has(key) && !isNull(key)) optInt(key).takeIf { it >= 0 } else null

    private fun JSONObject.linearColor(
        key: String,
        fallback: FloatArray,
    ): FloatArray {
        val values = optJSONArray(key)
        return FloatArray(4) { component ->
            val value =
                values?.optDouble(component, fallback[component].toDouble())?.toFloat()
                    ?: fallback[component]
            if (component == 3) value else value.coerceAtLeast(0f).pow(2.2f)
        }
    }

    private fun lerp(
        start: Float,
        end: Float,
        amount: Float,
    ): Float = start + (end - start) * amount

    private data class Chunk(
        val type: Int,
        val bytes: ByteArray,
    )

    private data class Glb(
        val json: JSONObject,
        val chunks: List<Chunk>,
    ) {
        fun write(nextJson: JSONObject): ByteArray {
            // org.json escapes '/' as '\/'. cgltf preserves MIME strings from this extension
            // block verbatim, which prevents ResourceLoader from matching its "image/png"
            // provider. Both spellings are valid JSON, so retain the unescaped GLB spelling.
            val jsonBytes = nextJson.toString().replace("\\/", "/").toByteArray(Charsets.UTF_8)
            val paddedJson =
                jsonBytes.copyOf(jsonBytes.size + ((4 - jsonBytes.size % 4) % 4)).also { padded ->
                    for (index in jsonBytes.size until padded.size) padded[index] = 0x20
                }
            val outputChunks =
                chunks.map { chunk ->
                    if (chunk.type == JSON_CHUNK) chunk.copy(bytes = paddedJson) else chunk
                }
            val totalSize = 12 + outputChunks.sumOf { 8 + it.bytes.size }
            return ByteBuffer.allocate(totalSize).order(ByteOrder.LITTLE_ENDIAN).run {
                putInt(GLB_MAGIC)
                putInt(2)
                putInt(totalSize)
                outputChunks.forEach { chunk ->
                    putInt(chunk.bytes.size)
                    putInt(chunk.type)
                    put(chunk.bytes)
                }
                array()
            }
        }

        companion object {
            fun read(bytes: ByteArray): Glb {
                val source = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
                require(source.int == GLB_MAGIC) { "Not a binary glTF/VRM file." }
                require(source.int == 2) { "Only glTF 2 VRM files are supported." }
                source.int
                var json: JSONObject? = null
                val chunks = mutableListOf<Chunk>()
                while (source.remaining() >= 8) {
                    val length = source.int
                    val type = source.int
                    require(length >= 0 && length <= source.remaining()) { "Invalid GLB chunk." }
                    val chunk = ByteArray(length).also(source::get)
                    chunks += Chunk(type, chunk)
                    if (type == JSON_CHUNK) {
                        json =
                            JSONObject(
                                chunk.toString(Charsets.UTF_8)
                                    .trimEnd('\u0000', ' ', '\n', '\r', '\t'),
                            )
                    }
                }
                return Glb(requireNotNull(json) { "VRM JSON chunk is missing." }, chunks)
            }
        }
    }

    const val EXTRAS_MTOON_INDEX = "_webWaifuMToonIndex"
    private const val SPEC_GLOSS_EXTENSION = "KHR_materials_pbrSpecularGlossiness"
    private const val SHEEN_EXTENSION = "KHR_materials_sheen"
    private const val GLB_MAGIC = 0x46546C67
    private const val JSON_CHUNK = 0x4E4F534A
}
