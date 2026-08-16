package ai.webwaifu.mobile.data

import android.content.Context
import ai.webwaifu.mobile.model.ChatMessage
import ai.webwaifu.mobile.model.MessageRole
import org.json.JSONArray
import org.json.JSONObject

/**
 * A deliberately small, app-owned memory layer for Android.
 *
 * It performs no network request and runs no background model. Each persona gets a pinned profile,
 * a bounded set of exact conversation highlights, and a bounded recent chat. The prompt projection
 * is hard-capped so memory cannot quietly grow token cost or delay the streaming/TTS pipeline.
 */
class MobileMemoryStore(context: Context) {
    private val preferences =
        context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)
    private val lock = Any()

    fun load(personaId: String): MobileMemorySnapshot =
        synchronized(lock) {
            val root = loadRoot()
            root.optJSONObject(personaId)?.toSnapshot() ?: MobileMemorySnapshot()
        }

    fun saveProfile(
        personaId: String,
        profile: String,
    ): MobileMemorySnapshot =
        mutate(personaId) { current ->
            current.copy(profile = normalizeWhitespace(profile).take(MAX_PROFILE_CHARS))
        }

    fun saveConversation(
        personaId: String,
        messages: List<ChatMessage>,
    ): MobileMemorySnapshot =
        mutate(personaId) { current ->
            current.copy(
                conversation =
                    messages
                        .filter { it.role != MessageRole.SYSTEM && it.text.isNotBlank() }
                        .takeLast(MAX_CONVERSATION_MESSAGES)
                        .map { it.copy(streaming = false) },
            )
        }

    fun recordTurn(
        personaId: String,
        userText: String,
        assistantText: String,
        maxHighlights: Int,
    ): MobileMemorySnapshot {
        val user = normalizeWhitespace(userText).take(MAX_HIGHLIGHT_SIDE_CHARS)
        val assistant = normalizeWhitespace(assistantText).take(MAX_HIGHLIGHT_SIDE_CHARS)
        if (user.isBlank() || assistant.isBlank()) return load(personaId)
        val now = System.currentTimeMillis()
        val nextEntry =
            MobileMemoryHighlight(
                createdAt = now,
                score = scoreUserMemory(user),
                userText = user,
                assistantText = assistant,
            )
        return mutate(personaId) { current ->
            val duplicateKey = user.lowercase()
            val capacity = (maxHighlights.coerceIn(2, 10) * 2).coerceIn(8, MAX_STORED_HIGHLIGHTS)
            val next =
                (current.highlights.filterNot { it.userText.lowercase() == duplicateKey } + nextEntry)
                    .sortedWith(
                        compareByDescending<MobileMemoryHighlight> { it.score }
                            .thenByDescending { it.createdAt },
                    )
                    .take(capacity)
                    .sortedBy { it.createdAt }
            current.copy(highlights = next)
        }
    }

    fun clearMemory(personaId: String): MobileMemorySnapshot =
        mutate(personaId) { current ->
            current.copy(profile = "", highlights = emptyList())
        }

    fun clearConversation(personaId: String): MobileMemorySnapshot =
        mutate(personaId) { current -> current.copy(conversation = emptyList()) }

    fun buildPromptContext(
        snapshot: MobileMemorySnapshot,
        maxHighlights: Int,
    ): String = projectPromptContext(snapshot, maxHighlights)

    private fun mutate(
        personaId: String,
        transform: (MobileMemorySnapshot) -> MobileMemorySnapshot,
    ): MobileMemorySnapshot =
        synchronized(lock) {
            val root = loadRoot()
            val current = root.optJSONObject(personaId)?.toSnapshot() ?: MobileMemorySnapshot()
            val next = transform(current)
            root.put(personaId, next.toJson())
            preferences.edit().putString(ROOT_KEY, root.toString()).apply()
            next
        }

    private fun loadRoot(): JSONObject =
        runCatching {
            JSONObject(preferences.getString(ROOT_KEY, "{}").orEmpty())
        }.getOrElse { JSONObject() }

    private fun MobileMemorySnapshot.toJson(): JSONObject =
        JSONObject()
            .put("profile", profile)
            .put(
                "highlights",
                JSONArray().apply {
                    highlights.forEach { entry ->
                        put(
                            JSONObject()
                                .put("createdAt", entry.createdAt)
                                .put("score", entry.score)
                                .put("userText", entry.userText)
                                .put("assistantText", entry.assistantText),
                        )
                    }
                },
            )
            .put(
                "conversation",
                JSONArray().apply {
                    conversation.forEach { message ->
                        put(
                            JSONObject()
                                .put("id", message.id)
                                .put("role", message.role.name)
                                .put("text", message.text),
                        )
                    }
                },
            )

    private fun JSONObject.toSnapshot(): MobileMemorySnapshot {
        val highlightsJson = optJSONArray("highlights") ?: JSONArray()
        val highlights =
            buildList {
                for (index in 0 until highlightsJson.length()) {
                    val entry = highlightsJson.optJSONObject(index) ?: continue
                    val user = normalizeWhitespace(entry.optString("userText"))
                    val assistant = normalizeWhitespace(entry.optString("assistantText"))
                    if (user.isBlank() || assistant.isBlank()) continue
                    add(
                        MobileMemoryHighlight(
                            createdAt = entry.optLong("createdAt"),
                            score = entry.optInt("score").coerceIn(1, 10),
                            userText = user.take(MAX_HIGHLIGHT_SIDE_CHARS),
                            assistantText = assistant.take(MAX_HIGHLIGHT_SIDE_CHARS),
                        ),
                    )
                }
            }.takeLast(MAX_STORED_HIGHLIGHTS)
        val conversationJson = optJSONArray("conversation") ?: JSONArray()
        val conversation =
            buildList {
                for (index in 0 until conversationJson.length()) {
                    val entry = conversationJson.optJSONObject(index) ?: continue
                    val role =
                        runCatching { MessageRole.valueOf(entry.optString("role")) }
                            .getOrNull()
                            ?: continue
                    if (role == MessageRole.SYSTEM) continue
                    val text = entry.optString("text").trim()
                    if (text.isBlank()) continue
                    add(
                        ChatMessage(
                            id = entry.optLong("id"),
                            role = role,
                            text = text.take(MAX_CHAT_MESSAGE_CHARS),
                        ),
                    )
                }
            }.takeLast(MAX_CONVERSATION_MESSAGES)
        return MobileMemorySnapshot(
            profile = normalizeWhitespace(optString("profile")).take(MAX_PROFILE_CHARS),
            highlights = highlights,
            conversation = conversation,
        )
    }

    companion object {
        internal fun projectPromptContext(
            snapshot: MobileMemorySnapshot,
            maxHighlights: Int,
        ): String {
            val selected =
                snapshot.highlights
                    .sortedWith(
                        compareByDescending<MobileMemoryHighlight> { it.score }
                            .thenByDescending { it.createdAt },
                    )
                    .take(maxHighlights.coerceIn(2, 10))
                    .sortedBy { it.createdAt }
            if (snapshot.profile.isBlank() && selected.isEmpty()) return ""

            val output = StringBuilder()
            appendWithinBudget(
                output,
                "Use this local per-persona memory only when relevant. Current user messages override stale memory.\n",
            )
            if (snapshot.profile.isNotBlank()) {
                appendWithinBudget(output, "Pinned user/profile notes: ${snapshot.profile}\n")
            }
            if (selected.isNotEmpty()) {
                appendWithinBudget(output, "Prior conversation highlights:\n")
                selected.forEach { entry ->
                    appendWithinBudget(
                        output,
                        "- User: ${entry.userText}\n  ${entry.assistantText}\n",
                    )
                }
            }
            return output.toString().trim().take(MAX_PROMPT_CHARS)
        }

        private fun appendWithinBudget(
            output: StringBuilder,
            value: String,
        ) {
            val remaining = MAX_PROMPT_CHARS - output.length
            if (remaining <= 0) return
            output.append(value.take(remaining))
        }

        internal fun scoreUserMemory(text: String): Int {
            val normalized = " ${normalizeWhitespace(text).lowercase()} "
            var score = 1
            val durableMarkers =
                listOf(
                    " remember ",
                    " i am ",
                    " i'm ",
                    " my name ",
                    " call me ",
                    " i live ",
                    " i work ",
                    " i like ",
                    " i love ",
                    " i hate ",
                    " i prefer ",
                    " favorite ",
                    " favourite ",
                    " always ",
                    " never ",
                )
            if (durableMarkers.any(normalized::contains)) score += 3
            if (normalized.length >= 100) score += 1
            if (normalized.endsWith("? ")) score -= 1
            return score.coerceIn(1, 5)
        }

        internal fun normalizeWhitespace(value: String): String {
            val output = StringBuilder(value.length)
            var pendingSpace = false
            value.forEach { character ->
                if (character.isWhitespace()) {
                    pendingSpace = output.isNotEmpty()
                } else {
                    if (pendingSpace) output.append(' ')
                    output.append(character)
                    pendingSpace = false
                }
            }
            return output.toString().trim()
        }

        private const val PREFERENCES_NAME = "webwaifu_mobile_memory"
        private const val ROOT_KEY = "persona_memory_v1"
        private const val MAX_PROFILE_CHARS = 1_200
        private const val MAX_HIGHLIGHT_SIDE_CHARS = 320
        private const val MAX_CHAT_MESSAGE_CHARS = 4_000
        private const val MAX_CONVERSATION_MESSAGES = 36
        private const val MAX_STORED_HIGHLIGHTS = 20
        private const val MAX_PROMPT_CHARS = 2_000
    }
}

data class MobileMemorySnapshot(
    val profile: String = "",
    val highlights: List<MobileMemoryHighlight> = emptyList(),
    val conversation: List<ChatMessage> = emptyList(),
)

data class MobileMemoryHighlight(
    val createdAt: Long,
    val score: Int,
    val userText: String,
    val assistantText: String,
)
