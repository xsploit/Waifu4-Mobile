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

Remaining verification:

- Main assistant Tavily tools with a real Account-tab Tavily key.
- Voice Lab Fish/Inworld voice list/create with real Account-tab keys.
- Twitch stream ASR/frame helpers against a real channel/provider key.
- Packaged desktop launch after the web flow is stable enough.
