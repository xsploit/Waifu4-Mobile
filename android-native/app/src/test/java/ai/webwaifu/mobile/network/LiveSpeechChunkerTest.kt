package ai.webwaifu.mobile.network

import ai.webwaifu.mobile.model.FishLiveChunkingStrategy
import org.junit.Assert.assertEquals
import org.junit.Test

class LiveSpeechChunkerTest {
    @Test
    fun followsWaifu4PhraseBuffering() {
        val chunker = LiveSpeechChunker()

        assertEquals(emptyList<String>(), chunker.push("The little "))
        assertEquals(
            listOf("The little star smiled warmly, "),
            chunker.push("star smiled warmly, "),
        )
        assertEquals(listOf("then waved. "), chunker.push("then waved.") + chunker.finish())
    }

    @Test
    fun eagerModeForwardsEveryRawDeltaImmediately() {
        val chunker = LiveSpeechChunker(FishLiveChunkingStrategy.EAGER)

        assertEquals(listOf("The little "), chunker.push("The little "))
        assertEquals(listOf("star smiled."), chunker.push("star smiled."))
        assertEquals(emptyList<String>(), chunker.finish())
    }

    @Test
    fun safePhraseModeMatchesWaifu4LatencyTestBuffering() {
        val chunker = LiveSpeechChunker(FishLiveChunkingStrategy.SAFE_PHRASE)
        val first = "The little star smiled warmly, "
        val second = "then took one careful breath before saying hello to the morning. "
        val third = "She waited. "

        assertEquals(emptyList<String>(), chunker.push(first))
        assertEquals(emptyList<String>(), chunker.push(second))
        assertEquals(
            listOf(
                "The little star smiled warmly, then took one careful breath before saying hello to the morning. ",
                "She waited. ",
            ),
            chunker.push(third) + chunker.finish(),
        )
    }
}
