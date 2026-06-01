# WebWaifu4 Rebuild

WebWaifu4 Rebuild is a local-first VTuber/AI companion app rebuilt around a cleaner brain, TTS, memory, Twitch, and VRM runtime while preserving the original frontend shape.

The goal is feature parity with the working WebWaifu4 experience, not a redesign. The copied frontend tabs, layout, controls, and visual workflow are intentionally kept close to the original app, with backend and TTS seams adapted to the rebuilt architecture.

## Current Feature Surface

- Local browser app with Vite/React frontend and local Node backend.
- Browser-owned Account tab provider keys; backend env keys are fallback only.
- LLM chat through Vercel Gateway or OpenRouter Responses.
- Structured/text reply lane selection based on model capability metadata.
- POML-backed dynamic prompt rendering.
- Fish Speech TTS:
  - WebSocket realtime live bridge.
  - Timestamp SSE HTTP stream.
  - Early chunk mode for faster first speech with timestamp metadata.
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
- GRILLO/Ladybug memory worker, semantic indexing, relationship memory, diary/reflection state, and memory debug views.
- Voice Lab provider voice catalog, persona voice binding, and provider voice creation surfaces.
- Local transfer backup import/export for provider keys, saved VRMs, personas, scoped chat histories, relationship memory, settings, and Voice Lab voices.

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
