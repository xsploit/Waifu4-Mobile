<div align="center">

# WebWaifu4 Rebuild

### _Local-first VTuber AI companion. Rebuilt without changing the shape._

WebWaifu4 Rebuild is a clean rebuild of the WebWaifu4 runtime: LLM brain,
Fish/Inworld TTS, VRM avatar, Twitch chat, memory, tools, captions, and local
backup restore, while keeping the original frontend look and tab workflow.

<br/>

![local-first](https://img.shields.io/badge/local--first-browser_keys-ff3b6b?style=for-the-badge)
![react](https://img.shields.io/badge/react-18-61dafb?style=for-the-badge&logo=react&logoColor=black)
![vite](https://img.shields.io/badge/vite-6-646cff?style=for-the-badge&logo=vite&logoColor=white)
![three.js](https://img.shields.io/badge/three.js-VRM-000?style=for-the-badge&logo=three.js&logoColor=white)
![twitch](https://img.shields.io/badge/twitch-direct_IRC-9146ff?style=for-the-badge&logo=twitch&logoColor=white)
![tts](https://img.shields.io/badge/TTS-Fish_%2B_Inworld-00b8a9?style=for-the-badge)

<br/>

<a href="#what-this-is">What This Is</a>
-
<a href="#features">Features</a>
-
<a href="#provider-and-model-support">Providers</a>
-
<a href="#quick-start">Quick Start</a>
-
<a href="#status">Status</a>

</div>

---

<h2 align="center" id="what-this-is">What This Is</h2>

<p align="center">
  <strong>A local AI co-host stack with a VRM body, realtime voice, Twitch intake, and memory.</strong>
</p>

<p align="center">
  The rebuild keeps the original WebWaifu4 UI shape: Account, Avatar, Background,
  Animation, Emotion Log, Character, Voice Lab, AI, Twitch, Memory, and TTS.
  The internals are being cleaned around the new brain/TTS contracts so the app
  stays fast, debuggable, and less fragile.
</p>

<p align="center">
  Provider keys are stored through the browser Account tab. Backend environment
  keys are fallback only. No hosted WebWaifu account is required.
</p>

---

<h2 align="center" id="features">Features</h2>

<table>
  <tr>
    <td width="50%" valign="top">
      <h3 align="center">Brain</h3>
      <ul>
        <li>OpenRouter Responses and Vercel Gateway chat lanes.</li>
        <li>Structured/text reply routing from model capability metadata.</li>
        <li>OpenRouter-aware model picker metadata: tools, reasoning, vision, images, files, context, max tokens, structured outputs, and embedding tags.</li>
        <li>POML-backed dynamic prompt rendering.</li>
        <li>Main chat Tavily tools through Account-tab keys.</li>
        <li>Visible streamed deltas with metadata kept out of spoken text.</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3 align="center">Voice</h3>
      <ul>
        <li>Fish Speech WebSocket realtime live bridge.</li>
        <li>Fish Timestamp SSE over HTTP with timing metadata.</li>
        <li>Early Chunks mode for fast first speech without waiting for the full reply.</li>
        <li>Fish S2-oriented controls: latency, chunk length, sample rate, format, transport, and continuity.</li>
        <li>Inworld HTTP and WebSocket streaming with delivery, timestamp, and buffer controls.</li>
        <li>Audible browser benchmark for comparing transports and regressions.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3 align="center">Avatar</h3>
      <ul>
        <li>VRM stage with bundled, uploaded, and saved local avatars.</li>
        <li>Three.js/VRM animation playback and non-repeating shuffle sequencing.</li>
        <li>wLipSync/audio-reactive mouth ownership.</li>
        <li>Provider timing metadata routed toward captions/subtitles where available.</li>
        <li>Emotion telemetry with model emotion, VAD, expression, animation, mouth weights, and final expression snapshots.</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3 align="center">Stream</h3>
      <ul>
        <li>Frontend Twitch direct IRC intake without Twitch API keys.</li>
        <li>Local chat and Twitch chat queue behavior.</li>
        <li>Command handling, membership events, and optional backend overlay runtime.</li>
        <li>Stream transcription/ASR controls.</li>
        <li>Video frame capture for vision-capable models.</li>
      </ul>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3 align="center">Memory</h3>
      <ul>
        <li>Ladybug/GRILLO backend memory runtime.</li>
        <li>Relationship memory, diary/reflection entries, candidate memories, semantic records, vector records, and graph state.</li>
        <li>Activity logs and worker context traces for GRILLO passes.</li>
        <li>Local Transformers embedding mode plus provider embedding fallback/filtering.</li>
        <li>Memory debug views and manual worker controls.</li>
      </ul>
    </td>
    <td width="50%" valign="top">
      <h3 align="center">Setup</h3>
      <ul>
        <li>Browser Account tab provider-key vault.</li>
        <li>Voice Lab provider catalog, persona voice binding, and provider voice creation surfaces.</li>
        <li>Local transfer backup import/export for keys, saved VRMs, personas, scoped chat histories, relationship memory, settings, and Voice Lab voices.</li>
        <li>Import/export workers to avoid blocking the VRM stage on large backups.</li>
      </ul>
    </td>
  </tr>
</table>

---

<h2 align="center" id="provider-and-model-support">Provider and Model Support</h2>

<table align="center">
  <tr>
    <th>Area</th>
    <th>Current Surface</th>
  </tr>
  <tr>
    <td>LLM</td>
    <td>OpenRouter Responses, Vercel Gateway, streamed text, structured/text lane gating, model metadata tags.</td>
  </tr>
  <tr>
    <td>Tools</td>
    <td>Main chat Tavily search/extract/crawl path plus GRILLO worker tools.</td>
  </tr>
  <tr>
    <td>TTS</td>
    <td>Fish WebSocket, Fish Timestamp SSE, Inworld HTTP, Inworld WebSocket, browser benchmark.</td>
  </tr>
  <tr>
    <td>Captions and Mouth</td>
    <td>Provider word timing when available, estimated subtitles as fallback, wlipsync owns live mouth movement.</td>
  </tr>
  <tr>
    <td>Memory</td>
    <td>Ladybug/GRILLO, semantic indexing, diary/reflection, relationship profile, activity logs, worker traces.</td>
  </tr>
</table>

---

<h2 align="center" id="quick-start">Quick Start</h2>

```powershell
npm install
npm run dev
```

Open:

```text
http://localhost:5173/
```

Common checks:

```powershell
npm test -- --run
npm run build
npm run smoke:runtime
```

---

<h2 align="center" id="status">Status</h2>

The rebuild is in active parity mode. The current priority is preserving the
original WebWaifu4 look and feature surface while hardening the brain, TTS,
memory, Twitch, and VRM seams.

<table align="center">
  <tr>
    <th>Keep</th>
    <th>Improve</th>
  </tr>
  <tr>
    <td>Original frontend tab shape and visual workflow.</td>
    <td>Provider compatibility, TTS latency, memory safety, and VRM ownership rules.</td>
  </tr>
  <tr>
    <td>Browser Account-tab keys as the main provider-key path.</td>
    <td>Model metadata, OpenRouter edge cases, and provider-specific request shaping.</td>
  </tr>
  <tr>
    <td>Fish/Inworld as primary TTS providers.</td>
    <td>Timing metadata, captions, silence-gap detection, and future mouth-flap experiments.</td>
  </tr>
</table>

## Backlog

- Capture provider-safe reasoning summaries as memory signals when models expose them; do not store hidden chain-of-thought.
- Persist and expose richer GRILLO reasoning/debrief data where useful, beyond compact activity logs and worker traces.
- Add silence/gap detection to the browser TTS benchmark.
- Continue real-key verification for Voice Lab, Tavily tools, Inworld, and OpenRouter edge cases.
- Keep Piper browser TTS parked unless it becomes a priority again.
- Do not move to Electron packaging until the web app feature surface is verified.

## Ground Rules

- Keep the look and tab layout close to the original app.
- Do not replace browser Account-tab keys with backend-only environment configuration.
- Benchmark and audible TTS results override code-shape guesses.
- Do not publish local backup JSON files or real provider keys.
