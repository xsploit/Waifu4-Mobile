# WebWaifu Rebuild

The clean "main brain" application: a small, reliable loop of user input → LLM → text → TTS → mouth → avatar. This glossary pins the language so the same concept is never called two things.

## Language

### Reply

**Reply** (a.k.a. AssistantReply):
One structured assistant response. Always has a spoken **message** plus non-spoken **metadata** (emotion + VAD). The canonical shape is `{ message, emotion, valence, arousal, dominance }` and does not change across phases.
_Avoid_: answer, output, completion.

**message**:
The spoken dialogue inside a Reply. The **only** field ever sent to TTS. Everything else in a Reply is metadata.
_Avoid_: text, content, dialogue (when you mean this specific field).

**metadata**:
The non-spoken part of a Reply — **emotion** and **VAD**. Parsed and logged from Phase 3 onward, but not consumed by the avatar until Phase 9. Must never reach TTS.
_Avoid_: tags, extras.

**emotion**:
A single enum label describing the Reply's affect (e.g. "amused"). Distinct from an animation name — an emotion is never an animation trigger.
_Avoid_: mood, feeling, animation.

**VAD**:
The three affect dimensions carried in metadata: **valence** (−1..1), **arousal** (0..1), **dominance** (−1..1). Logged for now; drives expression only from Phase 9.
_Avoid_: sentiment, affect score.

### Output lanes

**Lane A** (Structured JSON):
The reply path used only when the model's capability metadata says it supports structured outputs. The Reply arrives as strict `json_schema`.
_Avoid_: JSON mode, structured mode.

**Lane B** (Text + meta):
The reply path for models without trusted structured output. The **message** is plain streamed text, followed by exactly one `<yw-meta>` block carrying the metadata as JSON.
_Avoid_: text mode, fallback mode.

**`<yw-meta>`**:
The single metadata block appended at the end of a Lane B reply. The parser streams the visible text, hides this block, and parses it for metadata. Raw `<yw-meta>` JSON must never be spoken.

### Audio And Mouth

**WLipSync mouth**:
The mouth driver for avatar visemes. The same Web Audio source that reaches the speakers is also connected to a WLipSync node; WLipSync volume/weights are the source for `aa/ih/ou/ee/oh`.
_Avoid_: fake mouth, text-only mouth, separate analyzer path.

**audio-reactive state**:
Live values derived from the playing audio path, including playback amplitude and WLipSync volume/weights. Useful for debug panels and later visual reactivity, but amplitude alone is not lipsync.
_Avoid_: treating amplitude as visemes.

### Roles & boundaries

**Persona**:
A character's identity — name, system prompt, voice binding, avatar binding. Separate from the active **chat history**; switching persona switches the active history scope so context never leaks between characters.
_Avoid_: character (when you mean the config object), profile, user.

**GRILLO**:
The long-term memory system, implemented as a **backend memory worker** and used strictly as a **context provider** — it injects an optional context packet into the prompt. It is not the brain and never controls TTS, mouth, animation, or provider routing. GRILLO failure must not break chat/TTS/mouth. (Unrelated to the `/grill` skill.)
_Avoid_: memory brain, the brain.

**gateway**:
An LLM provider aggregator the backend calls through the AI SDK — `vercel-gateway` or `openrouter-responses`. Gateways sit in front of many downstream model providers; the app never builds a per-model-provider lane. Switchable at request time.
_Avoid_: provider lane, LLM lane (the word "lane" is reserved for output format — Lane A/B — only).

**backend**:
The thin local server on `127.0.0.1:8797` that owns all provider (LLM + TTS) network calls. The browser/client never calls providers directly; it POSTs to the backend with request-scoped keys in `x-yourwifey-*` headers.
_Avoid_: server, API (unqualified).

## Example dialogue

> **Dev:** When the LLM streams back, what do we show in the chat panel?
> **Domain expert:** The **message** — only the message. That's the spoken dialogue. The **emotion** and **VAD** are **metadata**; we parse and log them but don't render or speak them yet.
> **Dev:** And if the model can't do strict JSON?
> **Domain expert:** Then we're on **Lane B**: the message streams as plain text and the metadata comes in one `<yw-meta>` block at the end. Same Reply, different lane. The parser hides the `<yw-meta>` so it never reaches TTS.
> **Dev:** Where does emotion turn into a facial expression?
> **Domain expert:** Not until Phase 9. Before that, emotion is just logged. And remember — an emotion is not an animation name. Don't let the model pick "wave" as an emotion.
