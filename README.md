# Waifu4 Mobile

Waifu4 Mobile is the Android port of [Waifu4](https://github.com/xsploit/Waifu4),
built for a full-screen animated VRM companion with streaming chat, realtime voice,
lip sync, local memory, and touch-first controls.

The app runs directly on Android. It does not start Termux, Node.js, Electron, a
localhost backend, or a companion server.

> **Status:** alpha. The app is ready for sideload testing, but the current release
> is not yet a Google Play production build. Store signing, API 36 migration,
> privacy/reporting surfaces, and bundle-size work remain.

## What is included

- Native Kotlin and Jetpack Compose application shell and mobile UI.
- Streamed OpenRouter and Vercel AI Gateway conversations with model catalogs,
  routing controls, reasoning compatibility, and incremental visible text.
- Fish Audio realtime WebSocket TTS using MessagePack start, text, flush, and stop
  events while the LLM response is still streaming.
- Low-latency PCM playback through Android `AudioTrack` with native five-viseme
  analysis driving the avatar mouth.
- Android speech-recognizer selection for voice input, including on-device engines
  when the phone provides one.
- Android Keystore-backed encryption for OpenRouter, Vercel, and Fish credentials.
- Per-persona mobile memory with recent conversation, pinned notes, and a bounded
  local highlight projection. It makes no background memory-model request.
- Import of relevant Waifu4 local-transfer settings, credentials, chat, memory,
  VRM selection, and animation settings.
- Seven bundled VRM characters plus local VRM import and persistent selection.
- The Waifu4 animation library: 42 Sachi VRMA clips, FBX base animations, and the
  Silly/SillyTavern BVH catalogs.
- Full avatar positioning, scaling, rotation, camera framing, MToon tuning,
  outlines, lighting, post-processing, expressions, spring bones, animation
  sequencing, and one-second crossfades.

## Native and hybrid architecture

Most of the application is native Android: UI, state, storage, networking, model
catalogs, LLM streaming, TTS transport, audio playback, speech input, memory, file
selection, and security.

The VRM viewport intentionally uses a small, local-only Android `WebView` containing
the compiled Waifu4 Three.js/`@pixiv/three-vrm` renderer. This preserves Waifu4's
MToon materials, spring bones, animation retargeting, expressions, and rendering
behavior more faithfully than the experimental Filament shader port. The page and
all renderer files are packaged in the APK under `app/src/main/assets/avatar`; it
has no remote page, local server, Node runtime, or Termux dependency. Kotlin sends
typed state commands to the renderer and serves bundled or user-imported VRMs from
app-owned storage.

```text
Jetpack Compose UI
        |
WaifuViewModel + native provider/audio/memory clients
        |
HybridVrmStage bridge
        |
local packaged Waifu4 VRM renderer
```

## Requirements

- Android Studio with JDK 17, or JDK 17 plus the Android SDK command-line tools.
- Android SDK platform 34 and a recent platform-tools installation.
- Android 8.0 or newer on the target device (`minSdk 26`).
- A user-supplied OpenRouter or Vercel AI Gateway key for chat.
- A user-supplied Fish Audio key for realtime TTS.

Provider keys are not included in this repository or in release artifacts.

## Build

Clone the repository, point `ANDROID_HOME` at your Android SDK, and run:

```sh
./gradlew :app:assembleDebug
```

The debug APK is created at:

```text
app/build/outputs/apk/debug/app-debug.apk
```

Install it on a connected device with:

```sh
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

No npm install or frontend build is required. The VRM renderer is already compiled
and checked in as an Android asset.

The current debug APK is approximately 104 MiB. VRM and animation files remain
lossless; Android package compression removes padding and repeated binary data when
the APK is built.

## Tests

Run the native unit suite with:

```sh
./gradlew :app:testDebugUnitTest
```

Run both tests and a debug build with:

```sh
./gradlew :app:testDebugUnitTest :app:assembleDebug
```

Because avatar rendering depends on the system WebView and GPU, VRM materials,
animation motion, spring bones, and lip sync should also be checked on a physical
phone after renderer changes.

## Release signing

Release secrets are read only from environment variables:

```sh
export ANDROID_KEYSTORE_PATH=/absolute/path/to/upload-key.jks
export ANDROID_KEYSTORE_PASSWORD=...
export ANDROID_KEY_ALIAS=...
export ANDROID_KEY_PASSWORD=...
./gradlew :app:bundleRelease
```

The resulting Android App Bundle is written below
`app/build/outputs/bundle/release/`. Keep keystores and passwords outside the
repository.

## Repository layout

```text
app/src/main/java/       Native app, provider, audio, memory, and UI code
app/src/main/assets/     Packaged VRMs, animations, lip-sync profile, VRM renderer
app/src/test/            JVM unit tests
gradle/                  Gradle wrapper
tools/                   Optional VRM texture optimization utility
```

`tools/optimize-vrm-textures.mjs` is an optional asset-maintenance script. It
requires Node.js and ImageMagick on the developer machine, but neither is required
to build or run the Android app.

The editable TypeScript source for the avatar renderer stays in the upstream Waifu4
repository. When that renderer changes, build its `mobile-avatar` Vite target there
and replace the generated HTML, JavaScript, and CSS under
`app/src/main/assets/avatar/`. The desktop application and its npm dependency tree
do not belong in this mobile repository.

## Known release work

- Migrate `compileSdk` and `targetSdk` to API 36 for Google Play submissions after
  August 31, 2026.
- Build a release AAB and verify its per-device compressed size in bundletool or
  Play Console. The compressed debug APK is already below Play's 200 MB limit.
- Add the privacy policy, Data Safety disclosures, and in-app generative-AI report
  action required for Play review.
- Replace alpha/debug signing with Play App Signing and a protected upload key.
- Audit redistribution licenses for every bundled model, animation, and texture
  before public store distribution.

## Security and privacy

- Only Internet and microphone permissions are requested.
- Provider requests are made directly from the Android process.
- API keys are encrypted using an Android Keystore-backed AES/GCM key.
- Chat and mobile memory stay in app-private local storage unless the user exports
  or clears them.
- Chat text is sent to the selected LLM provider and speech text is sent to Fish
  Audio when those features are used.
- Imported backup files can contain provider secrets; treat them as sensitive.

## Upstream

This mobile port preserves Waifu4's provider and avatar behavior while adapting
platform-specific storage, audio, security, speech recognition, and UI for Android.
The desktop/browser project remains available separately at
[xsploit/Waifu4](https://github.com/xsploit/Waifu4).
