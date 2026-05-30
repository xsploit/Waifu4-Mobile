# WebWaifu Rebuild — Handoff

_Last updated: 2026-05-30. Pick up from here._

## What this is
Clean rebuild of the WebWaifu "main brain". Core loop: **user input → LLM → text → TTS → mouth → avatar.** Built fresh from docs + first principles — **NOT** ported from the old `WebWaifu4` repo (porting carries its accumulating bugs). Source may be read to learn *what's needed*, never copied for *how*. Front-end look/feel is the one copy-allowed exception.

- New repo: `C:\Users\SUBSECT\Documents\GitHub\wWeb Waifu4` (git, branch `main`).
- Source-of-truth plan + decisions D1–D11: `C:\Users\SUBSECT\Documents\GitHub\WebWaifu4\docs\SCRATCH_REBUILD_SOURCE_OF_TRUTH.md` (read the "Resolved Decisions (Grilling Log)" section first).
- Glossary: `CONTEXT.md` (repo root). Memory: `~/.claude/projects/C--Users-SUBSECT-Documents-GitHub-wWeb-Waifu4/memory/`.

## Rollback model (D2)
Linear `main`, one commit per slice. Each passing slice is an annotated tag `green/<phase>`. Rollback = `git checkout green/<tag>`. Current green tags:
`green/phase0-bootstrap` → `green/phase3-llm` → `green/phase3b-model-metadata` → `green/phase4-tts-stream`.

## Done & live-verified
- **Phase 0** — Vite+React web shell, Express backend `127.0.0.1:8797`, `/health`, strict TS (single tsconfig), vitest, logger. Vite proxies `/health|/ai|/tts` → backend.
- **Phase 3 (LLM)** — `POST /ai/chat` SSE (`delta`/`done`/`error`). AI SDK v6 `streamText`+`Output.object`+`partialOutputStream`. Both gateways (`vercel-gateway`, `openrouter-responses`). Lane A (structured) + Lane B (text + `<yw-meta>`, split-tag-safe parser). reasoningEffort default `minimal`. Only `message` is ever spoken.
- **Phase 3b (capability)** — `GET /ai/models` → OpenRouter metadata → `supportsStructuredOutputs` → centralized `selectReplyFormat()` → ChatPanel auto-selects lane (manual = debug override).
- **Phase 4 (TTS)** — `POST /tts/stream` NDJSON audio via official `fish-audio` SDK `convertRealtime` (websocket). Streaming-first (D10), `condition_on_previous_chunks=true`, backend `s2-pro`, latency `balanced`, pcm@44.1k. Live: 4 chunks, first audio ~943ms.

## Architecture / boundaries
- **D1:** browser never calls providers; client facades POST to the local backend, which holds provider calls. Keys forwarded via headers: `x-yourwifey-llm-provider-key`, `x-yourwifey-openai-byok-key`, `x-yourwifey-tts-provider-key` (env fallback: `LLM_PROVIDER_KEY`, `OPENAI_BYOK_KEY`, `FISH_AUDIO_API_KEY`).
- `src/brain/` = schema (`BrainTypes`), parser (`replyParser`), prompt, capability. `src/llm/LlmClient` + `src/tts` = client facades. `server/ai/*`, `server/tts/*` = provider calls.
- Canonical reply (D3): `{ message, emotion, valence, arousal, dominance }`. Only `message` spoken; emotion/VAD parsed+logged, consumed by avatar only from Phase 9.

## Gotchas already paid for (don't relearn)
- **SSE/stream cancel must listen on `res` 'close', NOT `req` 'close'** (req close fires when the POST body is read → aborts the stream instantly). See `server/ai/chat.ts`, `server/tts/stream.ts`.
- **GPT-5 / reasoning models emit zero text without `reasoningEffort: 'minimal'`** (they spend the turn thinking). Default is minimal.
- **OpenRouter `require_parameters=true`** only when structured/tools, else silent downgrade → malformed output.
- **fish-audio 0.1.0 `Backends` type lacks `s2-pro`** — cast it; the wire `model` header accepts it.
- Windows: start server with `npm run server` (bare `tsx` isn't on PATH). Kill via `netstat -ano | grep :8797` → `taskkill //PID <pid> //F`.

## Verify / run
`npm run typecheck` · `npm test` (24 tests) · `npm run build` · `npm run server` (backend) · `npm run dev` (web+server).
Keys for live tests are in `C:\Users\SUBSECT\Downloads\web-waifu-4-local-backup-2026-05-30T03-03-43.json` (`providerSecrets[].keyName/secret`; Fish voice id at `state.aiSettings.fishSpeechVoiceId`).

## Next slices (recommended order)
1. **Client audio playback** — `src/tts/AudioPlayback.ts`: schedule the NDJSON pcm chunks via Web Audio with a running playhead; expose playback state + amplitude (the doc's TTS debug counters). Wire a "speak" button / auto-speak the reply in ChatPanel.
2. **LLM→TTS bridge** (doc Phase 4) — sentence/clause-buffer LLM `delta`s and feed them into `convertRealtime`'s text stream for lowest first-audio (currently `/tts/stream` speaks one whole string).
3. **Avatar + mouth** (doc Phase 1) — VRM load, AvatarStage, MouthController driven by playback amplitude; mouth debug panel. Only the audio/lipsync layer writes `aa/ih/ou/ee/oh`.
4. Settings persistence/import-export → persona isolation → GRILLO (backend memory worker) → emotion/animation (Phase 9, incl. the S1/S2 `[bracket]` emotion-tag switch, D9) → live-bridge hardening.

## Parked (D8)
Capture model **reasoning text** as a separate channel (a `reasoning` SSE event) → feed GRILLO reflection/diary. Don't speak it. Memory: `reasoning-as-thinking-for-grillo.md`.
