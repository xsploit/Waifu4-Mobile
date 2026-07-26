package ai.webwaifu.mobile.network

import ai.webwaifu.mobile.model.AiProvider
import ai.webwaifu.mobile.model.AppSettings
import ai.webwaifu.mobile.model.ChatMessage
import ai.webwaifu.mobile.model.MessageRole
import ai.webwaifu.mobile.model.OpenRouterRouting
import ai.webwaifu.mobile.model.ProviderEndpoint
import ai.webwaifu.mobile.model.ProviderModel
import ai.webwaifu.mobile.model.ProviderReasoningInfo
import ai.webwaifu.mobile.model.VercelRouting
import java.io.BufferedReader
import java.io.StringReader
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

class AiGatewayClientTest {
    private val client = AiGatewayClient()

    @Test
    fun openRouterPinnedRoutingUsesOnlyAndFallbackFlag() {
        val request =
            client.buildRequest(
                settings =
                    AppSettings(
                        provider = AiProvider.OPENROUTER,
                        openRouterRouting = OpenRouterRouting.PINNED,
                        openRouterProviderSlugs = "anthropic, google",
                        openRouterAllowFallbacks = false,
                    ),
                byokOpenAiKey = null,
                modelInfo =
                    ProviderModel(
                        id = "openai/gpt-4o-mini",
                        reasoning = ProviderReasoningInfo(mandatory = false),
                    ),
                messages = emptyList(),
                replyFormat = AiGatewayClient.ReplyFormat.TEXT,
                transport = AiGatewayClient.StructuredTransport.NATIVE,
            )

        val provider = request.getJSONObject("provider")
        val only = provider.getJSONArray("only")
        assertEquals("anthropic", only.getString(0))
        assertEquals("google", only.getString(1))
        assertFalse(provider.getBoolean("allow_fallbacks"))
        assertEquals("none", request.getJSONObject("reasoning").getString("effort"))
        assertFalse(request.getJSONObject("reasoning").has("exclude"))
    }

    @Test
    fun vercelThroughputRoutingUsesGatewayTpsSort() {
        val request =
            client.buildRequest(
                settings =
                    AppSettings(
                        provider = AiProvider.VERCEL,
                        vercelRouting = VercelRouting.THROUGHPUT,
                    ),
                byokOpenAiKey = null,
                modelInfo = null,
                messages = emptyList(),
                replyFormat = AiGatewayClient.ReplyFormat.TEXT,
                transport = AiGatewayClient.StructuredTransport.NATIVE,
            )

        val gateway =
            request
                .getJSONObject("providerOptions")
                .getJSONObject("gateway")
        assertEquals("tps", gateway.getString("sort"))
        assertEquals("auto", gateway.getString("caching"))
    }

    @Test
    fun vercelPinnedRoutingMatchesWaifuFallbackSemantics() {
        val pinnedWithFallbacks =
            client.buildRequest(
                settings =
                    AppSettings(
                        provider = AiProvider.VERCEL,
                        vercelRouting = VercelRouting.PINNED,
                        vercelProviderSlugs = "openai, anthropic",
                        vercelAllowFallbacks = true,
                    ),
                byokOpenAiKey = null,
                modelInfo = null,
                messages = emptyList(),
                replyFormat = AiGatewayClient.ReplyFormat.TEXT,
                transport = AiGatewayClient.StructuredTransport.NATIVE,
            )
        val orderedGateway =
            pinnedWithFallbacks
                .getJSONObject("providerOptions")
                .getJSONObject("gateway")
        assertTrue(orderedGateway.has("order"))
        assertFalse(orderedGateway.has("only"))
        assertFalse(orderedGateway.has("sort"))

        val pinnedOnly =
            client.buildRequest(
                settings =
                    AppSettings(
                        provider = AiProvider.VERCEL,
                        vercelRouting = VercelRouting.PINNED,
                        vercelProviderSlugs = "openai",
                        vercelAllowFallbacks = false,
                    ),
                byokOpenAiKey = null,
                modelInfo = null,
                messages = emptyList(),
                replyFormat = AiGatewayClient.ReplyFormat.TEXT,
                transport = AiGatewayClient.StructuredTransport.NATIVE,
            )
        val onlyGateway =
            pinnedOnly
                .getJSONObject("providerOptions")
                .getJSONObject("gateway")
        assertTrue(onlyGateway.has("only"))
        assertFalse(onlyGateway.has("order"))
    }

    @Test
    fun vercelModelSpecificOptionsMatchWaifu() {
        val openAi =
            client.buildRequest(
                settings =
                    AppSettings(
                        provider = AiProvider.VERCEL,
                        vercelModel = "openai/gpt-5-nano",
                    ),
                byokOpenAiKey = null,
                modelInfo = null,
                messages = emptyList(),
                replyFormat = AiGatewayClient.ReplyFormat.TEXT,
                transport = AiGatewayClient.StructuredTransport.NATIVE,
            )
        assertEquals(
            "minimal",
            openAi
                .getJSONObject("providerOptions")
                .getJSONObject("openai")
                .getString("reasoningEffort"),
        )
        assertFalse(openAi.has("temperature"))

        val deepSeek =
            client.buildRequest(
                settings =
                    AppSettings(
                        provider = AiProvider.VERCEL,
                        vercelModel = "deepseek/deepseek-v3.2",
                    ),
                byokOpenAiKey = null,
                modelInfo = null,
                messages = emptyList(),
                replyFormat = AiGatewayClient.ReplyFormat.TEXT,
                transport = AiGatewayClient.StructuredTransport.NATIVE,
            )
        assertEquals(
            "disabled",
            deepSeek
                .getJSONObject("providerOptions")
                .getJSONObject("deepseek")
                .getJSONObject("thinking")
                .getString("type"),
        )
    }

    @Test
    fun openRouterAutoRoutingDoesNotSendAnEmptyProviderObject() {
        val request =
            client.buildRequest(
                settings =
                    AppSettings(
                        provider = AiProvider.OPENROUTER,
                        openRouterRouting = OpenRouterRouting.AUTO,
                    ),
                byokOpenAiKey = null,
                modelInfo = null,
                messages = emptyList(),
                replyFormat = AiGatewayClient.ReplyFormat.TEXT,
                transport = AiGatewayClient.StructuredTransport.NATIVE,
            )

        assertFalse(request.has("provider"))
    }

    @Test
    fun capabilityLaneSelectionMatchesWaifu() {
        val settings = AppSettings(provider = AiProvider.OPENROUTER)
        assertEquals(
            AiGatewayClient.ReplyFormat.STRUCTURED,
            client.selectReplyFormat(
                settings,
                ProviderModel(id = "model", supportsStructuredOutputs = true),
                emptyList(),
            ),
        )
        assertEquals(
            AiGatewayClient.ReplyFormat.TEXT,
            client.selectReplyFormat(settings, ProviderModel(id = "model"), emptyList()),
        )

        val vercel = AppSettings(provider = AiProvider.VERCEL)
        assertEquals(
            AiGatewayClient.ReplyFormat.STRUCTURED,
            client.selectReplyFormat(
                vercel,
                null,
                listOf(
                    ProviderEndpoint(
                        providerName = "one",
                        supportedParameters = setOf("response_format"),
                    ),
                    ProviderEndpoint(
                        providerName = "two",
                        supportedParameters = setOf("json_schema"),
                    ),
                ),
            ),
        )
        assertEquals(
            AiGatewayClient.ReplyFormat.TEXT,
            client.selectReplyFormat(
                vercel,
                null,
                listOf(ProviderEndpoint(providerName = "one")),
            ),
        )
    }

    @Test
    fun structuredRequestUsesStrictJsonSchemaAndRequireParameters() {
        val request =
            client.buildRequest(
                settings = AppSettings(provider = AiProvider.OPENROUTER),
                byokOpenAiKey = null,
                modelInfo = ProviderModel(id = "model"),
                messages = emptyList(),
                replyFormat = AiGatewayClient.ReplyFormat.STRUCTURED,
                transport = AiGatewayClient.StructuredTransport.NATIVE,
            )
        assertEquals(
            "json_schema",
            request.getJSONObject("response_format").getString("type"),
        )
        assertTrue(request.getJSONObject("provider").getBoolean("require_parameters"))
    }

    @Test
    fun vercelRequestUsesPinnedAiSdkV4WireProtocol() {
        val headers = client.vercelProtocolHeaders("deepseek/deepseek-v4-pro")
        assertEquals("0.0.1", headers["ai-gateway-protocol-version"])
        assertEquals("api-key", headers["ai-gateway-auth-method"])
        assertEquals("4", headers["ai-language-model-specification-version"])
        assertEquals("deepseek/deepseek-v4-pro", headers["ai-language-model-id"])
        assertEquals("true", headers["ai-language-model-streaming"])

        val request =
            client.buildRequest(
                settings =
                    AppSettings(
                        provider = AiProvider.VERCEL,
                        vercelModel = "deepseek/deepseek-v4-pro",
                        maxTokens = 420,
                    ),
                byokOpenAiKey = null,
                modelInfo = null,
                messages = listOf(ChatMessage(1, MessageRole.USER, "hello")),
                replyFormat = AiGatewayClient.ReplyFormat.STRUCTURED,
                transport = AiGatewayClient.StructuredTransport.STRICT_TOOL,
            )

        assertFalse(request.has("model"))
        assertFalse(request.has("messages"))
        assertFalse(request.has("stream"))
        assertEquals(420, request.getInt("maxOutputTokens"))
        assertEquals("system", request.getJSONArray("prompt").getJSONObject(0).getString("role"))
        assertEquals(
            "hello",
            request
                .getJSONArray("prompt")
                .getJSONObject(1)
                .getJSONArray("content")
                .getJSONObject(0)
                .getString("text"),
        )
        val tool = request.getJSONArray("tools").getJSONObject(0)
        assertEquals("function", tool.getString("type"))
        assertEquals("assistant_reply", tool.getString("name"))
        assertTrue(tool.has("inputSchema"))
        assertFalse(tool.has("function"))
        assertEquals("required", request.getJSONObject("toolChoice").getString("type"))
        assertEquals(
            "disabled",
            request
                .getJSONObject("providerOptions")
                .getJSONObject("deepseek")
                .getJSONObject("thinking")
                .getString("type"),
        )
    }

    @Test
    fun vercelAiSdkStreamIgnoresReasoningAndParsesStrictReplyTool() {
        val sse =
            """
            data: {"type":"reasoning-start","id":"reasoning-1"}

            data: {"type":"reasoning-delta","id":"reasoning-1","delta":"hidden chain"}

            data: {"type":"reasoning-end","id":"reasoning-1"}

            data: {"type":"tool-input-start","id":"call-1","toolName":"assistant_reply"}

            data: {"type":"tool-input-delta","id":"call-1","delta":"{\"message\":\"Hey there\",\"emotion\":\"amused\",\"valence\":0.6,\"arousal\":0.5,\"dominance\":0.1}"}

            data: {"type":"tool-input-end","id":"call-1"}

            data: {"type":"finish","finishReason":{"unified":"tool-calls"}}

            """.trimIndent()
        val visible = StringBuilder()

        val result =
            client.consumeVercelAiSdkStream(
                reader = BufferedReader(StringReader(sse)),
                replyFormat = AiGatewayClient.ReplyFormat.STRUCTURED,
                transport = AiGatewayClient.StructuredTransport.STRICT_TOOL,
                onDelta = visible::append,
            )

        assertEquals("Hey there", visible.toString())
        assertEquals("amused", result.emotion.name)
        assertEquals(AiGatewayClient.ReplyFormat.STRUCTURED, result.replyFormat)
    }

    @Test
    fun vercelEmptyTextReportsSafeStreamShape() {
        val sse =
            """
            data: {"type":"reasoning-start","id":"reasoning-1"}

            data: {"type":"reasoning-delta","id":"reasoning-1","delta":"private reasoning"}

            data: {"type":"reasoning-end","id":"reasoning-1"}

            data: {"type":"finish","finishReason":{"unified":"length","raw":"max_tokens"}}

            """.trimIndent()

        val error =
            assertThrows(AiGatewayClient.ProviderException::class.java) {
                client.consumeVercelAiSdkStream(
                    reader = BufferedReader(StringReader(sse)),
                    replyFormat = AiGatewayClient.ReplyFormat.TEXT,
                    transport = AiGatewayClient.StructuredTransport.NATIVE,
                    onDelta = {},
                )
            }

        assertTrue(error.message.orEmpty().contains("reasoning-delta=1"))
        assertTrue(error.message.orEmpty().contains("reasoning-chars=17"))
        assertTrue(error.message.orEmpty().contains("finish=length"))
        assertFalse(error.message.orEmpty().contains("private reasoning"))
    }

}
