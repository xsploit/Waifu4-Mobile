# Voice and Scene Awareness Todo

Planning document only. Nothing here is committed to implementation until we explicitly choose a slice.

## Goals

- Keep local controller chat visible and persistent even when Twitch mode is off.
- Add a proper voice input surface with microphone discovery, permissions, VAD, and ASR.
- Add optional stream/game scene awareness using video plus audio understanding.
- Keep provider-heavy features gated, measurable, and off by default.

## Local Chat Persistence

- Twitch mode should be off by default.
- Local chat messages between the controller and the AI must remain visible in the left chat log.
- Persist a useful recent local chat window so the controller can see what they said and what the AI answered.
- Keep local chat history separate from Twitch chat history.
- Verify persistence across:
  - app refresh
  - Twitch mode off
  - Twitch mode on
  - persona switch
  - Electron packaged runtime

## Voice Tab

- Add a dedicated Voice tab instead of overloading TTS.
- Detect available microphones.
- Show microphone permission state clearly.
- Provide a microphone device picker.
- Add an input level meter.
- Add push-to-talk recording.
- Add VAD state display:
  - idle
  - listening
  - speech detected
  - silence
  - stopped
- Add transcript preview before sending to chat.
- Add send/discard controls.
- Keep auto-send disabled by default.
- Add an armed mode later, after push-to-talk is stable.

## ASR

- Add ASR provider selection.
- Candidate ASR lanes:
  - Fish, if the API is available and reliable for ASR.
  - OpenAI Whisper / transcription, if reachable.
  - Local Whisper sidecar, later.
- Voice input should produce a normal local-controller chat turn.
- Preserve source labels so the prompt can distinguish typed local chat from voice local chat.
- Track latency:
  - mic start
  - VAD speech start
  - recording stop
  - ASR request start
  - ASR result
  - chat request start
  - LLM first token
  - TTS first audio

## Voice Safety Defaults

- Push-to-talk first.
- Open mic off by default.
- Auto-send off by default.
- Twitch voice input should not send as Twitch chat by default.
- Add panic controls:
  - stop listening
  - stop ASR
  - stop TTS
  - clear pending voice transcript

## Gemini Video Plus Audio Awareness

Use Gemini as the primary native video plus audio understanding lane. Other providers can be fallback lanes only if they can prove equivalent video+audio behavior.

Architecture:

```text
stream/clip source -> clip sampler/uploader -> Gemini analysis -> compact scene packet -> POML Current Scene
```

Default behavior should be event-based, not continuous high-detail processing:

- Low-cost periodic scene pulse.
- On-demand "what just happened?" analysis.
- Event-triggered richer clip analysis.
- No always-on high-FPS mode unless explicitly enabled.

Scene packet should be compact:

```text
Recent stream context:
- visible:
- audio:
- event:
- mood:
- reply relevance:
```

Do not inject implementation details such as provider route, file ids, sampling internals, or token math into the persona prompt.

## Marlin-Equivalent Settings Reference

Prior Marlin-sidecar defaults from the local validation/handoff:

- `FPS=2.0`
- `FPS_MAX_FRAMES=120`
- `VIDEO_MAX_PIXELS=200704`

Upstream Marlin README defaults:

- `FPS=2.0`
- `FPS_MAX_FRAMES=240`
- `FPS_MIN_FRAMES=4`
- `VIDEO_MAX_PIXELS=200704`
- `FORCE_QWENVL_VIDEO_READER=torchcodec`

Our sidecar goal lowered `FPS_MAX_FRAMES` from `240` to `120` so one request covers about 60 seconds at 2 FPS instead of about 120 seconds. That is better for stream pulses and keeps request latency bounded.

Equivalent Gemini estimate assumptions:

- 1 hour stream = 3600 seconds.
- Marlin-like continuous visual sampling at 2 FPS = 7200 frames/hour.
- Gemini default frame tokenization is 258 tokens per frame.
- Gemini low media resolution frame tokenization is 66 tokens per frame.
- Gemini audio tokenization is 32 tokens per second.
- Audio for 1 hour = 115,200 audio tokens.

Approximate 1 hour Gemini 2.5 Flash-Lite input cost:

- Default media resolution, 2 FPS:
  - Video frame tokens: 7200 * 258 = 1,857,600.
  - Audio tokens: 3600 * 32 = 115,200.
  - Cost: about $0.22 input.
- Low media resolution, 2 FPS:
  - Video frame tokens: 7200 * 66 = 475,200.
  - Audio tokens: 115,200.
  - Cost: about $0.08 input.
- Batch API would be roughly half where available.

Approximate 1 hour Gemini 2.5 Flash input cost:

- Default media resolution, 2 FPS: about $0.67 input.
- Low media resolution, 2 FPS: about $0.26 input.

Notes:

- Output cost should be small if summaries stay compact.
- Continuous 2 FPS is likely overkill for a live avatar.
- A rolling 60 second Marlin-style clip at 2 FPS hits the 120-frame cap.
- Repeating that every minute over an hour has the same frame count as continuous 2 FPS, but better operational control.
- For static scenes, use lower FPS or low media resolution.
- For fast gameplay, use event-triggered higher FPS clips.

## Current Code Interval Cost Reference

Current implemented Twitch stream context is not running Marlin. It has two separate optional lanes:

- Stream transcription:
  - enabled by `streamTranscriptionEnabled`
  - default sample length: `15s`
  - default interval: every `90s`
  - default model: `openai/whisper-large-v3`
- Stream vision:
  - enabled by `streamVisionContextEnabled`
  - default capture: one JPEG frame
  - default detail: `low`
  - default interval: every `120s`
  - default max age for prompt attachment: `180s`

Per hour, if both are enabled at defaults:

- Audio sampled: `3600 / 90 * 15 = 600s` of audio per hour.
- Frames captured: `3600 / 120 = 30` frames per hour.

Approximate Gemini 2.5 Flash-Lite equivalent input cost if replacing the current ASR+frame signals:

- Audio-only ASR-equivalent lane:
  - `600s * 32 audio tokens/s = 19,200 audio tokens`
  - at `$0.30 / 1M audio input tokens`: about `$0.006/hour`
- Frame-only vision-equivalent lane:
  - low media resolution: `30 * 66 = 1,980 video/image tokens`
  - at `$0.10 / 1M text/image/video input tokens`: about `$0.0002/hour`
  - default media resolution: `30 * 258 = 7,740 video/image tokens`
  - at `$0.10 / 1M`: about `$0.0008/hour`
- Combined current-sampling equivalent:
  - low media resolution: about `$0.006/hour`
  - default media resolution: about `$0.007/hour`

Approximate Gemini 2.5 Flash equivalent input cost for the same current-sampling equivalent:

- Audio: `19,200 tokens * $1.00 / 1M = $0.019/hour`
- Low frame lane: `1,980 tokens * $0.30 / 1M = $0.0006/hour`
- Default frame lane: `7,740 tokens * $0.30 / 1M = $0.0023/hour`
- Combined:
  - low media resolution: about `$0.020/hour`
  - default media resolution: about `$0.022/hour`

If replacing the current system with unified Gemini video+audio clips:

- Using the transcription cadence: `15s` clip every `90s` = `600s` of video+audio analyzed per hour.
  - Flash-Lite low media resolution: about `$0.010/hour`
  - Flash-Lite default media resolution: about `$0.021/hour`
  - Flash low media resolution: about `$0.031/hour`
  - Flash default media resolution: about `$0.066/hour`
- Using the vision cadence: `15s` clip every `120s` = `450s` analyzed per hour.
  - Flash-Lite low media resolution: about `$0.007/hour`
  - Flash-Lite default media resolution: about `$0.016/hour`
  - Flash low media resolution: about `$0.023/hour`
  - Flash default media resolution: about `$0.049/hour`

Conclusion:

- Current-code cadence is cheap if mapped to Gemini.
- The meaningful design choice is not price; it is whether we want separate ASR+frame hints or unified video+audio clips.
- Unified Gemini clips every 90-120 seconds are still cheap enough for experiments, especially on Flash-Lite.

## Marlin-Style Clip Cadence Cost

Marlin itself is visual/video only. It does not replace ASR. The original integration plan was:

```text
Marlin visual events + Whisper/ASR transcript + Twitch chat -> compact ambient context
```

If we want Gemini to replace that with unified video+audio understanding, estimate against Marlin-style frame sampling, not the current one-frame vision lane.

At current transcription cadence:

- `15s` clip every `90s`
- `40` clips/hour
- Marlin-style frames per clip: `15s * 2 FPS = 30 frames`
- Frames/hour: `40 * 30 = 1200 frames`
- Audio/hour if using unified Gemini video+audio: `600s`

Approximate Gemini 2.5 Flash-Lite input cost:

- Low media resolution: about `$0.014/hour`
- Default media resolution: about `$0.037/hour`

Approximate Gemini 2.5 Flash input cost:

- Low media resolution: about `$0.043/hour`
- Default media resolution: about `$0.112/hour`

At 10 second clips every 90 seconds:

- Frames/hour: about `800`
- Audio/hour: about `400s`
- Flash-Lite low/default: about `$0.009/hour` / `$0.025/hour`
- Flash low/default: about `$0.027/hour` / `$0.075/hour`

If running continuous Marlin-style coverage for the full hour:

- Frames/hour: `7200`
- Audio/hour: `3600s`
- Flash-Lite low/default: about `$0.08/hour` / `$0.22/hour`
- Flash low/default: about `$0.26/hour` / `$0.67/hour`

Takeaway:

- Current WebWaifu intervals plus Marlin-style sampling are still cheap on Gemini.
- The bigger cost is latency and complexity, not dollars.
- Marlin-style 15s pulses every 90s are probably the right experiment shape if we want useful context without continuous analysis.

## Open Questions

- Should video awareness come from OBS, desktop capture, game capture, or the app canvas?
- Should Discord/operator voice be ingested separately from app microphone input?
- Should ASR transcripts auto-enter chat when armed, or always require preview?
- Should Gemini scene awareness run on an interval, on user request, or from detected stream/game events?
- Should Marlin/local VLM remain a separate optional sidecar alongside Gemini?

## Suggested Implementation Order

1. Fix and verify local chat persistence in all modes.
2. Add Voice tab shell with mic permission/device detection and level meter.
3. Add push-to-talk recording and transcript preview.
4. Add ASR provider abstraction and first provider.
5. Add VAD-assisted stop.
6. Add compact scene packet support in the prompt path.
7. Add Gemini video+audio clip analysis as an opt-in experimental lane.
8. Add interval/event scheduling for scene pulses only after manual clip analysis works.
