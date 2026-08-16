package ai.webwaifu.mobile.network

import org.junit.Assert.assertEquals
import org.junit.Test

class StructuredReplyParserTest {
    @Test
    fun streamsOnlyMessageAcrossSplitEscapes() {
        val parser = StructuredReplyParser()
        val visible = StringBuilder()
        listOf(
            """{"mes""",
            """sage":"Hello \""",
            """"there\u0021","emotion":"amused","valence":0.5,"arousal":0.4,"dominance":0.2}""",
        ).forEach { visible.append(parser.push(it)) }

        val result = parser.finish()
        assertEquals("Hello \"there!", visible.toString())
        assertEquals("Hello \"there!", result.message)
        assertEquals("amused", result.emotion.name)
        assertEquals(0.5f, result.emotion.valence)
    }

    @Test
    fun invalidTailRecoversAlreadyStreamedMessage() {
        val parser = StructuredReplyParser()
        assertEquals("Still usable", parser.push("""{"message":"Still usable"""))
        assertEquals("Still usable", parser.finish().message)
    }
}
