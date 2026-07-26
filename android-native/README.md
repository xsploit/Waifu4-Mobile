# WebWaifu Mobile

Native Android port of the WebWaifu 4 companion and provider pipelines.

- Kotlin + Jetpack Compose; no WebView, Node.js, Electron, or Termux runtime.
- Waifu4's Neuro-sama VRM rendered natively with Filament, including its VRMA
  humanoid animation retargeted with the same normalized-rig rules as
  `@pixiv/three-vrm-animation`.
- Native animation player with Waifu4's complete 42-clip Sachi VRMA catalog,
  safe shuffled autoplay, manual on-demand loading, loop, speed, duration, and
  one-second pose crossfades.
- Native Filament post-processing controls for ACES exposure/RGB power,
  low-cost bloom, vignette, SSAO, and dynamic resolution.
- Per-persona mobile memory with persistent recent chat, editable pinned notes,
  and a bounded local highlight projection. It performs no second model request
  and caps injected memory at 2,000 characters.
- Direct streamed OpenRouter and Vercel AI Gateway chat completions.
- Direct Fish Audio realtime WebSocket (`/v1/tts/live`) using the same
  MessagePack start/text/flush/stop events as Waifu4 and Fish's official SDK.
- Phrase-buffered LLM deltas are sent to Fish while the reply is still streaming;
  returned 44.1 kHz PCM is played through Android `AudioTrack`.
- API keys encrypted with an Android Keystore-backed AES/GCM key.
- Waifu4 local-transfer backups can import Vercel AI Gateway, OpenRouter, and
  Fish credentials, animation settings, recent chat, and relationship notes.
- Mobile-first portrait UI designed for touch and one-handed use.

## Build

```sh
export ANDROID_HOME=/path/to/android-sdk
./gradlew :app:assembleDebug
```

The debug APK is written to `app/build/outputs/apk/debug/`.

For a signed release, set `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`, then run
`./gradlew :app:assembleRelease`.
