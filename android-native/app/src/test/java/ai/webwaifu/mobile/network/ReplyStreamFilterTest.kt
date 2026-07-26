package ai.webwaifu.mobile.network

import org.junit.Assert.assertEquals
import org.junit.Test

class ReplyStreamFilterTest {
    @Test
    fun hidesMetadataWhenTagIsSplitAcrossChunks() {
        val filter = ReplyStreamFilter()
        val visible = buildString {
            append(filter.accept("Hello there.<yw-"))
            append(filter.accept("meta>{\"emotion\":\"happy\",\"valence\":0.8,\"arousal\":0.7,\"dominance\":0.2}"))
            append(filter.accept("</yw-meta>"))
            append(filter.finish().visibleTail)
        }

        val result = filter.finish()
        assertEquals("Hello there.", visible)
        assertEquals("happy", result.emotion.name)
        assertEquals(0.8f, result.emotion.valence)
        assertEquals(0.7f, result.emotion.arousal)
        assertEquals(0.2f, result.emotion.dominance)
    }

    @Test
    fun returnsOrdinaryTextWithoutMetadata() {
        val filter = ReplyStreamFilter()
        val visible = filter.accept("A short answer.") + filter.finish().visibleTail

        assertEquals("A short answer.", visible)
    }

    @Test
    fun normalizesMetadataUsingWaifuClientRules() {
        val filter = ReplyStreamFilter()
        filter.accept(
            "<yw-meta>{\"emotion\":\"not-an-emotion\",\"valence\":2,\"arousal\":-1,\"dominance\":0.2}</yw-meta>",
        )

        val result = filter.finish()
        assertEquals("neutral", result.emotion.name)
        assertEquals(1f, result.emotion.valence)
        assertEquals(0f, result.emotion.arousal)
        assertEquals(0.2f, result.emotion.dominance)
    }
}
