# Frontend Tab Primer

Purpose: keep the copied frontend understandable while the rebuild reaches feature parity. This file tracks what each active settings tab does, where its state lives, what callbacks/API seams it uses, and whether the surface is live, partial, parked, or verification-only.

Default rule: controls copied from the old settings tabs are presumed intentional product surface. Trace them before removing or replacing them; patch API/data seams first.

Status terms:

- `LIVE`: hooked to active app state and used by the current frontend.
- `VERIFY`: wired, but needs manual/runtime provider verification.
- `PARKED`: preserved for compatibility or later use, not blocking parity.
- `OPTIONAL`: exists as fallback plumbing, not the primary user path.

## Global Wiring

- Active tab registry: `src/components/menu/SettingsPanel.tsx`.
- Tab ids: `src/lib/menu/types.ts`.
- Persisted browser state keys: `src/lib/chat/defaults.ts`.
- Main app callbacks/state owner: `src/App.tsx`.
- Browser provider keys: Account tab -> browser provider key vault -> request headers.
- Backend env keys: fallback only. They are not the primary configuration path.

Account provider-key rule:

```text
Account tab browser key
-> getBrowserRemoteTtsApiKey / provider vault
-> x-yourwifey-tts-provider-key or LLM key headers
-> backend handler
-> provider API
```

Do not replace this with backend-only env configuration.

## Account

Status: `LIVE`.

Purpose:

- Browser-local provider keys.
- Local transfer backup export/import.

State/seams:

- Uses `createBrowserProviderKeyVault`.
- Provider descriptors stay in browser storage.
- Local backup callbacks come from `App.tsx`.
- Backup state includes app settings, provider secrets, saved VRMs, personas, scoped chat histories, relationship memory, and voice lab voices.

Notes:

- Provider keys are intentionally owned by the frontend Account tab.
- Env keys are fallback convenience only.

## Avatar / VRM

Status: `LIVE`.

Purpose:

- Bundled VRM selection.
- Custom VRM upload/save/load/delete.
- Saved VRM library refresh.
- Camera/visual controls exposed through `visualSettings`.

State/seams:

- `currentBundledModelId`, `currentCustomVrmModelId`, and saved VRM models are owned by `App.tsx`.
- Storage and saved blobs use `src/lib/vrm/custom-vrm-library.ts`.
- Rendering and runtime animation/mouth ownership happens in `VrmStage`.

Notes:

- This is copied frontend behavior and should stay visually one-to-one unless a specific seam requires adaptation.

## Background

Status: `LIVE / VERIFY`.

Purpose:

- Persona/custom/chroma/transparent scene backgrounds.
- Desktop Window and OBS Overlay relaunch controls.
- Electron click-through toggle.

State/seams:

- `visualSettings` is app state and persisted under `yourwifey.visualSettings.v1`.
- Desktop controls use `window.webWaifuDesktop`.
- `BackgroundTab` can call `relaunchWindowMode('desktop' | 'overlay')`.

Known verification item:

- `overlayPageActive` in `App.tsx` is still hardcoded off, and there is no overlay-only CSS behavior. OBS overlay launch exists, but hiding/showing UI specifically for overlay mode is a product decision, not something to invent blindly.

## Animation

Status: `LIVE`.

Purpose:

- Animation playlist management.
- Animation purpose grouping.
- Manual animation play.
- Sequencer play/loop/shuffle/speed/duration.
- Custom animation file import.

State/seams:

- `sequencerSettings` is app state and persisted under `yourwifey.sequencerSettings.v1`.
- Manual play requests flow from `AnimTab` -> `App.tsx` -> `VrmStage`.

Intentional divergence:

- Old weighted random behavior is removed.
- Current autoplay uses non-repeating shuffle/random bag behavior.

Backlog:

- Evaluate talk-safe clips later for TTS talk-animation pool.

## Emotion Log

Status: `LIVE`.

Purpose:

- Recent assistant emotion/VAD telemetry.
- Live VRM expression/mouth snapshot.

State/seams:

- Emotion events come from assistant metadata and animation/facial telemetry.
- VRM telemetry comes from `VrmStage`.

Ownership rule:

- Mouth visemes remain owned by audio/wlipsync.
- Animation expressions should not write protected mouth/blink/look keys.

## Character

Status: `LIVE`.

Purpose:

- Persona create/edit/delete.
- Active persona switching.
- Persona prompt/description/nickname editing.

State/seams:

- `personas`, `activePersonaId`, `chatHistories`, `relationshipMemories`, and `personaVoiceBindings` are app state and persisted.
- Persona switching changes the active scoped conversation key.

Requirement:

- Persona switching must not leak chat or relationship context across personas.

## Voice Lab

Status: `LIVE / VERIFY`.

Purpose:

- Saved custom voice profiles.
- Persona voice binding.
- Use current active voice as persona default.
- Provider voice creation from uploaded samples.

State/seams:

- Saved voice profiles persist under `yourwifey.voiceLabVoices.v1`.
- Persona bindings persist under `yourwifey.personaVoiceBindings.v1`.
- Provider voice creation uses Account-tab browser keys:
  - frontend: `getBrowserRemoteTtsApiKey`
  - header: `x-yourwifey-tts-provider-key`
  - backend: `/tts/voices/create`
- Provider voice listing uses `/tts/voices`.

Verification item:

- Fish/Inworld provider voice listing and cloning need real-key manual verification.
- Backend env keys are fallback only and must not replace Account-tab browser keys.

## AI

Status: `LIVE`.

Purpose:

- LLM provider selection.
- Model selection and metadata/capability tags.
- Health/model refresh.
- Reasoning/tool/reply length/temperature/max token controls.

State/seams:

- `aiSettings` is app state and persisted under `yourwifey.aiSettings.v1`.
- Model metadata comes from backend `/ai/models`.
- Chat uses rebuilt backend `/ai/chat`.

Constraint:

- This is LLM-adjacent. Changes here should be capability/metadata/compatibility fixes unless explicitly approved.
- Do not change main streaming behavior casually.

## Twitch

Status: `LIVE / PRIMARY`.

Purpose:

- Frontend direct IRC chat intake.
- Channel switching.
- Trusted local controls.
- Mention/ambient queue settings.
- Batch thresholds and wait timing.
- Chat overlay toggle.
- Stream audio transcription settings, including Whisper/ASR model selection.
- Stream frame/vision context settings.
- Future/backlog local speech-to-text chat mode is separate from Twitch stream transcription.

State/seams:

- `twitchSettings` persists under `yourwifey.twitchSettings.v1`.
- `twitchChannel` persists under `yourwifey.twitchChannel.v1`.
- Primary Twitch chat path is frontend direct IRC, not backend Twitch API.
- Backend helper endpoints:
  - `/twitch/transcribe-sample`
  - `/twitch/capture-frame`
- ASR model selection is constrained to supported OpenRouter transcription models plus Fish ASR. OpenRouter ASR uses the Account-tab OpenRouter key; Fish ASR uses the Account-tab Fish key.

Important rule:

- Frontend IRC exists specifically to avoid requiring Twitch API keys.
- Backend Twitch runtime is optional/fallback plumbing and should not be treated as the main Twitch product path.
- Current copied old-code evidence does not include Twitch private-whisper intake. Do not add a token/API-key whisper path unless the product decision changes.

## Memory / Context

Status: `LIVE`.

Purpose:

- Chat/draft/context reset.
- Relationship memory status.
- GRILLO/Ladybug runtime controls.
- Backend memory beats/ticks/compaction/consolidation.
- Local/provider embedding controls.
- Prompt/debug snapshots.

State/seams:

- Relationship memory is scoped per persona conversation key.
- GRILLO/Ladybug backend routes live under `/memory`.
- Embedding controls are part of `aiSettings`.

Constraint:

- GRILLO must be non-blocking around chat/TTS/mouth.
- Memory failures degrade to no context or failed background write, not broken chat.

## TTS

Status: `LIVE`.

Purpose:

- Provider selection: Piper, Fish, Inworld.
- Fish transport/settings: WebSocket, timestamp SSE, format, sample rate, latency, chunk length, previous-chunk conditioning. Active model choice is `s2` in saved UI state, mapped to Fish API `s2-pro`.
- Inworld transport/settings: HTTP/WebSocket, timestamps, delivery mode, buffer controls, auto mode.
- Remote voice list/manual voice id.
- Browser benchmark mode.
- Speak last/test/stop/cache controls.

State/seams:

- TTS settings are part of `aiSettings`.
- Browser playback uses copied active `src/lib/tts/manager.ts`.
- Remote request seam is `src/lib/tts/remote.ts` -> backend `/tts/stream`.
- Voice list/create seams are `/tts/voices` and `/tts/voices/create`.

Authority for hot-path behavior:

- Audible/manual benchmark results override code-shape guesses.
- Do not alter TTS scheduling/lipsync because an old fix differs if current benchmark playback is clean.

Piper:

- Piper UI/settings remain present.
- Piper is parked/back-burner for core parity unless explicitly reintroduced as a priority.

## Current Known Verification Items

1. Background/OBS overlay: decide whether overlay mode should hide local UI, show only avatar/subtitles, or keep controls available.
2. Voice Lab: test Fish and Inworld voice listing/cloning with real Account-tab keys.
3. Twitch stream ASR/frame: manually verify the helper endpoints against a real live channel and selected provider key.
4. Packaged desktop: rebuild/package/launch once the web flow is stable enough to checkpoint.

## Current Non-Goals

- Do not make backend Twitch runtime the primary Twitch path.
- Do not replace Account-tab browser keys with env-only backend config.
- Do not rewrite main LLM or TTS streaming contracts without concrete runtime evidence.
- Do not revive weighted animation chance behavior.
