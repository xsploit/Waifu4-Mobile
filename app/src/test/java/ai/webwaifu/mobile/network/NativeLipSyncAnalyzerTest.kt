package ai.webwaifu.mobile.network

import kotlin.math.PI
import kotlin.math.sin
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeLipSyncAnalyzerTest {
    @Test
    fun `first playback block produces a lipsync frame before audio is written`() {
        val analyzer = NativeLipSyncAnalyzer.fromJson(PROFILE_JSON, 44_100)
        val pcm = ByteArray(2_048)
        for (sampleIndex in 0 until 1_024) {
            val sample =
                (sin(2.0 * PI * 220.0 * sampleIndex / 44_100.0) * Short.MAX_VALUE * 0.45)
                    .toInt()
            pcm[sampleIndex * 2] = (sample and 0xff).toByte()
            pcm[sampleIndex * 2 + 1] = ((sample ushr 8) and 0xff).toByte()
        }

        val frames = analyzer.consume(pcm)

        assertEquals(1, frames.size)
        assertTrue(frames.single().amplitude > 0f)
    }

    private companion object {
        val PROFILE_JSON =
            """
            {
              "targetSampleRate": 16000,
              "sampleCount": 1024,
              "melFilterBankChannels": 20,
              "mfccs": [
                {
                  "name": "A",
                  "mfccCalibrationDataList": [
                    { "array": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
                  ]
                }
              ]
            }
            """.trimIndent()
    }
}
