package ai.webwaifu.mobile.data

import android.content.Context
import ai.webwaifu.mobile.model.AiProvider
import ai.webwaifu.mobile.model.AppSettings
import ai.webwaifu.mobile.model.CameraViewMode
import ai.webwaifu.mobile.model.FishLatency
import ai.webwaifu.mobile.model.FishLiveChunkingStrategy
import ai.webwaifu.mobile.model.FishVoiceScope
import ai.webwaifu.mobile.model.LipSyncMode
import ai.webwaifu.mobile.model.OpenRouterRouting
import ai.webwaifu.mobile.model.ReasoningEffort
import ai.webwaifu.mobile.model.ReplyLength
import ai.webwaifu.mobile.model.ToolChoiceMode
import ai.webwaifu.mobile.model.VercelRouting

class SettingsStore(context: Context) {
    private val preferences =
        context.getSharedPreferences("webwaifu_mobile_settings", Context.MODE_PRIVATE)

    fun load(): AppSettings {
        val defaults = AppSettings()
        val storedFishModel =
            preferences.getString("fish_model", defaults.fishModel)
                ?.trim()
                .orEmpty()
                .ifBlank { defaults.fishModel }
        val fishDefaultMigrationPending =
            !preferences.getBoolean("fish_s21_free_default_migrated", false)
        val migratedFishModel =
            if (fishDefaultMigrationPending && storedFishModel == "s2-pro") {
                "s2.1-pro-free"
            } else {
                storedFishModel
            }
        if (fishDefaultMigrationPending) {
            preferences.edit()
                .putBoolean("fish_s21_free_default_migrated", true)
                .putString("fish_model", migratedFishModel)
                .apply()
        }
        return AppSettings(
            provider = enumValueOrDefault(
                preferences.getString("provider", null),
                defaults.provider,
            ),
            activePersonaId =
                preferences.getString("active_persona_id", defaults.activePersonaId)
                    ?.trim()
                    .orEmpty()
                    .ifBlank { defaults.activePersonaId },
            openRouterModel =
                preferences.getString("openrouter_model", defaults.openRouterModel)
                    ?.trim()
                    .orEmpty()
                    .ifBlank { defaults.openRouterModel },
            vercelModel =
                preferences.getString("vercel_model", defaults.vercelModel)
                    ?.trim()
                    .orEmpty()
                    .ifBlank { defaults.vercelModel },
            openRouterRouting = enumValueOrDefault(
                preferences.getString("openrouter_routing", null),
                defaults.openRouterRouting,
            ),
            openRouterProviderSlugs =
                preferences.getString("openrouter_provider_slugs", "")?.trim().orEmpty(),
            openRouterAllowFallbacks =
                preferences.getBoolean(
                    "openrouter_allow_fallbacks",
                    defaults.openRouterAllowFallbacks,
                ),
            vercelRouting = enumValueOrDefault(
                preferences.getString("vercel_routing", null),
                defaults.vercelRouting,
            ),
            vercelProviderSlugs =
                preferences.getString("vercel_provider_slugs", "")?.trim().orEmpty(),
            vercelAllowFallbacks =
                preferences.getBoolean("vercel_allow_fallbacks", defaults.vercelAllowFallbacks),
            reasoningEffort =
                enumValueOrDefault(
                    preferences.getString("reasoning_effort", null),
                    defaults.reasoningEffort,
                ),
            toolChoiceMode =
                enumValueOrDefault(
                    preferences.getString("tool_choice_mode", null),
                    defaults.toolChoiceMode,
                ),
            maxToolRounds =
                preferences.getInt("max_tool_rounds", defaults.maxToolRounds).coerceIn(1, 30),
            runtimeSituation =
                preferences.getString("runtime_situation", defaults.runtimeSituation)
                    ?.trim()
                    .orEmpty()
                    .take(2_000),
            replyLength =
                enumValueOrDefault(
                    preferences.getString("reply_length", null),
                    defaults.replyLength,
                ),
            fishVoiceId = preferences.getString("fish_voice_id", "")?.trim().orEmpty(),
            fishVoiceScope =
                enumValueOrDefault(
                    preferences.getString("fish_voice_scope", null),
                    defaults.fishVoiceScope,
                ),
            fishModel = migratedFishModel,
            fishLatency =
                enumValueOrDefault(
                    preferences.getString("fish_latency", null),
                    defaults.fishLatency,
                ),
            fishSampleRate =
                preferences.getInt("fish_sample_rate", defaults.fishSampleRate)
                    .coerceIn(16_000, 48_000),
            fishConditionOnPreviousChunks =
                preferences.getBoolean(
                    "fish_condition_previous",
                    defaults.fishConditionOnPreviousChunks,
                ),
            fishChunkLength =
                preferences.getInt("fish_chunk_length", defaults.fishChunkLength)
                    .coerceIn(100, 300),
            fishLiveChunkingStrategy =
                enumValueOrDefault(
                    preferences.getString("fish_live_chunking_strategy", null),
                    defaults.fishLiveChunkingStrategy,
                ),
            voiceEnabled = preferences.getBoolean("voice_enabled", defaults.voiceEnabled),
            voiceAutoSpeak =
                preferences.getBoolean("voice_auto_speak", defaults.voiceAutoSpeak),
            lipSyncMode =
                enumValueOrDefault(
                    preferences.getString("lip_sync_mode", null),
                    defaults.lipSyncMode,
                ),
            lipSyncSmoothing =
                preferences.getFloat("lip_sync_smoothing", defaults.lipSyncSmoothing)
                    .coerceIn(0f, 0.95f),
            lipSyncGain =
                preferences.getFloat("lip_sync_gain", defaults.lipSyncGain)
                    .coerceIn(0f, 2f),
            lipSyncVolumeInfluence =
                preferences.getFloat(
                    "lip_sync_volume_influence",
                    defaults.lipSyncVolumeInfluence,
                ).coerceIn(0f, 2f),
            animationPlaying =
                preferences.getBoolean("animation_playing", defaults.animationPlaying),
            animationShuffle =
                preferences.getBoolean("animation_shuffle", defaults.animationShuffle),
            animationLoop =
                preferences.getBoolean("animation_loop", defaults.animationLoop),
            animationSpeed =
                preferences.getFloat("animation_speed", defaults.animationSpeed)
                    .coerceIn(0.1f, 3f),
            animationDurationSeconds =
                preferences.getFloat(
                    "animation_duration_seconds",
                    defaults.animationDurationSeconds,
                ).coerceIn(3f, 60f),
            selectedAnimationAsset =
                preferences.getString(
                    "selected_animation_asset",
                    defaults.selectedAnimationAsset,
                )?.trim().orEmpty().ifBlank { defaults.selectedAnimationAsset },
            postProcessingEnabled =
                preferences.getBoolean(
                    "post_processing_enabled",
                    defaults.postProcessingEnabled,
                ),
            colorCorrectionEnabled =
                preferences.getBoolean(
                    "color_correction_enabled",
                    defaults.colorCorrectionEnabled,
                ),
            sceneExposure =
                preferences.getFloat("scene_exposure", defaults.sceneExposure)
                    .coerceIn(0.35f, 1.8f),
            colorPowerR =
                preferences.getFloat("color_power_r", defaults.colorPowerR)
                    .coerceIn(1f, 2f),
            colorPowerG =
                preferences.getFloat("color_power_g", defaults.colorPowerG)
                    .coerceIn(1f, 2f),
            colorPowerB =
                preferences.getFloat("color_power_b", defaults.colorPowerB)
                    .coerceIn(1f, 2f),
            bloomEnabled =
                preferences.getBoolean("bloom_enabled", defaults.bloomEnabled),
            bloomStrength =
                preferences.getFloat("bloom_strength", defaults.bloomStrength)
                    .coerceIn(0f, 1f),
            vignetteEnabled =
                preferences.getBoolean("vignette_enabled", defaults.vignetteEnabled),
            vignetteStrength =
                preferences.getFloat("vignette_strength", defaults.vignetteStrength)
                    .coerceIn(0f, 1f),
            ambientOcclusionEnabled =
                preferences.getBoolean(
                    "ambient_occlusion_enabled",
                    defaults.ambientOcclusionEnabled,
                ),
            ambientOcclusionIntensity =
                preferences.getFloat(
                    "ambient_occlusion_intensity",
                    defaults.ambientOcclusionIntensity,
                ).coerceIn(0f, 2f),
            dynamicResolutionEnabled =
                preferences.getBoolean(
                    "dynamic_resolution_enabled",
                    defaults.dynamicResolutionEnabled,
                ),
            memoryEnabled =
                preferences.getBoolean("memory_enabled", defaults.memoryEnabled),
            memoryMaxHighlights =
                preferences.getInt("memory_max_highlights", defaults.memoryMaxHighlights)
                    .coerceIn(2, 10),
            cameraViewMode =
                enumValueOrDefault(
                    preferences.getString("camera_view_mode", null),
                    defaults.cameraViewMode,
                ),
            avatarScale =
                preferences.getFloat("avatar_scale", defaults.avatarScale).coerceIn(0.35f, 2f),
            avatarPositionX =
                preferences.getFloat("avatar_position_x", defaults.avatarPositionX)
                    .coerceIn(-3f, 3f),
            avatarVerticalOffset =
                preferences.getFloat("avatar_vertical_offset", defaults.avatarVerticalOffset)
                    .coerceIn(-2f, 2f),
            avatarPositionZ =
                preferences.getFloat("avatar_position_z", defaults.avatarPositionZ)
                    .coerceIn(-3f, 3f),
            avatarRotationX =
                preferences.getFloat("avatar_rotation_x", defaults.avatarRotationX)
                    .coerceIn(-45f, 45f),
            avatarRotationY =
                preferences.getFloat("avatar_rotation_y", defaults.avatarRotationY)
                    .coerceIn(-180f, 180f),
            avatarRotationZ =
                preferences.getFloat("avatar_rotation_z", defaults.avatarRotationZ)
                    .coerceIn(-45f, 45f),
            temperature = preferences.getFloat("temperature", defaults.temperature),
            maxTokens = preferences.getInt("max_tokens", defaults.maxTokens),
        )
    }

    fun save(settings: AppSettings) {
        preferences.edit()
            .putString("provider", settings.provider.name)
            .putString("active_persona_id", settings.activePersonaId)
            .putString("openrouter_model", settings.openRouterModel.trim())
            .putString("vercel_model", settings.vercelModel.trim())
            .putString("openrouter_routing", settings.openRouterRouting.name)
            .putString("openrouter_provider_slugs", settings.openRouterProviderSlugs.trim())
            .putBoolean("openrouter_allow_fallbacks", settings.openRouterAllowFallbacks)
            .putString("vercel_routing", settings.vercelRouting.name)
            .putString("vercel_provider_slugs", settings.vercelProviderSlugs.trim())
            .putBoolean("vercel_allow_fallbacks", settings.vercelAllowFallbacks)
            .putString("reasoning_effort", settings.reasoningEffort.name)
            .putString("tool_choice_mode", settings.toolChoiceMode.name)
            .putInt("max_tool_rounds", settings.maxToolRounds.coerceIn(1, 30))
            .putString("runtime_situation", settings.runtimeSituation.trim().take(2_000))
            .putString("reply_length", settings.replyLength.name)
            .putString("fish_voice_id", settings.fishVoiceId.trim())
            .putString("fish_voice_scope", settings.fishVoiceScope.name)
            .putString("fish_model", settings.fishModel.trim())
            .putString("fish_latency", settings.fishLatency.name)
            .putInt("fish_sample_rate", settings.fishSampleRate)
            .putBoolean(
                "fish_condition_previous",
                settings.fishConditionOnPreviousChunks,
            )
            .putInt("fish_chunk_length", settings.fishChunkLength)
            .putString(
                "fish_live_chunking_strategy",
                settings.fishLiveChunkingStrategy.name,
            )
            .putBoolean("voice_enabled", settings.voiceEnabled)
            .putBoolean("voice_auto_speak", settings.voiceAutoSpeak)
            .putString("lip_sync_mode", settings.lipSyncMode.name)
            .putFloat("lip_sync_smoothing", settings.lipSyncSmoothing)
            .putFloat("lip_sync_gain", settings.lipSyncGain)
            .putFloat("lip_sync_volume_influence", settings.lipSyncVolumeInfluence)
            .putBoolean("animation_playing", settings.animationPlaying)
            .putBoolean("animation_shuffle", settings.animationShuffle)
            .putBoolean("animation_loop", settings.animationLoop)
            .putFloat("animation_speed", settings.animationSpeed.coerceIn(0.1f, 3f))
            .putFloat(
                "animation_duration_seconds",
                settings.animationDurationSeconds.coerceIn(3f, 60f),
            )
            .putString("selected_animation_asset", settings.selectedAnimationAsset)
            .putBoolean("post_processing_enabled", settings.postProcessingEnabled)
            .putBoolean("color_correction_enabled", settings.colorCorrectionEnabled)
            .putFloat("scene_exposure", settings.sceneExposure.coerceIn(0.35f, 1.8f))
            .putFloat("color_power_r", settings.colorPowerR.coerceIn(1f, 2f))
            .putFloat("color_power_g", settings.colorPowerG.coerceIn(1f, 2f))
            .putFloat("color_power_b", settings.colorPowerB.coerceIn(1f, 2f))
            .putBoolean("bloom_enabled", settings.bloomEnabled)
            .putFloat("bloom_strength", settings.bloomStrength.coerceIn(0f, 1f))
            .putBoolean("vignette_enabled", settings.vignetteEnabled)
            .putFloat("vignette_strength", settings.vignetteStrength.coerceIn(0f, 1f))
            .putBoolean("ambient_occlusion_enabled", settings.ambientOcclusionEnabled)
            .putFloat(
                "ambient_occlusion_intensity",
                settings.ambientOcclusionIntensity.coerceIn(0f, 2f),
            )
            .putBoolean("dynamic_resolution_enabled", settings.dynamicResolutionEnabled)
            .putBoolean("memory_enabled", settings.memoryEnabled)
            .putInt("memory_max_highlights", settings.memoryMaxHighlights.coerceIn(2, 10))
            .putString("camera_view_mode", settings.cameraViewMode.name)
            .putFloat("avatar_scale", settings.avatarScale.coerceIn(0.35f, 2f))
            .putFloat("avatar_position_x", settings.avatarPositionX.coerceIn(-3f, 3f))
            .putFloat(
                "avatar_vertical_offset",
                settings.avatarVerticalOffset.coerceIn(-2f, 2f),
            )
            .putFloat("avatar_position_z", settings.avatarPositionZ.coerceIn(-3f, 3f))
            .putFloat("avatar_rotation_x", settings.avatarRotationX.coerceIn(-45f, 45f))
            .putFloat("avatar_rotation_y", settings.avatarRotationY.coerceIn(-180f, 180f))
            .putFloat("avatar_rotation_z", settings.avatarRotationZ.coerceIn(-45f, 45f))
            .putFloat("temperature", settings.temperature)
            .putInt("max_tokens", settings.maxTokens)
            .apply()
    }

    private inline fun <reified T : Enum<T>> enumValueOrDefault(value: String?, fallback: T): T =
        runCatching { enumValueOf<T>(value.orEmpty()) }.getOrDefault(fallback)
}
