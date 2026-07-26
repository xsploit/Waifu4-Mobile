package ai.webwaifu.mobile.network

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class FishVoiceCatalogClientTest {
    @Test
    fun parsesWaifu4FishVoiceFields() {
        val voices =
            FishVoiceCatalogClient().parse(
                JSONObject(
                    """
                    {
                      "items": [
                        {
                          "_id": "voice-123",
                          "title": "Neuro voice",
                          "description": "A test voice",
                          "tags": ["vtuber", "bright"],
                          "languages": ["en"],
                          "author": {"nickname": "Vedal"}
                        },
                        {"_id": "", "title": "invalid"}
                      ]
                    }
                    """.trimIndent(),
                ),
            )

        assertEquals(1, voices.size)
        assertEquals("voice-123", voices.single().id)
        assertEquals("Neuro voice", voices.single().name)
        assertEquals(listOf("vtuber", "bright"), voices.single().tags)
        assertEquals(listOf("en"), voices.single().languages)
        assertEquals("Vedal", voices.single().source)
    }
}
