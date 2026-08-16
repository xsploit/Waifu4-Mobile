package ai.webwaifu.mobile.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MobileMemoryStoreTest {
    @Test
    fun durableUserFactsOutrankOrdinaryQuestions() {
        val durable = MobileMemoryStore.scoreUserMemory("My name is Tyler and I prefer fast TTS.")
        val ordinary = MobileMemoryStore.scoreUserMemory("What time is it?")

        assertTrue(durable > ordinary)
    }

    @Test
    fun promptProjectionIsBoundedAndKeepsHighestSignalHighlights() {
        val highlights =
            (1L..12L).map { index ->
                MobileMemoryHighlight(
                    createdAt = index,
                    score = if (index == 3L || index == 11L) 5 else 1,
                    userText = "user memory $index " + "x".repeat(280),
                    assistantText = "assistant response $index " + "y".repeat(280),
                )
            }
        val prompt =
            MobileMemoryStore.projectPromptContext(
                MobileMemorySnapshot(
                    profile = "Tyler prioritizes low latency.",
                    highlights = highlights,
                ),
                maxHighlights = 2,
            )

        assertTrue(prompt.length <= 2_000)
        assertTrue(prompt.contains("user memory 3"))
        assertTrue(prompt.contains("user memory 11"))
        assertFalse(prompt.contains("user memory 12"))
    }

    @Test
    fun whitespaceNormalizationDoesNotNeedPatternMatching() {
        assertEquals(
            "one two three",
            MobileMemoryStore.normalizeWhitespace(" one\n\t two   three "),
        )
    }
}
