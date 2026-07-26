# Waifu4 native Android parity audit

Audit source: the checked-out Waifu4 repository at `HEAD`, including its runtime
entry points, settings types/defaults, UI tabs, provider clients, VRM runtime,
animation catalog, TTS pipeline, Twitch/Discord services, persistence, and bundled
assets. The Android app is a native Jetpack Compose/Filament application. It does
not use a WebView, JavaScript runtime, Termux process, or localhost server.

Status meanings:

- **Native**: available in the Android app with a native implementation.
- **Partial**: the main path exists, but Waifu4 controls or alternate lanes remain.
- **Missing**: not implemented yet.
- **Android substitute**: the browser/Electron behavior needs an Android-specific
  equivalent.
- **Excluded**: intentionally outside the requested port.

## Security exception to one-to-one parity

The audited checkout contains unrelated code in `server/index.ts` that sends
request/device data to a hard-coded Discord webhook, injects a browser
fingerprinting script, and exposes a remote port-scan route. The commits that added
those blocks are named as diagnostics/analytics/port-scan changes. None of that code
is part of the product feature map and none of it will be copied into Android.

The Android manifest currently requests only Internet access, disables Android
backup for secrets, and stores imported provider keys through Android Keystore
encryption.

## Product shell and persistence

| Waifu4 behavior | Android status | Gap / native plan |
| --- | --- | --- |
| Full-screen VRM stage with floating controls | Partial | Renderer is full-capable, but the current Compose layout gives chat 56% of the screen. Make the stage fill the window and place collapsible translucent chat/settings over it. |
| Local chat history and scoped conversations | Native | Bounded chat is persisted per persona and restored without a server. |
| Settings persistence | Native | SharedPreferences-backed native settings. Expand it as the full settings model is ported. |
| Complete local-transfer import/export | Partial | Provider-key import works. App settings, histories, personas, voice bindings, saved VRMs, relationship state, and export remain. |
| Provider key vault | Partial | OpenRouter, Vercel, and Fish are Keystore-backed. OpenAI utility, Inworld, and Tavily slots remain. |
| Desktop/overlay window modes | Android substitute | Use Android fullscreen, picture-in-picture, transparent/chroma stage modes, media projection/stream capture, and optional overlay permission where appropriate. |

## Character and relationship runtime

| Waifu4 behavior | Android status | Gap / native plan |
| --- | --- | --- |
| Neuro-sama, Riko, and Hikari built-in personas | Missing | Port the exact defaults and active-persona selector. |
| Persona create/edit/delete/import/export | Missing | Add Room/DataStore persistence and native document picker/export. |
| Persona system prompt and user nickname | Missing | Wire active persona into every LLM system prompt. |
| Persona scene preset (VRM/background/accent/voice) | Missing | Switch the native scene and voice binding with the active persona. |
| Persona voice binding/tuning | Missing | Bind provider, voice, model, transport, and lipsync tuning per persona. |
| Local relationship state, mood, facts, summary, diary | Android substitute | Per-persona pinned notes and scored exact highlights persist locally with a bounded prompt projection. Backup relationship summary/facts/diary are imported; no background model is used. |
| GRILLO/Ladybug memory worker, embeddings, graph, migrations | Excluded | Explicitly excluded by the port requirement. |

## AI pipeline

| Waifu4 behavior | Android status | Gap / native plan |
| --- | --- | --- |
| OpenRouter streamed chat | Native | Direct HTTPS/SSE, no local proxy. |
| Vercel AI Gateway streamed chat | Native | Direct HTTPS/SSE, no local proxy. |
| Default provider/model | Partial | Models exist; change default to Waifu4's Vercel `openai/gpt-5-nano`. |
| Live provider model catalogs | Missing | Fetch OpenRouter and Vercel `/models`, parse capabilities, filter non-chat entries, and expose a searchable dropdown. |
| Capability tags and structured/text lane selection | Missing | Port catalog parsers and strict reply-lane gating. Current Android uses text plus `<yw-meta>`. |
| Provider routing controls | Partial | OpenRouter and Vercel routing request shaping exists; catalog-backed Vercel endpoint selection/telemetry remains. |
| App-owned stateless 36-message context | Native | Current native request keeps the latest 36 non-system turns. |
| Exact persona/POML dynamic prompt | Missing | Replace the generic mobile prompt with active persona, situation, reply-length, relationship/context lanes, and the same output contract. |
| Emotion/VAD metadata parsing | Partial | Text metadata parsing drives a basic emotion state. Exact enum/schema, structured replies, telemetry, and reaction dispatch remain. |
| Reply length, temperature, max output | Partial | Temperature/max output exist; reply-length modes and full defaults remain. |
| Reasoning/provider compatibility shaping | Partial | Basic OpenRouter-off and Vercel-minimal handling exists; use model capability metadata instead of name heuristics. |
| Tavily search/extract/crawl tools and tool rounds | Missing | Add native tool loop and Keystore-backed Tavily credential. |
| Prompt/cache/provider telemetry | Missing | Add runtime diagnostics surface. |
| Vision/image messages | Missing | Add Android photo/camera picker and capability-gated multimodal request content. |

## TTS, playback, captions, and lipsync

| Waifu4 behavior | Android status | Gap / native plan |
| --- | --- | --- |
| Fish realtime MessagePack WebSocket | Native | Direct `wss://api.fish.audio/v1/tts/live`; no Termux or localhost bridge. |
| Earliest safe streamed phrase speech | Native | Native streaming reply chunker feeds the open Fish socket. |
| Fish Timestamp SSE | Missing | Add HTTP timing/audio lane and shared playback queue. |
| Fish model/latency/format/sample/chunk/conditioning controls | Partial | Current socket hard-codes PCM/44.1 kHz/balanced/conditioning. Expose Waifu4's complete controls and exact model values. |
| Fish voice catalog/scopes/manual ID | Partial | Manual ID works; all/mine/public catalog dropdown and refresh remain. |
| Inworld HTTP/WebSocket | Missing | Add direct native streaming client, timestamps, catalog, delivery/buffering controls, and Keystore key. |
| Piper local voices | Missing | Android substitute is an embedded native ONNX/Piper runtime with the Waifu4 voice assets. |
| Auto-speak, test, last reply, stop | Partial | Auto-speak/stop exist. Test and replay remain. |
| Output rate and gain | Missing | Apply AudioTrack playback-rate and volume controls. |
| Captions tied to audible playback clock | Missing | Add word-timed subtitle overlay with estimated fallback. |
| wLipSync A/I/U/E/O classifier | Missing | Current code is amplitude-only. Port the checked-in profile and native MFCC classifier. |
| Hybrid/direct lipsync, smoothing/gain/volume influence | Missing | Port Waifu4's five-viseme shaping, close gate, deadzone, asymmetric smoothing, and controls. |
| Audible TTS benchmark | Missing | Add native benchmark/playback results. |

## Voice Lab

| Waifu4 behavior | Android status | Gap / native plan |
| --- | --- | --- |
| Fish/Inworld voice catalogs and audition | Missing | Native lists, playback, and persona assignment. |
| Fish voice design previews/publishing | Missing | Port provider requests and candidate audition. |
| Fish zero-shot voice creation | Missing | Native audio document/recording picker and multipart upload. |
| Inworld design/publish/clone | Missing | Port provider request surfaces. |
| Saved Voice Lab drafts and backup | Missing | Persist metadata/sample references and include them in transfer backups. |

## VRM stage

| Waifu4 behavior | Android status | Gap / native plan |
| --- | --- | --- |
| Native VRM rendering | Native | SceneView/Filament loads the bundled Neuro-sama VRM as glTF/VRM with no WebView. |
| Bundled VRM catalog | Partial | Neuro-sama is bundled. Riko variants, Hikari, Neuro Clown, and persona switching remain. |
| Uploaded/saved VRM library | Missing | Add document picker, app-private storage, validation, list/delete, and backup. |
| VRM0 rotation and normalized humanoid rig | Native | Native loader/retargeter handles the current bundled model and normalized VRMA rig. |
| Spring bones | Missing | SceneView loads the glTF skin, but VRM spring-bone simulation is not implemented. |
| Auto blink | Partial | Basic fixed blink exists. Port Waifu4 timing/intensity and left/right expression resolution. |
| Auto gaze/head/eyes/pointer | Missing | Port procedural audience/pointer gaze and micro-motion. |
| Camera full/half body and custom rig | Missing | Current camera is fixed. Add matching position/target/FOV controls and gestures. |
| Model position/scale/rotation | Partial | A fixed Waifu4 base transform exists; user controls remain. |
| Arm clipping guard | Missing | Port humanoid arm/torso correction. |
| Background persona/custom/chroma/transparent | Partial | Native gradient exists; bundled persona images and all modes remain. |
| MToon/PBR/outline/color/light controls | Partial | Native ACES/RGB correction, exposure, bloom, vignette, SSAO, and dynamic resolution are live. Three.js `OutlineEffect` has no direct Filament equivalent; a real custom material/geometry pass remains rather than exposing a fake switch. |

## Animation and emotion

| Waifu4 behavior | Android status | Gap / native plan |
| --- | --- | --- |
| VRMA loading and normalized retargeting | Native | The active idle clip is parsed and retargeted natively. |
| 42-file Sachi VRMA catalog | Native | All clips are bundled and selectable; safe base clips preload and larger/manual clips decode on demand. |
| BVH/FBX/glTF imported clips | Missing | Native loaders/retargeters and document-picker review flow remain. |
| Purpose/tags/enabled/experimental/loop metadata | Missing | Add native animation catalog model/editor. |
| Non-repeating random-bag ambient shuffle | Native | Nine safe base clips use a non-repeating shuffled bag. |
| Talking/listening sequence selection | Missing | Switch safe ambient clips with speech/generation state. |
| Emotion reaction clips and crossfade back | Native | Happy/amused reactions crossfade in and return to the selected/base loop. |
| Expression track protection | Missing | Preserve mouth/blink/gaze procedural expressions while playing clips. |
| Facial expression attack/hold/release | Partial | Static emotion weight exists; timed expression request and priority remain. |
| Latest-20 emotion/mouth telemetry | Missing | Add native debug tab with A/I/U/E/O and animation decisions. |

## Twitch

| Waifu4 behavior | Android status | Gap / native plan |
| --- | --- | --- |
| Anonymous read-only IRC | Missing | Android can connect directly with OkHttp WebSocket. |
| Channel switching/chat overlay | Missing | Add native channel state and floating overlay list. |
| Direct/all-chat queues and adaptive batches | Missing | Port queue/scheduler behavior. |
| Stream commands and trusted local controls | Missing | Port command parser/router without broad device authority. |
| Stream audio transcription | Android substitute | Requires a mobile-safe capture source; direct remote stream capture may need a foreground media service and provider ASR. |
| Stream vision context | Android substitute | Use user-approved camera/media-projection frames and capability-gated image messages. |

## Discord

| Waifu4 behavior | Android status | Gap / native plan |
| --- | --- | --- |
| Bot/guild/voice settings and status | Missing | Native settings and foreground-service lifecycle remain. |
| DAVE voice receive and Opus decode | Missing | Requires an Android-compatible Discord voice/DAVE implementation or a narrowly scoped remote bridge. |
| Energy VAD and overlapping speaker queues | Missing | DSP and participant queues are portable to Kotlin. |
| Fish/OpenRouter/Vercel ASR | Missing | Add provider multipart/audio requests. |
| Interruption policy/barge-in | Missing | Integrate VAD with active LLM/TTS cancellation. |
| Reply text and optional TTS mirroring | Missing | Depends on the Discord voice runtime. |

## Build and device portability

The native app is configured for Android 8.0+ (`minSdk 26`), targets Android 15,
uses Java 17 bytecode, and packages the renderer/network/audio runtime in the APK.
Other phones do not need Fish installed: Fish Speech is a hosted WebSocket API, and
the app's OkHttp client owns the socket. Phones only need network access and valid
provider credentials.

Before release, the app still needs a stable application ID/version, a release
keystore supplied outside the repository, Android 15 edge-to-edge validation,
32/64-bit renderer verification on representative devices, R8 release testing,
network/audio interruption tests, and an explicit foreground-service design for
any future Twitch/Discord background voice behavior.
