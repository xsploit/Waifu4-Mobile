# Scratch Rebuild Source of Truth

Purpose: define a clean rebuild plan for the main waifu brain without dragging current WebWaifu4 complexity into the first implementation.

This document is intentionally architecture-first. The existing WebWaifu4 repo may be used later as a reference, but not as the starting point for the new codebase.

## 2026-05-30 Parity Audit Overlay

This file was copied from `C:\Users\SUBSECT\Documents\GitHub\WebWaifu4\docs\SCRATCH_REBUILD_SOURCE_OF_TRUTH.md` into the rebuild repo and then annotated. The original text below remains useful, but the project goal has shifted from a tiny non-parity prototype to **same user-facing WebWaifu feature surface, rebuilt around the new brain/TTS contracts**.

Current override:

- The **main brain and TTS contracts are solidified enough to build around**. Do not rewrite them unless a test, benchmark, or audible failure proves the contract is wrong.
- The rebuild should copy/adapt substantially more old code than the first draft assumed.
- Copy folders/files directly where the old code is mostly UI shape, assets, schema, settings, or proven backend plumbing.
- Rebuild/adapt where the old implementation was known fragile: animation weights/expression blending, mouth ownership, live audio scheduling, and main chat/provider complexity.
- **Marlin is excluded** from this rebuild map unless explicitly reintroduced later.
- **Twitch is required**, and it means the whole live input stack: IRC chat, whispers/message modes, stream audio transcription, video frame capture/vision context, queueing, commands, overlay events, and scheduler behavior.
- Piper browser TTS is currently optional/parked. Preserve the feature surface/settings if cheap, but do not block core parity on Piper unless the decision changes.

Status legend:

```text
DONE    implemented and verified in this rebuild
COPIED  byte/file copied but not necessarily active in the new app
ADAPT   old code should be copied or referenced, then patched to the new seams
REBUILD old feature stays, old implementation should not be trusted 1:1
PARKED  feature preserved as a possible later path, not blocking
EXCLUDE not part of this rebuild path
```

### Current Done Markers

| Area | Status | Notes |
| --- | --- | --- |
| Local backend boundary | DONE | `server/index.ts`, request-scoped keys, `/ai/chat`, `/tts/stream`. |
| LLM main brain | DONE | SSE visible `delta`, structured/text lanes, no raw JSON to speech, OpenRouter/Vercel gateway support. |
| TTS core | DONE | Fish realtime/current, Fish timestamp SSE, Inworld HTTP/WebSocket, benchmark mode, unified timing metadata. |
| Mouth core | DONE | `wlipsync` live path works from the playback audio source; provider timing is normalized for future captions/flaps. |
| GRILLO/Ladybug backend worker | DONE | Old services/tests copied, strict compile seams patched, routes wired under `/memory`, committed as `d8702d9`. |
| Source-of-truth doc | DONE | Imported into this repo and annotated by this overlay. |
| Public assets | COPIED | `public/cdn-assets` is present in the rebuild. |
| Direct frontend shell | DONE | Old `src/App.tsx`, `src/components`, and `src/style.css` promoted as the active frontend. Patch only backend/TTS/build seams; do not reshape the UI. |
| Settings/storage compatibility foundation | COPIED | Active `src/lib` now has old menu/chat/product/twitch/VRM sequencer types, defaults, backup parsing, key vault, queue helpers, Piper browser support, and focused tests. Piper may still be parked or dropped after the TTS seam audit. |
| Twitch backend transcription/frame foundation | COPIED | Old IRC parser/source and stream transcriber copied; `/twitch/transcribe-sample` and `/twitch/capture-frame` are wired to current backend key headers/env. |
| VRM loader/model/animation foundation | COPIED | Old `loadVrm`, custom VRM library, postprocessing, animation retargeting, sequencer, lipsync helpers, manifests, and tests are active. |
| Direct VRM stage/settings surface | DONE | Old direct `VrmStage`, settings tabs, chat overlay, and menu shell are now the active frontend surface. Next seam audit is mouth/TTS ownership against the new realtime TTS + `wlipsync` path. |
| POML dynamic prompt renderer | DONE | Old vendored `pomljs` renderer copied into the backend, template reads are cached, and `/ai/poml/render` is exposed behind the `/api` proxy for the direct frontend. Provider/model prompt caching is a later optimization. |

### Old Code Audit Snapshot

| Old feature area | Old files found | Rebuild state | Next action |
| --- | ---: | --- | --- |
| `src/components` visual shell/tabs | 22 | Active direct copy | Preserve visual shape one-to-one; patch only proper backend/TTS/build seams. |
| `src/lib/chat` prompts/storage/memory/queue | 46 | Active direct copy/adapt | Prompt/POML/storage/defaults/provider defaults/chat turn/Twitch queue copied; GRILLO frontend pieces still need runtime verification. |
| `src/lib/grillo` schemas/tools/context | 48 | Active copy | Backend worker and frontend schema/context libs copied; verify non-blocking chat context integration. |
| `src/lib/product` backup/key vault/account | 9 | Active copy | Backup/key vault/account files copied; wire into active UI next. |
| `src/lib/tts` manager/Piper/remote | 8 | Parked shim only | New TTS exists, old manager not active; Piper worker still PARKED. |
| `src/lib/twitch` direct IRC/transcription helpers | 4 | Active copy | Direct IRC and stream transcription helpers copied; backend endpoints still needed. |
| `src/lib/vrm` loader/animation/sequencer/custom library | 9 | Active copy/adapt | Loader/custom library/postprocessing/animation/sequencer copied; active `VrmStage` copied/adapted and mounted. Expression blend still needs REBUILD. |
| `server/src/twitch` IRC/transcriber | 5 | Partial active copy | IRC parser/source and stream transcriber copied; transcription/frame routes wired; full IRC runtime lifecycle still needs integration. |
| `server/src/commands` command parser/router | 3 | Missing | COPY/ADAPT after Twitch/overlay event shape exists. |
| `server/src/overlay` socket/events | 2 | Missing | COPY/ADAPT for browser source/OBS behavior. |
| `server/src/scheduler` queue/scheduler/filtering | 3 | Missing | COPY/ADAPT for Twitch AI behavior. |
| `server/src/mock` mock Twitch source | 1 | Missing | COPY/ADAPT for tests and local dry runs. |
| `server/src/marlin` | present in old repo | Not part of current target | EXCLUDE. |

### Feature Parity Roadmap

1. **Promote the old visual frontend shell**
   Copy/adapt `legacy-frontend/src/components` into the active app. Keep the tab/workflow shape: Account, AI, TTS, Twitch, Context, Character, VRM, Voice Lab, Anim, Emotion Telemetry, Background. Patch only the data/API seams to the new backend.

2. **Restore settings, storage, and backup compatibility**
   Copy/adapt `src/lib/menu`, `src/lib/product`, and the compatible parts of `src/lib/chat/storage.ts`. The app must understand old local backup JSON keys for personas, chat histories, AI/TTS settings, voice/avatar bindings, active tabs, visual settings, Twitch settings, and animation settings.

3. **Restore VRM/avatar foundation**
   Add old VRM dependencies as needed: `three`, `@react-three/fiber`, `@react-three/drei`, `@pixiv/three-vrm`, `@pixiv/three-vrm-animation`. Copy/adapt `loadVrm`, `custom-vrm-library`, postprocessing, and the useful parts of `VrmStage`. The mouth writer remains owned by the new audio/wlipsync layer.

4. **Rebuild animation/emotion safely**
   Keep old user-facing animation controls, presets, telemetry, and sequencer concepts. Do not blindly copy the old expression weight behavior. Build a new expression mixer with priority rules: mouth visemes win for `aa/ih/ou/ee/oh`; emotion/animation expressions can blend around them; debug panels must show final mouth and expression weights.

5. **Restore Twitch live input stack**
   Copy/adapt server IRC parser/source, direct frontend IRC helper, mock Twitch source, Twitch AI queue, command parser/router, scheduler, and overlay event socket. Twitch includes whispers/message modes where supported by the old stack.

6. **Restore Twitch stream transcription and video frame input**
   Copy/adapt `TwitchStreamTranscriber.ts` and `src/lib/twitch/stream-transcription.ts`. Restore:
   - `POST /twitch/transcribe-sample`
   - `POST /twitch/capture-frame`
   - transcript snippets as ambient stream context
   - captured JPEG frame as optional vision context

7. **Extend the new brain contract for vision context**
   Current rebuild messages are text-only. Add image support to the new `LlmMessage` contract and map images through `llmGateway` for providers/models that support vision. Captured Twitch frames should be optional context, not a direct chat message unless the user asks for that behavior.

8. **Wire GRILLO into chat non-blockingly**
   Use GRILLO as a context provider only: ingest completed turns, optionally build context packets before prompt construction, and run ticks without blocking chat/TTS/mouth. GRILLO failures must degrade to no memory context.

9. **Add provider prompt caching deliberately**
   Keep POML for dynamic prompt assembly. Add prompt/cache-key support where providers expose it, likely per OpenRouter/provider route and Vercel Gateway/OpenAI route. Cache at the provider boundary; do not add an extra local queue or delay in front of streaming chat.

10. **Restore commands, overlay, and packaged/OBS surfaces**
   Bring back command-driven camera/VRM/animation/TTS controls, overlay socket events, and browser-source behavior after the active frontend and Twitch backend seams exist.

11. **Park or reintroduce Piper deliberately**
     Keep old Piper assets/settings visible only if it helps compatibility. Reintroduce browser Piper only after Fish/Inworld/avatar parity is stable, or drop it if the product no longer needs offline/browser TTS.

### Copy Policy Going Forward

- Use filesystem copy for old folders/files when the task is "same old feature surface." Do not retype old files.
- After copy, patch compile/import/API seams with small diffs.
- Keep commits isolated by risky subsystem: frontend shell, settings persistence, VRM loader, expression mixer, Twitch IRC, Twitch transcription/frame, overlay/commands, GRILLO chat integration.
- Do not mix TTS scheduling, lipsync, animation weights, and memory changes in one commit.

## Resolved Decisions (Grilling Log)

2026-05-30 note: the parity audit overlay above supersedes older "no code copied" and "not WebWaifu4 parity" language where they conflict. The old decisions still explain why the new brain/TTS contracts stay clean.

Decisions crystallized during grilling. These override anything vaguer elsewhere in the doc.

- **D1 — Backend boundary: thin local backend from Phase 0.** Provider calls (LLM + TTS) run in a local backend on `127.0.0.1:8797`, not the browser. `src/llm/*Client.ts` and `src/tts/*Client.ts` are client-side facades that POST to it. The backend receives request-scoped provider keys via `x-yourwifey-*` headers (env fallback allowed). Resolves the architecture-first-vs-playbook contradiction in favor of the proven WebWaifu4 pattern; avoids CORS/key-exposure rework at Phase 2.
- **D2 — Rollback: green tags on linear `main`.** `git init` is the first action of Phase 0. Linear history, one commit per slice. At each passing exit criterion, create an annotated tag `green/phaseN-criterion` (e.g. `green/phase1-mouth-moves`) — that tag *is* the rollback point (`git checkout`/`git reset --hard green/<last>`). Each dangerous-area change (structured-output, TTS scheduling, lipsync, VAD blend, memory, settings persistence) gets its own commit between two green tags.
- **D11 — Finish the LLM capability layer before TTS.** The manual `replyFormat` dropdown is a "decide by vibes" placeholder. Correct order: (1) `GET /ai/models`, (2) fetch OpenRouter model metadata (`supported_parameters` + `top_provider.supported_parameters`), (3) derive `supportsStructuredOutputs`, (4) **auto-select lane** via a single `selectReplyFormat(provider, modelInfo)` (OpenRouter: structured iff supported, else Lane B text; Vercel gateway: structured by default until real metadata exists — TODO), (5) keep a debug override but not as the normal path. THEN TTS. Fish official JS SDK = `fish-audio` (`github.com/fishaudio/fish-audio-typescript`), `FishAudioClient` + `textToSpeech.convertRealtime()` + `RealtimeEvents.AUDIO_CHUNK` — to be added at the TTS slice with `condition_on_previous_chunks=true`.
- **D10 — TTS is streaming-first; never wait for a full blob. OVERRIDES the doc's "stable full-response first" (D4/Phase 2).** Latency is the product. The LLM text stream feeds TTS incrementally (sentence/clause buffered) and audio plays as it arrives. Primary mode: **Fish WebSocket realtime** (text-stream-in / audio-chunks-out), `condition_on_previous_chunks=true`, `latency=balanced`, model s2. HTTP **chunked** streaming is an acceptable alternative; one-shot full-response is explicitly rejected. This is the doc's "dangerous PCM scheduling" area — mitigate with heavy instrumentation (firstAudioMs, firstTextToAudioMs, chunk counts/bytes, underruns) and clean logging, not by avoiding it. ("mode"/"transport" for TTS — reserve "lane" for output format A/B.)
- **D9 — Fish: S2 default; emotion tags via S1 `(parens)` / S2 `[brackets]` (PARKED to emotion phase).** Fish S2 is the predominant model. Emotion/tone control is inline text: S1 `(happy) ...` at sentence start; S2 `[natural language]`. Mechanism (confirmed): a **prompt-driven switch** instructs the LLM to emit `[bracket]` emotion/tone tags **inline in `message`** (S2 style) when enabled. So tags live inside the spoken `message`, Fish S2 consumes them. Open decision (defer to Phase 9): the chat UI must optionally **strip the tags for display** even though they're sent to TTS — i.e. "display text" vs "TTS text" may diverge by the tags. Keep the `emotion` metadata field too (D3) as the structured signal for the avatar; the inline tag is purely for Fish prosody. Fish realtime params (from the websocket benchmark): `chunk_length` (100–300), `condition_on_previous_chunks` (prosody continuity — keep **true** for streaming lanes), `latency` (balanced ~300ms / normal ~500ms), `model` (s2), `format` (pcm/mp3/wav/opus). `condition_on_previous_chunks` is moot for one-shot full-response. Ref: Fish [real-time streaming](https://docs.fish.audio/developer-guide/best-practices/real-time-streaming), [emotion control](https://docs.fish.audio/developer-guide/best-practices/emotion-control).
- **D8 — PARKED (future): capture reasoning text as "thinking" for GRILLO.** Not built yet. Idea: persist the model's reasoning/thinking output as a separate metadata channel and feed it to GRILLO's reflection/diary processes. The AI SDK exposes reasoning independently (`reasoning-delta` chunks / `result.reasoningText`; OpenAI via `reasoningSummary:'auto'`), so it never touches `message`/TTS. Implementation hook when revisited: add a `reasoning` SSE event beside `delta`, store on the turn, pass to GRILLO. Note: fast "flash" models make *higher* reasoning effort viable (low latency) and richer for diary material — the existing `reasoningEffort` knob is the dial. Stays consistent with D3 (only `message` is spoken).
- **D7 — Reasoning default 'minimal'; structured-output best practices applied.** Reasoning models (gpt-5 family, o-series) get `providerOptions.openai.reasoningEffort = 'minimal'` by default on the gateway — without it gpt-5-nano spends the turn thinking and emits **zero** visible text (confirmed live). `reasoningEffort` is request-overridable. Schema fields carry Zod `.describe()` hints (the descriptions become part of the JSON schema = embedded prompt engineering). Empty/failed completions fail cleanly with a clear error; raw JSON / `<yw-meta>` never reaches the visible/spoken stream. SSE cancel must listen on **`res` 'close', not `req` 'close'** (req close fires when the POST body is read and aborts every stream instantly). Refs: AI SDK [structured data](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) ( `streamText` + `Output.object` + `partialOutputStream`; `streamObject` is deprecated in v6), [structured-outputs guide](https://techsy.io/en/blog/llm-structured-outputs-guide).
- **D6 — No source mirroring; derive from docs. Front-end look is the exception.** The new codebase is built from official docs + first principles, NOT by porting WebWaifu4 logic (porting carries its accumulating bugs). The source may be read to understand *what's needed*, never copied for *how*. **Exception:** the front-end look/feel/markup may be copied 1:1 (the user likes it). Backend/brain logic stays original.
- **D5 — LLM: AI SDK, both gateways from the start, SSE.** Backend uses the AI SDK with `vercel-gateway` and `openrouter-responses` (Responses API) wired from Phase 3, switchable. Transport is SSE; output is streamed JSON / structured output. Keep it simple — no per-slice ceremony beyond the normal green tags. The source WebWaifu4 project may be read to learn *how* it is built; **no code is copied**. Terminology: "lane" = output format only (Lane A/B); the providers are **gateways**, not lanes.
- **D4 — Priority is the core path: backend → TTS → LLM.** No formal "two stability bars" split (deferred). GRILLO is a **backend memory worker**, not the brain; it is built backend-first and deferred until the core path is solid. GRILLO never gates, blocks, or controls chat/TTS/mouth.
- **D3 — Canonical reply schema, parse-and-log.** One `AssistantReply = { message, emotion, valence, arousal, dominance }` from Phase 3 onward — the contract never changes. The parser extracts and logs `emotion` + VAD immediately; only `message` is ever sent to TTS; the avatar consumes `emotion`/VAD only from Phase 9. This supersedes the smaller `{message, emotion}` shape shown in "Output Format Strategy → Lane A". Open follow-up (low-stakes, reversible): pin the concrete `emotion` enum values for the strict `json_schema`. Glossary: see `CONTEXT.md` (Reply, message, metadata, VAD, Lane A/B, `<yw-meta>`).

## Core Principle

Build the smallest loop that feels alive and reliable:

```text
user input
-> LLM stream
-> visible text stream
-> TTS
-> mouth/lipsync
-> avatar render
```

Everything else is secondary.

If a feature does not improve that loop, it does not belong in the first rebuild.

## Non-Negotiables

- Mouth movement must be reliable before adding memory, Twitch, GRILLO, tools, or advanced animation.
- TTS must have one stable mode before live streaming TTS is revisited.
- LLM output must have one reliable format strategy before multi-provider routing is expanded.
- The app must have an obvious rollback point after every feature slice.
- Each feature must be testable in isolation.
- The first rebuild must not copy large chunks from WebWaifu4 blindly.

## Initial Product Scope

The first version is not WebWaifu4 parity.

It is a clean "main brain" application with:

- one local chat input
- one assistant/persona
- one LLM lane
- one TTS lane
- one avatar
- one mouth/lipsync implementation
- one settings export/import format
- one packaged desktop runtime or one web runtime, not both at once

## Explicitly Out of Scope for Phase 1

- GRILLO
- long-term memory
- semantic embeddings
- Twitch
- web research tools
- multiple LLM providers in the UI
- live TTS bridge
- emotion/VAD expression blending
- animation sequencer
- animation telemetry
- VPS deployment
- OBS/browser-source overlay mode
- model marketplace UX
- voice cloning UX
- background worker orchestration
- complex persona switching

These are not rejected. They are postponed until the core loop is stable.

## Recommended Repo Shape

```text
src/
  app/
    App.tsx
    bootstrap.tsx
    routes.ts

  brain/
    BrainController.ts
    BrainTypes.ts
    prompt.ts
    replyParser.ts

  llm/
    LlmClient.ts
    OpenRouterClient.ts
    AiSdkClient.ts
    StructuredSupport.ts

  tts/
    TtsClient.ts
    FishStableTtsClient.ts
    AudioPlayback.ts
    LipsyncSource.ts

  avatar/
    AvatarStage.tsx
    AvatarController.ts
    VrmLoader.ts
    MouthController.ts
    ExpressionController.ts

  settings/
    SettingsStore.ts
    SettingsSchema.ts
    importExport.ts

  ui/
    ChatPanel.tsx
    SettingsPanel.tsx
    StatusPanel.tsx

  shared/
    events.ts
    logger.ts
    ids.ts

server/
  index.ts          # thin local backend, 127.0.0.1:8797
  health.ts         # GET /health
  ai/chat.ts        # POST /ai/chat   (LLM streaming + key-forwarding)
  tts/stream.ts     # POST /tts/stream (Fish proxy)
  providerKeys.ts   # reads x-yourwifey-* request headers, env fallback
```

Note: `src/llm/*Client.ts` and `src/tts/*Client.ts` are **client-side facades**. They do not call providers directly; they POST to the local backend. The backend owns all provider/network calls. See Resolved Decision D1.

## Main Runtime Data Flow

```text
User sends message
BrainController builds prompt
LLM streams reply text
UI displays text as it arrives
Completed/sentence-buffered text goes to TTS
TTS produces audio
AudioPlayback plays audio
LipsyncSource exposes amplitude/viseme data
MouthController updates VRM mouth expressions
AvatarStage renders
```

Important: LLM streaming and TTS playback should be separate concerns. The LLM should not directly mutate avatar state. It should emit reply events. The TTS/audio layer should drive mouth state.

## Core Interfaces

### Brain

```ts
type BrainInput = {
  userText: string;
  persona: PersonaConfig;
  recentMessages: ChatMessage[];
};

type BrainEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'reply-complete'; reply: AssistantReply }
  | { type: 'error'; error: Error };

interface BrainController {
  reply(input: BrainInput): AsyncIterable<BrainEvent>;
}
```

### LLM

```ts
type LlmRequest = {
  messages: LlmMessage[];
  model: string;
  responseFormat?: LlmResponseFormat;
  signal?: AbortSignal;
};

type LlmStreamEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'final'; text: string; metadata?: unknown };

interface LlmClient {
  stream(request: LlmRequest): AsyncIterable<LlmStreamEvent>;
}
```

### TTS

```ts
type TtsRequest = {
  text: string;
  voiceId: string;
  signal?: AbortSignal;
};

type TtsResult = {
  audio: Blob;
  mimeType: string;
};

interface TtsClient {
  synthesize(request: TtsRequest): Promise<TtsResult>;
}
```

Phase 1 should prefer full-response/stable TTS, not live bridge streaming.

### Avatar

```ts
interface AvatarController {
  loadModel(fileOrUrl: string | File): Promise<void>;
  setMouth(weights: MouthWeights): void;
  setExpression(name: string, weight: number): void;
  resetExpression(name: string): void;
}

type MouthWeights = {
  aa: number;
  ih: number;
  ou: number;
  ee: number;
  oh: number;
};
```

Mouth expressions must be controlled by the audio/lipsync system only. Emotion expressions must not block mouth visemes.

## Output Format Strategy

Do not make structured output mandatory for every provider.

Use two lanes:

### Lane A: Structured JSON

Use when the provider/model explicitly supports JSON schema or structured outputs.

```json
{
  "message": "spoken reply",
  "emotion": "amused"
}
```

### Lane B: Text Plus Metadata

Use for models without reliable structured output.

```text
spoken reply here
<yw-meta>{"emotion":"amused"}</yw-meta>
```

The app should choose the lane based on model capability metadata, not vibes.

Rule:

```ts
responseFormat = model.supportsStructuredOutputs ? assistantJsonSchema : undefined;
```

The parser must support both lanes.

## TTS Strategy

Phase 1:

- Use Fish stable/full-response mode.
- Play one complete audio blob.
- Drive mouth from actual audio playback.
- Keep the code simple and boring.

Do not implement live bridge until:

- stable TTS mouth movement is proven
- playback state is observable
- a benchmark/instrumentation harness exists

Required TTS debug counters:

- playback started
- playback ended
- current audio time
- audio amplitude
- mouth weights
- isPlaying
- active source count
- TTS request duration

## Mouth/Lipsync Strategy

The first mouth implementation should be simple:

- Use audio amplitude and/or WLipSync weights.
- Set only VRM mouth expressions: `aa`, `ih`, `ou`, `ee`, `oh`.
- Do not let emotion expressions override mouth.
- Reset mouth to zero when audio stops.

No animation or emotion system should write mouth expressions in Phase 1.

## Avatar Strategy

Phase 1 avatar system:

- load one VRM
- render it
- apply basic camera/model positioning
- update mouth
- optional blink

Avoid:

- animation sequencer
- reaction animations
- VAD expression blending
- procedural body movement
- arm guards
- routelet/OBS-specific render optimizations

Those can return after core stability.

## Settings Strategy

Settings must be boring and durable.

Phase 1 settings:

- LLM provider/model/api key reference
- TTS provider/voice/api key reference
- avatar model path/id
- persona name/system prompt
- simple UI state

Required:

- import JSON
- export JSON
- schema version
- migration function

Do not persist huge runtime telemetry in the main settings object.

## Persona Strategy

Phase 1 persona:

```ts
type PersonaConfig = {
  id: string;
  name: string;
  systemPrompt: string;
  voiceId?: string;
  avatarId?: string;
};
```

Persona switching must reset active chat context unless explicitly importing shared context.

Rule:

```text
persona identity, chat history, voice, avatar, and memory scope are separate keys
```

This prevents Hikari context leaking into Jim Leahy or other characters.

## Testing Strategy

Phase 1 tests should target the actual risk points:

- reply parser handles structured JSON
- reply parser handles text plus `<yw-meta>`
- unsupported structured model selects text lane
- TTS playback state stays active until audio ends
- mouth weights reset after audio ends
- persona switch changes context key
- settings export/import round-trips

Do not rely only on full app manual testing.

## Implementation Phases

### Phase 0: Repo Bootstrap

Goal: empty app shell runs.

Deliverables:

- Vite/Electron or web app shell
- TypeScript strict enough to catch obvious errors
- test runner
- basic logger
- package/build scripts

Exit criteria:

- app opens
- test command passes
- build command passes

### Phase 1: Avatar And Mouth

Goal: load VRM and make mouth move from a local test audio source.

Deliverables:

- VRM loader
- AvatarStage
- MouthController
- test audio playback path
- mouth debug panel

Exit criteria:

- avatar appears
- test audio plays
- mouth moves during audio
- mouth stops after audio

### Phase 2: TTS

Goal: typed text speaks through Fish stable/full-response mode and drives mouth.

Deliverables:

- FishStableTtsClient
- AudioPlayback
- TTS settings
- error display

Exit criteria:

- text -> Fish -> audio works
- mouth moves for generated audio
- no live bridge code exists yet

### Phase 3: LLM

Goal: user input streams visible reply text.

Deliverables:

- LlmClient
- one provider path
- BrainController
- ChatPanel
- reply parser

Exit criteria:

- user sends message
- assistant text streams
- final reply parses metadata
- no raw JSON leaks

### Phase 4: LLM + TTS Integration

Goal: assistant reply speaks.

Deliverables:

- sentence or final-text handoff from LLM to TTS
- simple queue
- stop/cancel button

Exit criteria:

- assistant replies visibly
- assistant speaks
- mouth moves
- stop cancels cleanly

### Phase 5: Settings Import/Export

Goal: user can preserve and move configuration.

Deliverables:

- versioned settings schema
- import/export JSON
- local persistence

Exit criteria:

- export current config
- clear state
- import config
- app returns to same avatar/persona/voice settings

### Phase 6: Provider Capability Routing

Goal: structured output only where supported.

Deliverables:

- model metadata store
- `supportsStructuredOutputs` gate
- structured JSON lane
- text plus metadata lane

Exit criteria:

- capable model uses JSON schema
- incapable model uses text metadata
- no hard failure solely because a model lacks structured output

### Phase 7: Persona Isolation

Goal: switching characters does not leak context.

Deliverables:

- persona profiles
- per-persona chat histories
- per-persona voice/avatar binding

Exit criteria:

- switching persona changes prompt, voice, avatar, and history scope
- switching back restores that persona's context

### Phase 8: GRILLO As Context Provider

Goal: add memory as an input, not as the owner of the main loop.

Deliverables:

- GRILLO context provider interface
- manual memory retrieval call
- prompt context injection

Exit criteria:

- brain works with GRILLO disabled
- brain works with GRILLO enabled
- GRILLO failure does not break chat/TTS/mouth

### Phase 9: Animation And Emotion

Goal: bring emotion/animation back without breaking mouth.

Deliverables:

- simple expression controller
- optional emotion mapping
- animation trigger system

Exit criteria:

- mouth still works during emotional expressions
- no animation writes mouth tracks unless explicitly allowed
- can disable all animation/expression systems from UI

### Phase 10: Live Bridge TTS

Goal: revisit low-latency TTS only after stable mode is boring.

Deliverables:

- live bridge behind a feature flag
- underrun logging
- playback queue instrumentation
- regression tests for playback state

Exit criteria:

- stable mode remains default
- live mode can be enabled/disabled without changing mouth code
- cut-outs have measurable logs

## WebWaifu4 Reference Policy

Do not start by copying WebWaifu4.

Allowed later:

- copy specific known-good functions after reading them
- port VPS lipsync/TTS behavior
- port settings schema ideas
- port prompt wording
- port provider capability routing

Not allowed early:

- wholesale copy of `App.tsx`
- wholesale copy of `VrmStage.tsx`
- immediate GRILLO import
- immediate animation sequencer import
- immediate live bridge import

## Definition Of Stable

The rebuild is stable when:

- 20 local chat replies work in a row
- mouth moves on every spoken reply
- stop/cancel works
- no raw JSON appears in chat/TTS
- persona switch does not leak chat context
- export/import restores the same config
- packaged app launches cleanly

Only after that should GRILLO, Twitch, live bridge, and advanced animation return.

---

# WebWaifu4-Specific Implementation Playbook

This section captures the exact architecture lessons from the current WebWaifu4 project. A rebuild should not copy the code first, but it should copy these decisions unless there is a deliberate reason not to.

## Current Project Stack To Preserve Conceptually

Current WebWaifu4 uses:

- TypeScript
- React 18
- Vite
- Electron
- Three.js
- `@react-three/fiber`
- `@pixiv/three-vrm`
- `@pixiv/three-vrm-animation`
- AI SDK v6 package: `ai`
- `@ai-sdk/gateway`
- `@openrouter/ai-sdk-provider`
- Fish Audio / Fish Speech
- `wlipsync`
- `@huggingface/transformers`
- `onnxruntime-web`
- LadybugDB for memory
- Zod
- POML templates through bundled `pomljs`

Do not port all of this at once. The clean rebuild should initially use only:

- React/Vite/Electron
- Three.js / R3F / VRM
- AI SDK provider wrapper
- one LLM lane
- one Fish stable TTS lane
- one lipsync/mouth lane
- settings import/export

Everything else is later.

## Current Build And Runtime Commands

Current project commands worth preserving conceptually:

```text
npm run build
npm run desktop:pack
npm run desktop:dev
npm run dev
npm run bench:fish
```

Current desktop backend port:

```text
8797
```

Current health endpoint:

```text
GET http://127.0.0.1:8797/health
```

Current packaged app output:

```text
release/win-unpacked/WebWaifu 4.exe
```

The rebuild should keep a similarly boring verification path:

```text
build
package
launch packaged app
check backend health
run one local chat smoke
```

## Provider Architecture: Exact Shape

The rebuild should use AI SDK as the provider abstraction.

Provider layers:

```text
UI settings
-> backend headers/body
-> server runtime provider resolver
-> AI SDK provider
-> model/provider
```

Current provider names:

```text
vercel-gateway
openrouter-responses
```

Important: do not make separate app logic for every downstream model provider. OpenRouter and Vercel AI Gateway are gateways. They contain providers behind them.

Correct mental model:

```text
WebWaifu LLM client
-> AI SDK
-> Vercel AI Gateway OR OpenRouter
-> actual model provider
```

Do not build:

```text
OpenAI lane
Anthropic lane
DeepSeek lane
Gemini lane
Moonshot lane
...
```

Build:

```text
Gateway lane
OpenRouter lane
capability metadata
model id
response-format decision
```

## Provider Keys: Exact Browser-To-Backend Pattern

Current app keeps provider keys browser-side and forwards them to the local backend via headers.

Important headers:

```text
x-yourwifey-llm-provider
x-yourwifey-llm-provider-key
x-yourwifey-openai-byok-key
x-yourwifey-tavily-provider-key
x-yourwifey-tts-provider-key
```

Current browser key names:

```text
OpenRouter: openrouter.apiKey
Vercel AI Gateway: aiGateway.apiKey
OpenAI BYOK: openai.apiKey
Tavily: tavily.apiKey
Fish Speech: fishSpeech.apiKey
Inworld: inworld.apiKey
```

Rebuild rule:

- UI owns provider key entry/storage.
- Backend receives request-scoped provider keys via headers.
- Backend may also support server-side env keys as fallback, but browser-provided keys should work.

Do not hardwire provider keys into the backend-only config if the UI is expected to manage them.

## Vercel AI Gateway Specifics

Current default provider:

```text
vercel-gateway
```

Current default model:

```text
openai/gpt-5-nano
```

Current AI SDK provider:

```text
createGateway({ apiKey })(model)
```

Current BYOK behavior:

```text
providerOptions.gateway.byok.openai = [{ apiKey }]
```

Current GPT-5-specific provider options:

```text
providerOptions.openai.reasoningEffort = "minimal"
providerOptions.openai.reasoningSummary = "auto"
```

Rebuild rule:

- Keep gateway provider creation behind one adapter.
- Keep BYOK as request/provider option metadata, not as a separate OpenAI-only app lane.
- Keep model IDs as gateway model IDs, for example `openai/gpt-5-nano`.

## OpenRouter Specifics

Current OpenRouter provider:

```text
openrouter-responses
```

Current default model:

```text
openai/gpt-4o-mini
```

Recent working/tested model:

```text
deepseek/deepseek-v4-flash
```

Current AI SDK provider:

```text
createOpenRouter({ apiKey, baseURL?, api_keys? })(model)
```

Current critical OpenRouter provider option:

```text
providerOptions.openrouter.provider.require_parameters = true
```

When to set `require_parameters`:

```text
structured output requested
OR tools are available/requested
```

Reason:

- Without it, OpenRouter can silently route to a provider that does not support the requested parameter.
- That silent downgrade caused malformed structured output behavior.
- With it, OpenRouter either routes to a capable provider or fails cleanly.

Rebuild rule:

```text
If asking OpenRouter for json_schema, json_object, tools, or other special parameters, set require_parameters=true.
```

## Model Metadata: Exact Required Fields

The rebuild must fetch and preserve provider model metadata.

Current `/models` handling reads:

```text
model.id
model.type
model.supported_parameters
model.top_provider.supported_parameters
```

Current derived metadata:

```ts
type ProviderModelInfo = {
  id: string;
  supportedParameters: string[];
  supportsStructuredOutputs: boolean;
};
```

Current structured-output detector:

```text
supportsStructuredOutputs = supportedParameters includes "structured_outputs"
```

Rebuild rule:

- Model list cannot be just `string[]`.
- It must include at least model id plus supported parameters.
- The UI/provider decision layer must consume this metadata.

Do not repeat the old bug:

```text
detect supportsStructuredOutputs
then ignore it
```

## Structured Output Routing: Exact Rule

The app must support two assistant reply lanes.

### Lane A: Strict structured JSON

Use only when capability says the model/provider supports it.

Current schema shape:

```json
{
  "message": "spoken dialogue",
  "emotion": "amused",
  "valence": 0.4,
  "arousal": 0.5,
  "dominance": 0.1
}
```

Current response format:

```text
type: json_schema
name: yourwifey_assistant_reply
strict: true
```

Current AI SDK output mode:

```text
Output.object({ name, schema: jsonSchema(schema) })
```

Current streaming behavior:

- Structured stream uses AI SDK partial output.
- Partial object stream is watched for `message`.
- Only incremental `message` deltas are shown/spoken.
- Final object is stringified for parser/final metadata.

### Lane B: Text plus metadata

Use when structured output is not supported or not trusted.

Format:

```text
spoken dialogue here
<yw-meta>{"emotion":"amused","valence":0.4,"arousal":0.5,"dominance":0.1}</yw-meta>
```

Parser must:

- stream visible text
- hide metadata block
- parse final metadata
- not leak raw JSON to TTS

### Exact gate

For OpenRouter:

```text
if model.supportsStructuredOutputs === true:
  use assistant JSON schema
else:
  omit responseFormat and use text + <yw-meta>
```

For Vercel AI Gateway:

```text
initially allow structured output by default
```

But keep this future-ready:

```text
if Gateway exposes equivalent structured-output capability metadata later, use it.
```

## AI SDK Streaming Details To Preserve

Current server-side structured streaming uses:

```text
streamText({ output: structuredOutput })
result.partialOutputStream
result.output
```

Important behavior:

- For non-structured output, forward `text-delta`.
- For structured output, do not expect normal text deltas.
- Instead, read partial object stream and emit deltas from the `message` field.

Important failure rule:

```text
Do not fall back to raw malformed structured text.
```

If structured output fails:

- fail cleanly
- or route the model to text metadata lane next time
- but never speak `{message"` or raw JSON fragments

## Current Chat Endpoint Shape

Current endpoint:

```text
POST /ai/chat
```

Current streaming request body includes:

```text
activeChatters
disableState
llmProvider
maxToolRounds
maxTokens
messages
mode
model
openAiStateMode
responseFormat
stateKey
stateScope
stream
temperature
toolChoiceMode
transportMode
ttsBridge
```

Current stream events:

```text
delta
audio
tts-error
done
error
```

Current normal response:

```text
ok
text
meta
```

Rebuild rule:

- Keep chat transport event types small.
- Do not make TTS/audio state mutate the LLM provider directly.
- `delta` is visible text only.
- `audio` is base64 audio chunk plus MIME/sample rate.
- `done` contains final provider text/meta.

## Current LLM Prompt Requirements

The prompt must explain both output lanes:

```text
When reply format is JSON, return only JSON object with message, emotion, valence, arousal, dominance.
When reply format is normal text, append exactly one <yw-meta> block at the end.
```

Metadata requirements:

```text
emotion enum
valence -1 to 1
arousal 0 to 1
dominance -1 to 1
```

Important prompt instruction:

```text
Put spoken dialogue in message.
Do not use other wrapper names.
Do not explain metadata.
Do not choose animation names as emotions.
```

## Fish TTS Specifics

Current TTS providers:

```text
fish-speech
inworld
piper
```

Rebuild Phase 1 should use:

```text
fish-speech stable/full-response
```

Current remote TTS modes:

```text
live-bridge
full-response
sentence-chunks
```

Current Fish settings:

```text
fishSpeechModel: s2
fishSpeechLatency: balanced
fishSpeechConditionOnPreviousChunks: true
fishSpeechChunkLength: 160
```

Current runtime env/config knobs:

```text
FISH_AUDIO_API_KEY
FISHSPEECH_API_KEY
FISH_AUDIO_BASE_URL
FISH_SPEECH_BASE_URL
FISH_SPEECH_WS_URL
FISH_SPEECH_VOICE_ID
FISH_AUDIO_VOICE_ID
FISH_SPEECH_MODEL
FISH_SPEECH_SAMPLE_RATE
FISH_SPEECH_CHUNK_LENGTH
FISH_SPEECH_CONDITION_ON_PREVIOUS_CHUNKS
```

Rebuild rule:

- Use stable/full-response first.
- Keep live bridge behind a feature flag.
- Do not optimize PCM scheduling until stable TTS mouth is proven.

## Current TTS Proxy Shape

Current browser-to-backend TTS call:

```text
POST /tts/stream
```

Current browser sends:

```text
x-yourwifey-tts-provider-key
```

Current response stream is NDJSON lines:

```json
{"type":"audio","audio":"base64","mimeType":"audio/pcm","sampleRate":24000}
{"type":"done","ok":true}
{"type":"error","ok":false,"error":"..."}
```

Rebuild rule:

- Keep NDJSON for TTS proxy if streaming audio chunks.
- If using full-response stable TTS, it can still return one `audio` event then `done`.
- Parser must reject malformed stream events cleanly, not crash the entire app silently.

## Current Lipsync Lessons

Known-good mouth behavior currently came from VPS source, not the latest local experiments.

Current practical rule:

```text
Do not touch TTS scheduling or lipsync until the core loop is stable.
```

Mouth ownership rule:

```text
Only the audio/lipsync layer writes aa, ih, ou, ee, oh.
```

Emotion expression rule:

```text
Emotion expressions must not suppress mouth visemes.
```

Do not re-add VAD expression blend until:

- current stable mouth is confirmed over many replies
- expression override behavior is understood
- there is a test/debug panel showing mouth weights vs expression weights

## VAD / Emotion Specifics

Current metadata VAD fields:

```text
valence
arousal
dominance
```

These are useful and should remain in metadata.

But do not immediately map them to multiple active VRM expressions.

Safe Phase 1 use:

```text
store/log emotion
store/log VAD
maybe set one simple expression after speech starts
```

Unsafe early use:

```text
blend happy + relaxed + surprised + custom expressions while speech is active
```

Reason:

- Some VRM expressions have `overrideMouth`.
- Multiple expression weights can reduce or block mouth expression multipliers.
- This caused likely mouth-flap regressions.

## Persona And Context Specifics

The rebuild must separate persona identity from active chat context.

Current issue observed:

```text
switching Hikari -> Jim Leahy can carry Hikari context if chat state is not scoped correctly
```

Required keys:

```text
personaId
chatHistoryScope
voiceBinding
avatarBinding
memoryScope
```

Rule:

```text
Switching persona changes the active chat history key.
```

Do not use one global `chatHistory` for every character.

## Current Persistence Keys Worth Understanding

Current local storage keys include:

```text
yourwifey.personas.v1
yourwifey.activePersonaId.v1
yourwifey.aiSettings.v1
yourwifey.chatHistory.v1
yourwifey.chatHistories.v1
yourwifey.relationshipMemory.v1
yourwifey.relationshipMemories.v1
yourwifey.uiState.v1
yourwifey.activeTab.v1
yourwifey.currentBundledModelId.v1
yourwifey.currentCustomVrmModelId.v1
yourwifey.twitchChannel.v1
yourwifey.twitchSettings.v1
yourwifey.emotionTelemetryEvents.v1
yourwifey.sequencerSettings.v1
yourwifey.visualSettings.v1
yourwifey.personaVoiceBindings.v1
yourwifey.voiceLabVoices.v1
```

Rebuild does not need all of these initially.

Phase 1 persistence should include:

```text
personas
activePersonaId
chatHistories
aiSettings
ttsSettings
avatarSettings
uiState
```

Do not start with relationship memory persistence until GRILLO is added.

## GRILLO Specific Rebuild Position

GRILLO should not be the first brain.

Correct role:

```text
GRILLO is a context provider.
```

Main brain flow:

```text
user input
-> optional GRILLO context packet
-> prompt
-> LLM reply
-> TTS
-> avatar
```

GRILLO failure must not break:

- chat reply
- TTS
- mouth movement
- avatar render

GRILLO can be added after:

- persona isolation works
- stable TTS works
- basic LLM output routing works

## Tools And Web Research

Current WebWaifu4 uses Tavily tools behind AI SDK tool calling.

Current tool behavior:

- tools disabled for memory scope
- tools available for chat scope when Tavily key exists
- `maxToolRounds` defaults around 15
- OpenRouter `require_parameters=true` should be set when tools are available

Rebuild rule:

- Do not add tools in Phase 1.
- When tools return, they go through AI SDK tool definitions.
- Tool support is provider-parameter sensitive, so provider metadata matters.

## Electron / Overlay / VPS Position

Do not solve all deployment surfaces first.

Current surfaces:

```text
Electron desktop app
local backend on 8797
web overlay / OBS-style browser source
VPS-hosted server/static version
```

Rebuild order:

1. Local web/Electron dev.
2. Packaged Electron.
3. Overlay/browser source.
4. VPS deployment.

Do not build VPS first unless the goal is explicitly streaming-only.

## Detailed Play-By-Play For Rebuild

### Step 1: Create Provider Registry

Define two gateway providers only:

```text
vercel-gateway
openrouter-responses
```

Each provider config must include:

```text
id
label
defaultModel
modelListEndpoint behavior
apiKeyStorageKey
supportsModelMetadata
```

### Step 2: Implement Model Listing

For OpenRouter:

- call `/models`
- read `supported_parameters`
- read `top_provider.supported_parameters`
- derive `supportsStructuredOutputs`

For Vercel AI Gateway:

- call the gateway model list endpoint if available
- preserve model id/name/context/pricing if exposed
- if no structured metadata exists, default to structured output for initial gateway models but keep a TODO to replace with real capability data

### Step 3: Implement Response Format Selection

Centralize:

```text
selectAssistantResponseFormat(provider, model, modelMetadata)
```

Return:

```text
assistantJsonSchema
```

or:

```text
undefined
```

Do not inline this decision at random call sites.

### Step 4: Implement LLM Streaming

Server adapter:

- receives messages/model/provider/responseFormat
- creates AI SDK model
- if responseFormat exists, use `Output.object`
- if responseFormat absent, stream text deltas
- if structured, stream `message` field from partial object

Client:

- receives visible text only
- updates chat UI
- sends visible text to TTS only if TTS enabled

### Step 5: Implement TTS Stable Mode

Fish stable/full-response:

- send text
- receive one audio result or one audio stream result
- play audio
- expose playback state
- drive mouth from actual playback

Do not include live bridge yet.

### Step 6: Implement Mouth Debug Panel

Always include a simple debug panel early:

```text
isPlaying
audio amplitude
aa ih ou ee oh
current TTS mode
current audio time
```

This prevents blind debugging later.

### Step 7: Implement Settings Export/Import

Export must include:

```text
schemaVersion
personas
activePersonaId
chatHistories
ai settings
tts settings
avatar settings
voice bindings
```

Import must validate version and normalize missing fields.

### Step 8: Add Persona Switching

Persona switch must:

- switch active persona
- switch chat history scope
- switch voice binding
- switch avatar binding if configured
- not reuse previous persona prompt context

### Step 9: Only Then Add GRILLO

GRILLO interface:

```text
getContext({ personaId, participantId, latestUserText }) -> context packet
```

GRILLO output goes into prompt context only.

GRILLO does not control:

- TTS
- mouth
- animation
- provider routing

## Current Known Dangerous Changes To Avoid Repeating

Do not combine these in one commit:

- structured-output schema changes
- TTS streaming changes
- lipsync changes
- emotion/VAD expression blend
- memory worker changes
- settings persistence changes

Each one needs an isolated branch/commit.

Specific known dangerous areas:

- live bridge PCM scheduling
- `isPlaying` lifetime
- WLipSync/audio analyser connection
- VRM expression `overrideMouth`
- AI SDK structured partial output
- OpenRouter parameter support
- tools plus structured output
- persona context scoping

## Current Safe Checkpoint

Current stable local decision:

- VPS TTS/lipsync source restored
- structured-output capability gate restored
- Emotion Log split from Animation tab
- VAD blend intentionally not restored
- live bridge changes intentionally not restored

Use this as a reference checkpoint, not as final architecture.
