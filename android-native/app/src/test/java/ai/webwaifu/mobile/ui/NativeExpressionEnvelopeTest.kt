package ai.webwaifu.mobile.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeExpressionEnvelopeTest {
    @Test
    fun attacksHoldsReleasesAndResetsLikeWaifu4() {
        assertEquals(0f, facialExpressionEnvelope(0L), 0.0001f)
        assertEquals(0.5f, facialExpressionEnvelope(70L), 0.0001f)
        assertEquals(1f, facialExpressionEnvelope(140L), 0.0001f)
        assertEquals(1f, facialExpressionEnvelope(2_300L), 0.0001f)
        assertTrue(facialExpressionEnvelope(2_750L) in 0.49f..0.51f)
        assertEquals(0f, facialExpressionEnvelope(3_200L), 0.0001f)
        assertEquals(0f, facialExpressionEnvelope(10_000L), 0.0001f)
    }
}
