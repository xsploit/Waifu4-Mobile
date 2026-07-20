# WebWaifu4 Performance Handoff - 2026-07-12

## Immediate Goal

Diagnose noticeable UI input delay, animation micro-stutters, and possible lip-sync timing drift in the regular browser app at `http://localhost:5173/`.

Do not make speculative performance changes. Establish a measured baseline after the PC restart, identify the actual hot path, then make the smallest verified fix.

## User Priorities

- Live interaction latency is paramount.
- Browser/Electron audio must always play locally so VRM lip sync and the stream can hear it.
- Discord voice is a collaboration/input surface and is disabled by default. It must not create a second TTS pipeline in normal use.
- Do not touch the validated LLM or TTS streaming behavior unless a trace proves it is the cause.
- Preserve the existing frontend, settings, assets, accounts, imported browser data, VRM behavior, and tab parity.
- Test on the regular Vite origin, `http://localhost:5173/`, because that origin contains the user's saved browser state. Port `8797` is the backend, not the normal app URL.

## Current Git State

- Repository: `C:\Users\SUBSECT\Documents\GitHub\wWeb Waifu4`
- Branch: `main`
- Local HEAD: `a985491 Restore validated browser PCM playback behavior`
- `a985491` is intentionally local and not pushed yet. Do not push it or replace the GitHub release until the user audibly confirms playback and lip sync.
- Public repository: `https://github.com/xsploit/webwaifu4-rebuild`
- Current public release: `v1.0.1`
- The public release is based on `1284a8b` and still includes the problematic playback changes from `4906008`.

Known local-only/unrelated working-tree items must not be reverted or committed accidentally:

```text
 M .gitignore
?? AGENTS.md
?? CLAUDE.md
?? GEMINI.md
?? locks/
```

## Playback Regression and Rollback

Commit `4906008 Align PCM playback and Discord interruption` changed browser PCM scheduling and subtitle timing. The user then observed worse audio behavior and lip sync.

Commit `a985491` restores the exact pre-`4906008` browser PCM scheduler and subtitle tracking behavior while preserving unrelated Discord interruption and memory fixes.

Verification already completed after the rollback:

- Focused TTS manager and Discord interruption tests: 9 tests passed.
- TypeScript typecheck: passed.
- Production build: passed.

Do not add the proposed `Hybrid / wLipSync Direct` setting yet. The user asked to test the rollback first, and no files were changed for that setting.

## Confirmed TTS and Lip-Sync Shape

- `wlipsync` v1.3.0 is installed and live.
- `src/lib/tts/manager.ts` loads `public/assets/lipsync-profile.json`.
- The same PCM gain node feeds audio analysis and wLipSync.
- Current wLipSync configuration is `smoothness = 0.03` and `blockSize = 256`.
- `src/lib/vrm/lipsync.ts` has not changed during the July 12 work.
- wLipSync remains the primary mouth source when available. Timestamp phonemes are fallback data.
- Fish live bridge does not intentionally synthesize twice: live bridge deltas update subtitles, frontend chunk synthesis is disabled while the bridge is active, and finalization closes the bridge instead of resynthesizing the whole reply.
- Discord defaults are off: `enabled: false`, `connectOnStart: false`, and `ttsOutputMode: 'local-only'`.

## Performance Symptom

The user reports:

- Keystrokes appear a few milliseconds late.
- Idle/VRM animations have visible micro-stutters.
- The whole interface feels behind rather than one isolated control being slow.
- The symptom was noticed before a reliable TTS test could be completed.

This currently looks more like frame-time contention than a text-input-specific bug, but that is not yet proven.

## Evidence Collected Before Restart

The regular frontend was running on PID `70328` at port `5173`; backend PID `14280` was on port `8797`. These PIDs will be stale after reboot.

There were many unrelated Node/browser processes alive. Notable processes included:

- `dist/bot/index.js` around 223 MB working set.
- `server/dist/index.js` around 221 MB.
- Vite around 120 MB.
- Several old MCP/server processes.
- Multiple Chrome renderers, including roughly 693 MB and 559 MB working sets.

A five-second idle CPU sample did **not** show a runaway CPU loop. The largest sampled activity was Chrome GPU around 1.9% of one core and one Chrome renderer around 0.9% of one core. This makes a gross CPU spin unlikely, but it does not rule out intermittent long frames, GC pauses, GPU contention, or React rerender storms.

A fresh controlled browser tab could fill a 36-character controlled chat input in about 30 ms. That does not reproduce the user's sustained-tab micro-stutter and must not be treated as proof that the app is fine.

## Recent Code Worth Checking

Recent commits:

```text
a985491 Restore validated browser PCM playback behavior
1284a8b Harden packaged relaunch smoke cleanup
ea289a1 Prepare signed-shape v1.0.1 desktop artifacts
6dc3725 Document live relationship merge entrypoint
6160c77 Guard avatar swaps and routelet physics
4906008 Align PCM playback and Discord interruption
4987c9b Serialize canonical memory mutations
6effefe Ignore stale provider model catalogs
ff3198c Isolate semantic memory by participant
25830bc Preserve memory fallback when canonical clear fails
73e90fb Prevent stale replies and cross-scope chat leakage
34e3c57 Fix duplicate memory graph rows in settings
```

`6160c77` added explicit node-constraint and spring-bone updates only inside `routelet=1` render mode. Normal browser mode still calls `vrm.update(delta)`, so this commit is not an obvious cause for regular `5173` lag.

## First Steps After Restart

1. Start only the backend and regular Vite frontend. Do not start Electron, Discord bot, dream worker, inspector, or squad workers.
2. Open `http://localhost:5173/` using the existing saved browser profile.
3. Reproduce with the same saved VRM and idle animation before opening settings-heavy tabs.
4. Record a 15-30 second Chrome Performance trace while typing continuously and while the avatar idles.
5. Inspect long tasks, scripting time, React commits, GC pauses, animation-frame spacing, GPU activity, and repeated network/persistence calls.
6. Compare with the same scene after temporarily pausing only the VRM frame loop. Do not delete or rewrite it; use a reversible diagnostic flag.
7. If typing becomes smooth with the VRM loop paused, profile `SceneRuntime/useFrame`, expression updates, animation mixer, spring bones, post-processing, telemetry callbacks, and React state updates originating from the frame loop.
8. If typing remains delayed, profile `App.tsx` controlled input rerenders, settings persistence, relationship persistence, memory polling, overlay socket reconnects, and repeated effects.
9. Measure heap over several minutes and across model reload/import before claiming a memory leak.
10. Make one scoped change, rerun typecheck/tests/build, and have the user test the regular `5173` origin before committing or pushing.

## Runtime Commands

Use the system Node executable, not the Python 2.7 `nodejs_wheel` shim.

```powershell
Set-Location 'C:\Users\SUBSECT\Documents\GitHub\wWeb Waifu4'

# Build backend if needed
& 'C:\Program Files\nodejs\npm.cmd' run build:server

# Backend terminal
& 'C:\Program Files\nodejs\node.exe' server/dist/index.js

# Frontend terminal
& 'C:\Program Files\nodejs\node.exe' node_modules/vite/bin/vite.js
```

Expected URLs:

- Regular app with saved browser data: `http://localhost:5173/`
- Backend health/API and WebSocket server: `http://127.0.0.1:8797/`

## Release Rule

Do not publish a new Electron build or alter `v1.0.1` until:

1. The regular browser app is smooth under the user's real saved profile.
2. Fish playback has no cuts or repeated tail.
3. Mouth movement is visibly synchronized.
4. Focused tests, typecheck, production build, and desktop smoke test pass.
5. A final credential and local-artifact sweep is clean.

