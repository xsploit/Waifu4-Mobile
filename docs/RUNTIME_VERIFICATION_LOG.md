# Runtime Verification Log

Purpose: track concrete runtime checks separately from code-level tests. A passing unit test proves local behavior; this file records route/process/manual verification that the copied frontend and rebuilt backend need for feature parity.

## 2026-05-31 Local Backend Smoke

Command shape:

```text
PORT=8798 TWITCH_BACKEND_RUNTIME_ENABLED=false npm run server
```

Checked with the server running on `127.0.0.1:8798`, then stopped in the same command.

Reusable command:

```text
npm run smoke:runtime
```

| Surface | Route | Result | Meaning |
| --- | --- | --- | --- |
| Health | `GET /health` | `200` | Backend boots and responds. |
| Twitch runtime | `GET /twitch/runtime/status` | `200` | Optional backend Twitch runtime route is mounted. |
| Memory | `GET /memory/status` | `200` | GRILLO/Ladybug route surface is mounted. |
| POML render | `POST /ai/poml/render` | `200` | Local dynamic prompt template route renders without provider keys. |
| Main chat no-key guard | `POST /ai/chat` without provider key | `401` | Missing Account/env LLM key fails cleanly. |
| TTS no-key guard | `POST /tts/stream` without provider key | `401` | Missing Account/env TTS key fails cleanly. |
| Voice list no-key guard | `GET /tts/voices?provider=fish-speech` without provider key | `401` | Voice Lab list route is mounted and missing Account/env TTS key fails cleanly. |
| Voice create validation guard | `POST /tts/voices/create` with invalid body | `400` | Voice Lab create route validates before provider calls. |

Rerun after remote PCM playback scheduling and VRM scale reload fixes:

```text
npm run smoke:runtime
```

Result: all surfaces above returned the expected statuses.

## 2026-05-31 Production Web Build

Command:

```text
npm run build
```

Result: passed. TypeScript compiled and Vite produced the production `dist/` bundle. Vite reported large chunk warnings for the current copied frontend/ML assets, but no build error.

Remaining verification:

- Main assistant Tavily tools with a real Account-tab Tavily key.
- Voice Lab Fish/Inworld voice list/create with real Account-tab keys.
- Twitch stream ASR/frame helpers against a real channel/provider key.
- Packaged desktop launch after the web flow is stable enough.

## 2026-05-31 Production Web Build After Tab Parity Pass

Command:

```text
npm run build
```

Result: passed. TypeScript compiled and Vite produced the production `dist/` bundle after the Fish-default TTS tab, chat-stream emotion telemetry, Emotion Log VAD display, Twitch ASR, and provider embedding picker parity checks. Vite still reports expected large copied-frontend/ML chunk warnings, but no build error.

Remaining verification:

- Main assistant Tavily tools with a real Account-tab Tavily key.
- Voice Lab Fish/Inworld voice list/create with real Account-tab keys.
- Twitch stream ASR/frame helpers against a real channel/provider key.
- Packaged desktop launch after the web flow is stable enough.

## 2026-05-31 Backend Smoke After Chat Metadata/Tab Parity Pass

Command:

```text
npm run smoke:runtime
```

Result:

| Surface | Route | Result |
| --- | --- | --- |
| Health | `GET /health` | `200` |
| Twitch runtime | `GET /twitch/runtime/status` | `200` |
| Memory | `GET /memory/status` | `200` |
| POML render | `POST /ai/poml/render` | `200` |
| Main chat no-key guard | `POST /ai/chat` without provider key | `401` |
| TTS no-key guard | `POST /tts/stream` without provider key | `401` |
| Voice list no-key guard | `GET /tts/voices?provider=fish-speech` without provider key | `401` |
| Voice create validation guard | `POST /tts/voices/create` with invalid body | `400` |

Meaning: the rebuilt local backend surfaces still boot and fail cleanly after the chat-stream `replyMetadata` SSE contract change and the latest tab parity coverage.

## 2026-05-31 Full Test Suite After Tab Parity Pass

Command:

```text
npm test
```

Result: passed. Vitest reported 64 passing tests and 0 failures across the local suite after the recent TTS tab default, chat-stream emotion telemetry, Emotion Log VAD display, Twitch ASR, and provider embedding picker parity commits.

## 2026-05-31 Emotion Telemetry Packaged-Reference Shape

Reference:

```text
C:\Users\SUBSECT\Documents\GitHub\WebWaifu4\release\win-unpacked\resources\app.asar
```

Result: inspected the packaged ASAR bundle and confirmed the intended Emotion Telemetry menu shape shows emotion/expression/animation summaries plus per-row `face ...` and `affect ... V/A/D` lines. Raw `metadataValence`/`metadataArousal`/`metadataDominance` are present in persisted event normalization. The rebuild keeps those packaged fields and adds explicit `Model VAD` / `Affect VAD` debug cards plus per-row `model V/A/D` so the raw model JSON and smoothed affect state can be compared while retaining the rebuilt `/ai/chat` `replyMetadata` stream contract underneath.

## 2026-05-31 Voice Lab Provider Catalog Wiring

Command:

```text
npm test -- src/components/menu/SettingsPanel.test.tsx
npm run typecheck
npm run build
```

Result: passed. Voice Lab now receives the same remote provider voice catalog state and refresh callbacks used by the TTS tab. The tab can fetch Fish/Inworld voices, display loaded provider voices, and copy a provider voice id/name/provider into the voice draft without changing the backend TTS streaming path.

## 2026-05-31 Runtime Smoke After Voice Lab Catalog

Command:

```text
npm run smoke:runtime
```

Result: passed.

```text
health=200
twitch runtime=200
memory status=200
poml render=200
main chat no-key guard=401
tts no-key guard=401
voice list no-key guard=401
voice create validation guard=400
```

## 2026-05-31 Local Backup Compatibility Check

Commands:

```text
npm test -- src/lib/product/local-transfer-backup.test.ts src/lib/chat/storage.test.ts
```

Result: passed. Vitest reported 17 passing tests across storage normalization and local transfer backup parsing.

The current parser was also run against:

```text
C:\Users\SUBSECT\Downloads\web-waifu-4-local-backup-2026-05-30T03-03-43.json
```

Non-secret parse summary:

```json
{
  "app": "web-waifu-4-local",
  "activeTab": "account",
  "providerSecrets": 6,
  "savedVrmModels": 4,
  "chatHistory": 36,
  "chatHistories": 0,
  "relationshipMemories": 3,
  "voiceLabVoices": 1,
  "includes": {
    "chatHistory": true,
    "providerSecrets": true,
    "relationshipMemory": true,
    "savedVrmModels": true
  }
}
```

## 2026-05-31 Final Tab-Parity Gate

Commands:

```text
npm test
npm run build
npm run smoke:runtime
```

Result: passed.

- Vitest: 56 files, 259 tests passed.
- Production build: `tsc --noEmit && vite build` passed.
- Runtime smoke: health, Twitch runtime, memory status, POML render, and expected no-key guards passed.
