package ai.webwaifu.mobile.network

import ai.webwaifu.mobile.model.FishLiveChunkingStrategy

internal class LiveSpeechChunker(
    private val strategy: FishLiveChunkingStrategy = FishLiveChunkingStrategy.FAST_PHRASE,
) {
    private val pending = StringBuilder()
    private val minLength =
        if (strategy == FishLiveChunkingStrategy.SAFE_PHRASE) 160 else 28
    private val maxLength =
        if (strategy == FishLiveChunkingStrategy.SAFE_PHRASE) 240 else 180

    fun push(delta: String): List<String> {
        if (strategy == FishLiveChunkingStrategy.EAGER) {
            return if (delta.isEmpty()) emptyList() else listOf(delta)
        }
        if (delta.isNotEmpty()) pending.append(delta)
        return extract(force = false)
    }

    fun finish(): List<String> =
        if (strategy == FishLiveChunkingStrategy.EAGER) emptyList() else extract(force = true)

    private fun extract(force: Boolean): List<String> {
        val chunks = mutableListOf<String>()
        while (pending.toString().trim().isNotEmpty()) {
            if (!force && pending.length < minLength) break
            val window = pending.substring(0, minOf(maxLength, pending.length))
            var splitAt =
                if (strategy == FishLiveChunkingStrategy.SAFE_PHRASE) {
                    findSentenceBoundary(window)
                } else {
                    findFastBoundary(window)
                }
            if (splitAt < 0 && pending.length >= maxLength) {
                splitAt =
                    if (strategy == FishLiveChunkingStrategy.SAFE_PHRASE) {
                        findSafeSoftBoundary(window)
                    } else {
                        val lastSpace = window.lastIndexOf(' ')
                        if (lastSpace >= minLength) lastSpace + 1 else maxLength
                    }
            }
            if (splitAt < 0) {
                if (!force) break
                splitAt = pending.length
            }
            val chunk = pending.substring(0, splitAt).replace(WHITESPACE, " ").trim()
            pending.delete(0, splitAt)
            while (pending.isNotEmpty() && pending.first().isWhitespace()) pending.deleteCharAt(0)
            if (chunk.isNotEmpty()) chunks += "$chunk "
        }
        return chunks
    }

    private fun findFastBoundary(text: String): Int {
        var best = -1
        FAST_BOUNDARY.findAll(text).forEach { match ->
            if (match.range.first >= minLength) best = match.range.last + 1
        }
        return best
    }

    private fun findSentenceBoundary(text: String): Int {
        text.forEachIndexed { index, character ->
            if (character !in ".?!") return@forEachIndexed
            if (
                character == '.' &&
                (isDecimalPoint(text, index) ||
                    lastWordFragment(text.substring(0, index + 1)) in ABBREVIATIONS)
            ) {
                return@forEachIndexed
            }
            val next = text.getOrNull(index + 1)
            if (next == null || next.isWhitespace() || next in "\"')]}") {
                return index + 1
            }
        }
        return -1
    }

    private fun findSafeSoftBoundary(text: String): Int {
        listOf(", ", "; ", ": ", " - ", " ").forEach { delimiter ->
            val index = text.lastIndexOf(delimiter)
            if (index >= minLength) return index + delimiter.length
        }
        return maxLength
    }

    private fun isDecimalPoint(text: String, index: Int): Boolean =
        text.getOrNull(index - 1)?.isDigit() == true &&
            text.getOrNull(index + 1)?.isDigit() == true

    private fun lastWordFragment(text: String): String =
        LAST_WORD.find(text)?.value.orEmpty().lowercase()

    companion object {
        private val ABBREVIATIONS =
            setOf("dr.", "mr.", "mrs.", "ms.", "prof.", "sr.", "jr.", "vs.", "etc.")
        private val FAST_BOUNDARY = Regex("""[.!?]["')\]]?\s+|[,;:]\s+|\n+""")
        private val LAST_WORD = Regex("""[A-Za-z]+\.$""")
        private val WHITESPACE = Regex("""\s+""")
    }
}
