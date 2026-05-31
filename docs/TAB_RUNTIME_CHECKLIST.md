# Tab Runtime Checklist

Purpose: bounded manual/runtime verification for the copied frontend shell. Use this after code-level wiring passes so manual testing is concrete and does not turn into open-ended feature hunting.

Rules:

- Account-tab browser keys are the primary provider configuration path.
- Backend env keys are fallback only.
- Frontend direct IRC is the primary Twitch chat path.
- Do not change main LLM/TTS streaming behavior from this checklist unless a reproducible runtime failure points there.
- Stop and ask before inventing new behavior for overlay-only UI, talk animations, Piper priority, Twitch private whispers, or custom VRM expression authoring.

## Local Smoke

1. Start the app in dev mode.
2. Confirm the backend health indicator is reachable.
3. Open Settings.
4. Click every tab once.
5. Confirm no tab throws, blanks, or traps focus.
6. Send one local chat message.
7. Confirm visible assistant text appears and no raw metadata/JSON is spoken or displayed as normal dialogue.
8. If TTS is enabled, confirm playback starts, mouth moves, and stop cancels playback.

## Account

Pass:

- Provider key rows render for OpenRouter, Vercel AI Gateway, Fish Speech, Inworld, OpenAI BYOK, and Tavily where configured.
- Saving and deleting a provider key updates browser-local status.
- Export produces a local transfer JSON.
- Importing a known local backup restores settings without uncaught UI errors.

Stop/ask:

- If a provider flow only works through backend env keys.
- If import would require dropping unknown legacy backup fields.

## Avatar / VRM

Pass:

- Bundled model selector changes the active model.
- Custom `.vrm` file import loads or reports a visible error.
- Saved VRM refresh/load/delete controls update the saved model list.
- Camera/model visual controls affect the stage.

Stop/ask:

- If a missing old VRM option requires changing storage schema.

## Background

Pass:

- Persona/custom/chroma/transparent modes update the scene.
- Custom background image/overlay/filter fields persist.
- Desktop relaunch/click-through controls are visible only when the desktop runtime supports them.

Stop/ask:

- Overlay-only behavior is ambiguous: ask before hiding controls or changing OBS/browser-source UI.

## Animation

Pass:

- Playlist rows render with purpose groups.
- Enable/disable changes sequencer state.
- Manual play triggers an animation request.
- Shuffle/loop/speed/duration controls persist.
- No weighted chance control is present.

Stop/ask:

- If talk animations need to become active TTS behavior now. That is a future product decision.

## Emotion Log

Pass:

- Recent assistant emotion/VAD entries appear after chat replies.
- VRM telemetry shows mouth weights and non-mouth expression weights.
- Mouth keys remain owned by audio/wlipsync during speech.

Stop/ask:

- Before adding new expression blending or custom expression authoring.

## Character

Pass:

- Create, edit, delete, and switch personas.
- Persona switch changes scoped chat/history/memory context.
- Switching back restores that persona's context.

Stop/ask:

- If old backup/persona fields conflict with current scoped storage.

## Voice Lab

Pass:

- Saved local voice profiles can be created, edited, assigned, and deleted.
- Current active voice can be bound to the active persona.
- Provider voice list/create controls use Account-tab provider keys.

Real-key verify:

- Fish voice listing.
- Fish provider voice creation.
- Inworld voice listing.
- Inworld provider voice creation.

Stop/ask:

- If a provider requires a new account/auth flow not already represented in the Account tab.

## AI

Pass:

- Provider switch updates model defaults.
- Refresh Models loads provider model IDs and metadata tags.
- Chat picker excludes known embedding/image/video/non-chat/premium-cost models.
- Selected model shows capability tags such as `json`, `vision`, `tools`, `cache`, and context size when metadata exists.
- Health refresh reports current backend/provider state.

Stop/ask:

- Before changing main chat streaming, response parsing, or provider transport behavior.

## Twitch

Pass:

- Direct IRC status and channel controls render.
- Switching channel updates the active channel.
- Queue, mention, ambient, batch, and reset controls persist.
- Chat overlay toggle changes overlay state.
- ASR model selector offers supported OpenRouter transcription models plus Fish ASR.
- Stream frame/vision controls persist.

Real-channel verify:

- Anonymous frontend IRC receives public chat for a live channel.
- Stream ASR endpoint returns a transcript with the selected provider key.
- Stream frame endpoint returns an image and can be attached as optional vision context.

Stop/ask:

- Before adding Twitch API-key flows or private whisper intake.

## Memory / Context

Pass:

- Clear draft/chat/memory/reset context controls work without breaking active chat.
- GRILLO/Ladybug controls report status and fail visibly but non-blockingly.
- Embedding mode selector supports auto/browser/provider.
- Provider embedding picker is filtered by provider metadata while allowing typed custom IDs.
- Prompt/debug panels render current memory context.

Stop/ask:

- If memory failures block chat, TTS, or mouth movement.

## TTS

Pass:

- Fish/Inworld/Piper provider selector renders existing settings.
- Fish shows WebSocket/timestamp SSE, format, sample rate, latency, chunk length, and previous-chunk conditioning.
- Inworld shows HTTP/WebSocket, timestamps, delivery mode, buffer controls, and auto mode.
- Voice refresh/select/manual ID/test/speak/stop/cache controls render.
- Benchmark can run selected providers/transports and copy results.

Real-key verify:

- Fish current segmented vs single/realtime behavior remains audible without cutouts.
- Fish timestamp SSE returns timestamp data when selected.
- Inworld HTTP and WebSocket return audio and metadata.

Stop/ask:

- Before changing playback scheduling, lipsync ownership, or live bridge behavior.

## Packaged Desktop Checkpoint

Run only after the web/dev flow is stable enough:

1. Build/package the desktop app.
2. Launch packaged desktop mode.
3. Confirm backend health on port `8797`.
4. Run one local chat smoke.
5. Confirm Settings opens and the active tab persists.
