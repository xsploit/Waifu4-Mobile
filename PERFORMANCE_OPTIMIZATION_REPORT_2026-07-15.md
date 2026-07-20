# WebWaifu 4 Performance Optimization Report - 2026-07-15

## Scope

- Optimize the live browser/Electron frontend.
- Preserve the validated LLM and TTS pipelines unless a measured trace requires a change.
- Re-scan before each optimization, make one scoped change, verify it, and commit it separately.
- Keep this report local; it is not part of the public documentation set.

## Runtime Baseline

- Frontend: `http://127.0.0.1:5173/`, healthy.
- Backend: `http://127.0.0.1:8797/`, healthy.
- The current Vite process was launched through the Python `nodejs_wheel` shim instead of the system Node runtime. This is a development-runtime inconsistency to remove before final profiling; it is not yet established as a renderer-lag cause.
- Previous clean-profile probe: 60 FPS while idle/typing, no frames over 25 ms, no long tasks, input-to-frame average 9.75 ms and p95 15.9 ms. That does not reproduce the user's saved Electron/browser profile and is only a clean baseline.

## Fresh Scan 1 - Chat Input Critical Path

### Verified

- `src/App.tsx` is 7,872 lines and owns the controlled `chatInput` state.
- Every textarea character currently calls `setChatInput`, rerunning the root `App` component.
- `VrmStage` and `ChatLog` are memoized, which limits part of the downstream work, but the root shell and open settings panel are still reconciled on every character.
- Settings tabs are exclusive: only the active tab mounts. Hidden-tab mounting is not a current problem.
- Full application persistence is debounced by 900 ms and scheduled with `requestIdleCallback`; it does not run for every character during continuous typing, but draft changes still invalidate and recreate the persistence effect.
- The steady VRM `useFrame` path mutates Three.js objects directly and does not call React state setters each frame. VRM telemetry is already disabled unless its tab is visible.

### Optimization 1

Keep immediate textarea state inside `ChatBar`. Publish the draft value to the root only after typing pauses or the field blurs, while preserving immediate external restore, import, clear/reset, and send operations.

Expected effect: remove the 7,800-line root render from the per-keystroke critical path without changing message submission or persistence semantics.

### Verification

- TypeScript typecheck: passed.
- Focused chat/settings tests: 30 passed.
- Production frontend/backend build: passed.
- Settled live DOM probe against `5173`: all 45 characters arrived intact; 188 sampled frames averaged 16.67 ms, p95 16.8 ms, maximum 16.9 ms, zero frames over 25 ms, and zero long tasks.
- The same probe started during application initialization recorded a 1,071 ms startup long task. It was rejected as a steady-state typing sample, but startup work remains a separate profiling target.

## Remaining Scan Queue

1. Measure and split oversized persistence writes so a draft or small UI change does not serialize every chat/memory/settings slice.
2. Profile the real saved Electron/browser profile for long frames, React commits, GC, and GPU contention.
3. Audit animation clip caching and VRM/material disposal for bounded memory over repeated animation/model changes.
4. Re-check settings-panel prop churn and memoization after the input path is isolated.
5. Restart Vite under system Node before the final profile and compare the same saved scene.

## Fresh Scan 2 - Draft Persistence Fan-Out

### Verified Before Change

- A draft-only typing burst caused 19 `localStorage` writes totaling 55,644 characters.
- The largest value was 46,757 characters because the full app snapshot was serialized.
- The same draft change caused two relationship endpoint calls when the backend retry path was included.
- The clean-profile synchronous write time was only about 0.3 ms, so this was unnecessary fan-out rather than a proven primary frame-stutter cause.

### Optimization 2

- Added a dedicated normalized UI-state persistence function.
- Removed raw draft and menu-open changes from the full snapshot trigger.
- Kept full page-hide persistence so the newest draft ref is still captured when the page closes.

### Verification

- Identical post-change probe: one storage write, 80 characters, zero relationship calls.
- Storage/chat focused suite: 23 tests passed.
- TypeScript typecheck: passed.

## Protected Paths

No changes in this optimization pass unless separately proven necessary:

- `server/ai/**`
- `server/tts/**`
- `src/lib/tts/**`
- `src/tts/**`

## Fresh Scan 3 - Startup And Animation Transitions

### Verified

- Startup recorded two long tasks: 125 ms during initial JavaScript work and 1,123 ms while the VRM first rendered.
- CPU sampling attributes the large task primarily to Three.js/WebGL first-use shader compilation and texture upload. It is a one-time avatar appearance cost, not steady frame-loop churn.
- A separate 34-second settled trace crossed four first-time idle animation loads, including VRMA and BVH files up to 1.8 MB.
- The settled trace sampled 2,040 frames at 16.8 ms p95 and 16.9 ms maximum, with zero frames over 25 ms and zero long tasks.
- Animation assets are cached globally and retargeted clips are held in a per-VRM `WeakMap`; VRM geometry, materials, textures, mixers, timers, and object URLs have explicit cleanup paths.

### Decision

Do not rewrite the animation cache or frame loop. The measured animation transitions are smooth, and changing those paths would trade working cache behavior for speculative risk.

### Optimization 3

The startup trace showed two identical model-catalog requests. Hydration set saved AI settings and immediately requested models through a ref that still held defaults; the normal hydrated-provider effect then requested the catalog again. Remove only the premature hydration request and let the existing post-hydration effect load the correct provider once.

### Verification

- TypeScript typecheck: passed.
- Fresh startup probe now records exactly one model-catalog request for the hydrated provider.

## Final Regression Gate

- Full suite: 94 test files and 517 tests passed.
- TypeScript typecheck: passed.
- Backend production bundle: passed.
- Frontend production build: passed.
- Runtime smoke: passed for health, native memory, GRILLO ledger/projection routes, POML, static animations/backgrounds/VRM, and bundled Piper assets.
- Regular Vite app is running under system Node at `http://127.0.0.1:5173/`.
- Backend health remains available at `http://127.0.0.1:8797/health`.
- No LLM generation/streaming code, TTS synthesis transport, PCM scheduling, audio graph, or wLipSync processing changed.

## Fresh Scan 4 - Saved Electron Profile And Settings Panel

### Saved Profile Verification

- Profiled the normal saved Electron user-data directory against the regular Vite frontend and external backend.
- The loaded document held 847 DOM nodes and used about 49 MB of JavaScript heap (71 MB allocated).
- A corrected typing probe sampled 551 frames at 16.8 ms p95 and 16.9 ms maximum, with zero frames over 25 ms, zero frames over 50 ms, and zero long tasks.
- Garbage-collection self time was 21 ms over the profiling window; no sustained GC churn or renderer leak was reproduced.
- The draft restored after the probe, confirming the measurement did not discard the saved profile's chat input.

### Settings Panel Decision

- Only the active settings tab mounts; hidden tabs are not consuming render work.
- The outer panel receives live telemetry and status values plus several inline action closures. A shallow `memo` wrapper would still invalidate on those live values, while a comparator that ignores them could retain stale action closures.
- The saved-profile trace did not reproduce panel-open frame loss or typing lag after the chat-input isolation change.

Do not add speculative settings-panel memoization. A future change should first capture a React commit trace that identifies a specific expensive tab, then isolate that tab's props rather than hiding updates with a broad comparator.

## Queue Closure

1. Draft persistence fan-out: fixed and committed.
2. Real saved Electron/browser profile: measured; no sustained long-frame or GC issue reproduced.
3. Animation caching and VRM/material disposal: verified bounded; no rewrite warranted.
4. Settings-panel churn: inspected; no safe measured code change warranted.
5. Development runtime: Vite now runs under the system Node runtime.

The remaining one-time startup hitch is WebGL shader compilation and avatar texture upload. It is visible in the trace but does not continue during steady interaction, so it remains a future asset/render warm-up experiment rather than a release-path rewrite.

## Fresh Scan 5 - Playback-Paced Subtitles

### Verified Before Change

- Fish WebSocket live-bridge captions advanced from LLM delta timing rather than audio playback timing.
- The exact generated text was already available, so running ASR over outgoing TTS would duplicate work, add cost, and necessarily lag the known transcript.
- Timestamp-capable Fish and Inworld modes already provide real timing metadata and keep using it.

### Optimization 4

- Buffer the exact generated words without showing them ahead of audio.
- Start the subtitle clock on the first audio chunk and advance estimated word boundaries from the TTS manager's playback position.
- Keep the live bridge fallback and cancellation cleanup explicit so stale captions cannot survive a silent stream retry.

### Verification

- Three focused subtitle timing tests passed.
- The full 517-test suite passed.
- This changed caption presentation only; it did not change TTS request shapes, audio scheduling, synthesis, or lip-sync processing.

## Fresh Scan 6 - Native Ladybug Recovery And Long Prompts

### Verified Before Change

- The installed Ladybug runtime reported a WAL assertion as `wal_record.cpp ... UNREACHABLE_CODE`, which the existing corrupt-WAL recovery detector did not recognize.
- A separate captured backend failure showed GRILLO context validation rejecting a user query over 4,000 characters.
- Embedding generation already trims and bounds that same query to 4,000 characters, so the context request and embedding could disagree.

### Corrections

- Recognize the native Ladybug WAL assertion signature, quarantine only the corrupt WAL, and reopen the native database.
- Normalize GRILLO retrieval queries to the same 4,000-character boundary on the browser client, HTTP route, and worker-service boundary. The full user message remains unchanged for the LLM.

### Verification

- Native Ladybug recovered without switching to JSON fallback. Live status reports `backend: ladybug` and `initialized: true`.
- A live POST containing a 5,000-character query returned success; the retrieval receipt held the intended 4,000-character normalized query.
- Focused Ladybug/GRILLO suites and the full regression suite passed.
- Memory preflight benchmark: 53.82 ms cold, 2.05 ms warm, and 2.12 ms after-chat retrieval on the benchmark fixture.

## Fresh Scan 7 - Provider-Specific Piper Warm-Up

### Verified Before Change

- Startup downloaded and cached the selected Piper ONNX model whenever TTS was enabled, even when the active provider was Fish or Inworld.
- The startup trace therefore included roughly 63 MB of unnecessary local-model network/cache work for remote-TTS users.

### Optimization 5

- Run background Piper model warm-up only while Piper is the active TTS provider.
- Preserve explicit Piper selection, manual model loading, cached voice discovery, and every remote TTS path.

### Verification

- TypeScript typecheck and production build passed.
- The guard is outside the audio playback and synthesis pipeline; it only prevents irrelevant startup work.

## Final State

- Steady saved-profile rendering remains 60 FPS in the captured probe with no sustained long tasks or GC churn.
- Subtitle pacing now follows audio playback without ASR or added synthesis latency.
- Native Ladybug memory is healthy and long prompts no longer drop the GRILLO context packet.
- Fish/Inworld startup no longer warms a large unused Piper model.
- The remaining measured hitch is first-use WebGL shader/texture work. No speculative renderer, animation-cache, settings-panel, LLM-streaming, or TTS-playback rewrite was made.
