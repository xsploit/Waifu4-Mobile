package ai.webwaifu.mobile.data

import ai.webwaifu.mobile.model.AiProvider
import ai.webwaifu.mobile.model.FishLatency
import ai.webwaifu.mobile.model.FishLiveChunkingStrategy
import ai.webwaifu.mobile.model.LipSyncMode
import ai.webwaifu.mobile.model.ReplyLength
import org.junit.Assert.assertEquals
import org.junit.Test

class LocalTransferImporterTest {
    @Test
    fun mapsWaifu4PipelineKeys() {
        val credentials =
            parseLocalTransferCredentials(
                """
                {
                  "kind": "local-transfer-backup",
                  "providerSecrets": [
                    {"keyName": "aiGateway.apiKey", "secret": "gateway-test"},
                    {"keyName": "fishSpeech.apiKey", "secret": "fish-test"},
                    {"keyName": "openrouter.apiKey", "secret": "router-test"},
                    {"keyName": "tavily.apiKey", "secret": "tavily-test"}
                  ]
                }
                """.trimIndent(),
            )

        assertEquals("gateway-test", credentials[SecureKeyStore.VERCEL_KEY])
        assertEquals("fish-test", credentials[SecureKeyStore.FISH_KEY])
        assertEquals("router-test", credentials[SecureKeyStore.OPENROUTER_KEY])
        assertEquals("tavily-test", credentials[SecureKeyStore.TAVILY_KEY])
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsUnrelatedJson() {
        parseLocalTransferCredentials("""{"providerSecrets": []}""")
    }

    @Test
    fun importsWaifu4AiFishAndPersonaSettings() {
        val root =
            org.json.JSONObject(
                """
                {
                  "state": {
                    "activePersonaId": "hikari-chan",
                    "personaVoiceBindings": {
                      "hikari-chan": {
                        "provider": "fish-speech",
                        "voiceId": "bound-fish-voice",
                        "modelId": "s2.1-pro-free"
                      }
                    },
                    "aiSettings": {
                      "llmProvider": "openrouter-responses",
                      "model": "anthropic/claude-sonnet-4",
                      "replyLength": "yap",
                      "runtimeSituation": "Local phone chat",
                      "fishSpeechVoiceId": "",
                      "fishSpeechLatency": "normal",
                      "fishSpeechSampleRate": 24000,
                      "fishSpeechConditionOnPreviousChunks": false,
                      "fishSpeechChunkLength": 220,
                      "fishSpeechLiveChunkingStrategy": "eager",
                      "ttsEnabled": true,
                      "ttsAutoSpeak": true,
                      "lipSyncMode": "direct",
                      "lipSyncSmoothing": 0.3,
                      "temperature": 0.7,
                      "maxTokens": 420
                    },
                    "visualSettings": {
                      "colorCorr": true,
                      "sceneExposure": 1.2,
                      "colorPowR": 1.25,
                      "colorPowG": 1.35,
                      "colorPowB": 1.5
                    },
                    "sequencerSettings": {
                      "playing": true,
                      "shuffle": false,
                      "loop": false,
                      "speed": 1.4,
                      "duration": 14,
                      "currentIndex": 0,
                      "playlist": [
                        {
                          "url": "/assets/animations/sachi-vrma/CC0animationwave04.vrma"
                        }
                      ]
                    }
                  }
                }
                """.trimIndent(),
            )

        val settings = parseLocalTransferSettings(root)
        assertEquals(AiProvider.OPENROUTER, settings.provider)
        assertEquals("anthropic/claude-sonnet-4", settings.openRouterModel)
        assertEquals("hikari-chan", settings.activePersonaId)
        assertEquals("bound-fish-voice", settings.fishVoiceId)
        assertEquals("s2.1-pro-free", settings.fishModel)
        assertEquals(FishLatency.NORMAL, settings.fishLatency)
        assertEquals(24_000, settings.fishSampleRate)
        assertEquals(false, settings.fishConditionOnPreviousChunks)
        assertEquals(FishLiveChunkingStrategy.EAGER, settings.fishLiveChunkingStrategy)
        assertEquals(LipSyncMode.DIRECT, settings.lipSyncMode)
        assertEquals(ReplyLength.YAP, settings.replyLength)
        assertEquals(420, settings.maxTokens)
        assertEquals(true, settings.colorCorrectionEnabled)
        assertEquals(1.2f, settings.sceneExposure)
        assertEquals(1.25f, settings.colorPowerR)
        assertEquals(1.35f, settings.colorPowerG)
        assertEquals(1.5f, settings.colorPowerB)
        assertEquals(false, settings.animationShuffle)
        assertEquals(false, settings.animationLoop)
        assertEquals(1.4f, settings.animationSpeed)
        assertEquals(14f, settings.animationDurationSeconds)
        assertEquals(
            "animations/sachi-vrma/CC0animationwave04.vrma",
            settings.selectedAnimationAsset,
        )
    }
}
