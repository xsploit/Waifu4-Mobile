# WebWaifu4 Rebuild

WebWaifu4 Rebuild is a local-first VTuber/AI companion app rebuilt around a cleaner brain, TTS, memory, Twitch, and VRM runtime while preserving the original frontend shape.

The goal is feature parity with the working WebWaifu4 experience, not a redesign. The copied frontend tabs, layout, controls, and visual workflow are intentionally kept close to the original app, with backend and TTS seams adapted to the rebuilt architecture.

## Current Feature Surface

- Local browser app with Vite/React frontend and local Node backend.
- Browser-owned Account tab provider keys; backend env keys are fallback only.
- LLM chat through Vercel Gateway or OpenRouter Responses.
- OpenRouter-focused model metadata in the picker, including structured output support, vision/image support, tool support, reasoning tags, file support, context windows, max tokens, and embedding-model tags where providers expose them.
- Structured/text reply lane selection based on model capability metadata.
- Main chat Tavily tool support through the existing Account-tab key path.
- POML-backed dynamic prompt rendering.
- Fish Speech TTS:
  - WebSocket realtime live bridge.
  - Timestamp SSE HTTP stream.
  - Early chunk mode for faster first speech with timestamp metadata.
  - S2-oriented settings, latency, chunk length, sample rate, format, transport, and continuity controls.
  - Browser benchmark mode for audible transport comparison.
- Inworld TTS:
  - HTTP stream.
  - WebSocket stream.
  - Delivery/timestamp/buffer controls.
- Browser audio playback with wlipsync mouth ownership.
- Provider timing metadata routed toward captions/subtitles where available.
- VRM stage with bundled/custom/saved avatar loading.
- Animation sequencer with non-repeating shuffle behavior.
- Emotion telemetry with model emotion, VAD, expression, animation, and live mouth/expression snapshots.
- Twitch direct IRC frontend intake without Twitch API keys.
- Twitch message queues, command handling, membership events, stream transcription, and video-frame context support.
- GRILLO/Ladybug memory worker, semantic indexing, relationship memory, diary/reflection state, activity logs, worker context traces, and memory debug views.
- Voice Lab provider voice catalog, persona voice binding, and provider voice creation surfaces.
- Local transfer backup import/export for provider keys, saved VRMs, personas, scoped chat histories, relationship memory, settings, and Voice Lab voices.

## Feature Areas

### Brain and Providers

The rebuilt brain keeps provider compatibility defensive. OpenRouter and gateway model metadata are used to reduce bad requests, choose structured/text lanes, label model capabilities, and filter embedding options. The main assistant path supports streamed visible deltas, tool-capable models, POML prompt rendering, memory recall, and provider-specific request shaping.

### TTS and Mouth

Fish Speech and Inworld are the primary TTS providers. Fish supports both WebSocket realtime and Timestamp SSE, with Early Chunks available when timestamp metadata is wanted without waiting for a full reply. Inworld exposes HTTP/WebSocket streaming plus delivery and timestamp controls. Browser benchmark results are used as the practical authority for latency and cutout behavior. Runtime mouth movement is owned by wlipsync/audio-reactive playback, with provider timing metadata available for captions and future mouth-flap experiments.

### Avatar, Animation, and Telemetry

The app keeps the original VRM stage and settings shape: bundled/custom/saved avatars, scene/background controls, animation playlist controls, manual playback, emotion telemetry, final expression telemetry, and mouth weight snapshots. Animation shuffle is non-repeating instead of the old weighted behavior.

### Twitch and Stream Context

Twitch direct IRC is the primary chat path and does not require Twitch API keys. The rebuild also includes queue behavior, stream commands, membership events, Twitch stream transcription, and video frame capture for vision-capable models. Backend Twitch runtime exists as optional/fallback plumbing.

### Memory and GRILLO

Ladybug/GRILLO stores chat turns, candidate memories, diary/reflection entries, relationship state, semantic records, vector records, activity logs, and worker context traces. The Context/Memory tab exposes runtime state, graph records, worker controls, semantic indexing, and embedding-model selection.

## TODO / Backlog

- Persist and expose richer GRILLO reasoning/debrief data where useful, not only compact activity logs and worker traces.
- Add silence/gap detection to the browser TTS benchmark so cutouts can be measured objectively.
- Continue verifying provider-backed Voice Lab, Tavily tools, Inworld, and OpenRouter edge cases with real Account-tab keys.
- Keep Piper browser TTS parked/back-burner unless it becomes a priority again.

## Status

The app is in active rebuild/parity mode. The main brain and TTS contracts are stable enough to build around, and the current priority is keeping the original WebWaifu4 user-facing feature surface connected while avoiding regressions in TTS latency, VRM playback, memory, and Twitch intake.

Some provider-backed features require real Account-tab keys for runtime verification. Piper browser TTS is preserved but parked/back-burner compared with Fish Speech and Inworld.

## Run Locally

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually:

```text
http://localhost:5173/
```

Useful checks:

```bash
npm test -- --run
npm run build
npm run smoke:runtime
```

## Notes

- Keep the frontend look and tab layout close to the original WebWaifu4 app.
- Do not replace browser Account-tab keys with backend-only environment configuration.
- Do not move to Electron packaging until the web app feature surface is verified.
- Benchmark/audible TTS results should override code-shape guesses.
