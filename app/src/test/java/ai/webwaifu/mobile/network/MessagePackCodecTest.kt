package ai.webwaifu.mobile.network

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class MessagePackCodecTest {
    @Test
    fun roundTripsFishEvents() {
        val audio = byteArrayOf(1, 2, 3, -1)
        val decoded =
            MessagePackCodec.decode(
                MessagePackCodec.encode(
                    mapOf(
                        "event" to "audio",
                        "audio" to audio,
                        "request" to mapOf("sample_rate" to 44_100, "normalize" to true),
                    ),
                ),
            ) as Map<*, *>

        assertEquals("audio", decoded["event"])
        assertArrayEquals(audio, decoded["audio"] as ByteArray)
        assertEquals(44_100L, (decoded["request"] as Map<*, *>)["sample_rate"])
    }
}
