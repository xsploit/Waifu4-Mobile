# Waifu4 native Android porting matrix

The TypeScript source remains the behavioral reference. Android-specific code
changes transport and platform APIs, not the pipeline contract.

| Waifu4 source | Native Android port | Preserved behavior |
| --- | --- | --- |
| `server/ai/llmGateway.ts` | `network/AiGatewayClient.kt` | OpenRouter/Vercel selection, routing modes, reasoning defaults, DeepSeek thinking disable, streaming deltas |
| `src/brain/replyParser.ts` | `network/ReplyStreamFilter.kt` | Incremental `<yw-meta>` suppression across split chunks and JSON metadata parsing |
| `src/brain/BrainTypes.ts` and `src/lib/chat/reply-metadata.ts` | `model/AppModels.kt`, `network/ReplyStreamFilter.kt` | Emotion plus valence/arousal/dominance reply contract |
| `server/ai/liveTtsBridge.ts` | `network/LiveSpeechChunker.kt` | 28-character early phrase threshold, 180-character hard limit, punctuation-aware flushing |
| `server/tts/FishTtsStream.ts` | `network/FishRealtimeClient.kt` | `wss://api.fish.audio/v1/tts/live`, MessagePack start/text/flush/stop events, S2 model header, 44.1 kHz PCM, balanced latency, previous-chunk conditioning |
| `src/tts/AudioPlayback.ts` | `network/FishRealtimeClient.kt` | Streaming-first PCM playback and amplitude-driven mouth state |
| `src/components/VrmStage.tsx` | `ui/NativeVrmStage.kt` | Bundled Neuro-sama VRM, native Filament rendering, camera framing, blink, mouth, and emotion morphs |
| `@pixiv/three-vrm-animation` via `src/lib/vrm/animation.ts` | `ui/VrmaAnimation.kt` | VRMA source parent/world normalization, VRM0 axis conversion, and target raw-rig mapping |
| `src/lib/vrm/sequencer.ts` | `ui/NativeVrmStage.kt` | 42-clip Sachi catalog, safe shuffled autoplay, manual play, speed/duration/loop, emotion reactions, and crossfade |
| `src/lib/vrm/postprocessing.ts` | `ui/NativeVrmStage.kt` | ACES exposure and RGB power correction; Filament adds optional mobile bloom, vignette, SSAO, and dynamic resolution |
| Local relationship/chat persistence without GRILLO worker | `data/MobileMemoryStore.kt` | Per-persona chat, pinned profile, bounded salient highlights, 2,000-character prompt ceiling, zero additional provider calls |
| Browser key vault | `data/SecureKeyStore.kt` | Local BYOK storage; Android substitutes Keystore-backed AES/GCM encryption |
| Local-transfer provider backup | `data/LocalTransferImporter.kt` | Vercel AI Gateway, OpenRouter, and Fish credentials imported without placing secrets in source or APK assets |
| Desktop React UI | `ui/WebWaifuApp.kt` | Native Compose mobile layout, touch sizing, edge-to-edge insets, portrait chat/avatar split |

The native client currently ports the provider-compatible text metadata lane
(Waifu4 Lane B). It does not claim to include desktop-only Twitch, Discord,
OBS/windowing, or LadybugDB surfaces.
