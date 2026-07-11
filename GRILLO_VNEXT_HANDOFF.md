# GRILLO vNext Handoff

Use this document to orient a fresh coding session working on memory in the
WebWaifu rebuild. Read `CONTEXT.md` first for the project's canonical language.

## Objective

Evolve the existing GRILLO memory system in the clean WebWaifu rebuild using
the strongest ideas proven in the later Neuro and Hikari experiments. Do not
replace GRILLO with a hosted memory product by default. Keep LadybugDB as the
local graph/query engine and preserve GRILLO's role as an optional context
provider: memory failure must never break chat, TTS, mouth, animation, or model
routing.

The target architecture is:

```text
immutable evidence ledger
        |
        v
GRILLO extraction and dream/reflection worker
        |
        +--> versioned claims, corrections, decisions, diary, opinions
        |
        v
rebuildable LadybugDB projections and local vector indexes
        |
        v
retrieval controller --> budgeted context packet --> main reply model
```

## Current Progress (2026-07-11)

- Phase 1 is live. Native GRILLO context packets use current-query semantic
  vectors, preserve source/evidence IDs, and report inclusion, dropping,
  duplicates, retrieval strategy, and embedding generation.
- Phase 2's canonical foundation is live in
  `server/memory/GrilloEvidenceLedger.ts`. New local and Twitch turn pairs are
  copied into append-only evidence records without changing the existing turn
  graph or reply pipeline.
- Evidence-gated claims, corrections, and worker decisions support `ADD`,
  `UPDATE`, `SUPERSEDE`, `NOOP`, `REJECT`, and `DEFER`. They enforce scope,
  exact-target supersession, temporal validity, duplicate no-ops, and explicit
  handling of conflicting current claims.
- `GET /api/memory/grillo/ledger?scopeKey=...` replays the canonical records
  into current claim states and reports malformed record IDs. This is an
  inspection surface; existing blocks, slots, relationships, and prompt
  injection still use their established projections.
- `server/memory/GrilloLedgerProjector.ts` deterministically rebuilds current
  beliefs, relationship claims, slots, and a provenance-only timeline. Its
  stable SHA-256 generation changes only when canonical state changes and is
  inspectable at `GET /api/memory/grillo/projection?scopeKey=...`.
- The live background worker can call `core.worker_claim_propose`. The tool
  accepts grounded subject/predicate/JSON-value claims, automatically carries
  extraction turn IDs, records applied/deferred/rejected decisions, and exposes
  current claims through the existing memory read/search tools. Deferred and
  no-op proposals do not inflate worker write counts.
- `GET /api/memory/grillo/projection/coverage?scopeKey=...` now audits exact
  predicate/value coverage for current blocks, slots, and relationship profile
  fields. Value-only matches stay explicitly uncovered, block/slot drift blocks
  readiness, and malformed ledger records also force `ready=false`.
- Ledger mutation is serialized per scope. Replay applies supersession
  independently of storage order, rejects invalid temporal intervals, includes
  participant identity in claim identity, and reports dangling, self-referential,
  or time-travelling correction/supersession records as integrity issues.
- Native and JSON-fallback scope deletion now remove the complete GRILLO record
  set for only the requested scope. Once Ladybug falls back, that backend stays
  pinned for the service lifetime instead of retrying native storage mid-run.
- `GET /api/memory/grillo/projection/shadow?scopeKey=...` is a read-only prompt
  migration report. It reconciles turn events with turn evidence, reports exact
  included/dropped legacy and ledger IDs, and refuses `safeToSwitch` when
  coverage, integrity, reconciliation, or lane-budget gates fail. It is not
  called by live chat. Optional `participantKeys` query values now apply the
  same participant filtering used by the live blocks and slots lanes.
- `GET /api/memory/grillo/migration/plan?scopeKey=...` is a read-only evidence
  migration planner. It proposes only deterministic turn-event-to-evidence
  inserts/no-ops/conflicts, schedules zero claim writes, and classifies legacy
  profile fields as durable claim candidates, rebuildable projections, derived
  runtime state, or records requiring provenance.
- Migration plans now carry stable source, evidence, and complete-plan hashes.
  Exact existing evidence becomes a no-op; duplicate source IDs, any canonical
  mismatch, malformed turns, stale generations, or ledger integrity failures
  block writes.
- `POST /api/memory/grillo/migration/apply` rebuilds the plan inside a per-scope
  queue, appends only `evidence_records`, and writes append-only started,
  completed, or failed migration receipts. Partial evidence remains canonical
  and retry-safe; the migration path never deletes evidence as rollback.
- The approved Hikari backfill completed for
  `local:persona:hikari-chan`: eight evidence records were inserted, all eight
  turn IDs reconcile exactly, zero claims were inferred, and a fresh retry is
  `already_applied`. The relationship shadow correctly remains
  `safeToSwitch=false` because 22 legacy profile items are not yet represented
  by evidence-backed claims/projections.
- Current `safeToSwitch` is deliberately limited to the relationship-memory
  lane. It does not yet prove parity for channel history, diary, semantic recall,
  client-side budget reduction, or the final rendered POML prompt.
- Semantic vector retrieval now filters known model/provider/version
  generations even when dimensions match. If no exact generation exists, only
  records with explicitly unknown legacy metadata may be used as a compatibility
  fallback. Known mismatched generations never mix, and an unrelated query no
  longer receives arbitrary recent semantic records.
- `POST /api/memory/grillo/feedback` appends immutable feedback evidence.
  `POST /api/memory/grillo/correction` appends correction evidence first, then
  records a scoped correction and worker decision. Participant identity must
  match the target claim. These writes remain outside live prompt injection.
- Browser promotion now clusters normalized equivalent claims and requires
  distinct source-turn evidence. Unrelated facts of the same type and duplicate
  candidates from one turn cannot satisfy corroboration; multiple approved
  clusters merge into one block version instead of overwriting each other.
- Fable verification of `0b1f4db` found no actionable issues. Scalar and
  comma-separated participant query values now reach both context and shadow
  routes, corrections require exact participant identity, participant-filtered
  shadow output mirrors the live lane, and empty migration scopes are distinct
  from completed no-op migrations. The full release audit passed with 72 test
  files and 355 tests.
- End-to-end prompt provenance is now live without controlling prompt selection.
  Optional server receipts name ordered requested/included occurrences and exact
  participant, record, item, semantic, lane, and duplicate drops. The client
  carries those IDs through every budget reducer, and browser fallback items get
  deterministic IDs instead of time/random identities.
- The final prompt receipt proves normalized-equivalent GRILLO block inclusion
  after POML's whitespace transform, hashes the actual rendered and outbound
  message arrays, and verifies that stream-vision attachment leaves the system
  message unchanged. Hashing starts only after `requestChatCompletion` has
  started, remains in React debug memory, and is neither persisted nor sent to
  the model. The Context tab exposes the receipt for inspection.
- The provenance release gate passed with 74 test files and 367 tests. Two
  bounded Fable reviews of the newest range exhausted their cost caps before
  returning a verdict; do not mislabel that range as Fable-verified.
- Worker extraction and semantic-indexing watermarks are now isolated per
  memory scope while the root snapshot remains compatible with the current UI.
  Cross-scope local/Twitch regression coverage proves both lanes and their
  no-op reruns. Commit `43c7014` passed the full release gate with 74 test files
  and 368 tests.
- A persistent cross-process lease is not implemented. LadybugDB advertises
  transactions, but the installed Node binding exposes no transaction or
  compare-and-swap API, the JSON fallback serializes writes only inside one
  process, and deployment does not enforce one instance. Do not substitute a
  read-then-write singleton lock: it can grant the lease to two processes.
- The repair queue foundation is live as append-only `repair_queue_events`.
  Manual feedback and correction evidence enqueue deterministic scoped tasks;
  `GET /api/memory/grillo/repair-queue` exposes replayed open, deferred, or
  resolved state. The GRILLO worker has participant-filtered `repair_list` and
  ownership-checked `repair_transition` tools. Commits `34ab97a` and `233e119`
  passed the full release gate with 75 test files and 370 tests.
- Repair diagnosis is not yet automatic. Add deterministic enqueue rules for
  weak grounding, missing lanes, dropped evidence, and unresolved questions;
  do not let model-written summaries alone create these signals.
- Provenance-enabled context packets now include a deterministic memory
  sufficiency receipt. It detects correction, temporal, commitment,
  relationship, personal, and metacognitive intent; emits stable retrieval
  probes; names required/missing lanes and dropped relevant IDs; and reports
  sufficient, partial, or insufficient context. Commit `a863915` passed the
  full release gate with 76 test files and 378 tests.
- Sufficiency remains diagnostic. The probes do not trigger a second retrieval,
  and partial/insufficient receipts do not write repair events. Either behavior
  would add work to chat preflight and must be latency-measured before wiring.
- Before any live switch, produce repeated participant-aware whole-prompt shadow
  reports. Also add the repair queue, a real atomic persistent worker lease,
  and an explicit per-scope switch with rollback. A live switch still requires
  separate user approval.

## Project Map

### Authoritative rebuild

`C:\Users\SUBSECT\Documents\GitHub\wWeb Waifu4`

- This is the project to modify.
- TypeScript, React, Electron, and a local backend.
- GRILLO is implemented in `server/memory/GrilloWorkerService.ts`.
- Ladybug persistence and graph/vector projections are implemented in
  `server/memory/LadybugMemoryService.ts`.
- Browser/client memory integration is under `src/lib/chat/`.
- Preserve the terminology and boundaries in `CONTEXT.md`.

### Original WebWaifu4 reference

`C:\Users\SUBSECT\Documents\GitHub\WebWaifu4`

- Reference only. Do not accidentally implement the rebuild's changes here.
- Its GRILLO worker was ported almost verbatim into the authoritative rebuild.
- A direct comparison found only unused type-export changes between the two
  `GrilloWorkerService.ts` files.
- A previous provider compatibility repair changed GRILLO from strict
  `json_schema` output to `json_object` plus local Zod validation. Preserve that
  design unless a selected provider is proven to support the stricter schema.

### Neuro memory reference

`C:\Users\SUBSECT\Documents\GitHub\dreaming-discord-bot`

Useful concepts to port, not Discord-specific behavior:

- Append-only JSONL evidence is canonical; MemFS, beliefs, graphs, and vectors
  are rebuildable projections.
- Evidence-gated dream writes with applied/rejected/deferred decision receipts.
- Facts and observations have temporal validity and explicit supersession.
- Explicit corrections, answer feedback, memory-quality signals, commitments,
  open questions, retrieval lessons, and self-critiques.
- Context lanes expose included, dropped, and duplicate IDs.
- Intent-specific retrieval probes and a pre-answer memory-sufficiency receipt.
- Dream watermarks, leases, run lifecycle receipts, and quarantine support.
- Deterministic memory benchmarks and integrity checks.

Do not port Neuro's Discord guild tools, heartbeat autonomy, cross-channel
continuity, or other Discord-specific behavior into WebWaifu without a separate
product requirement.

### Hikari/Mnemo memory reference

`C:\Users\SUBSECT\Downloads\Riko\mnemo`

Useful experimental concepts after the factual memory foundation is sound:

- Episodic, semantic, reflection, and diary layers.
- Local `Xenova/all-MiniLM-L6-v2` embeddings by default.
- Structured cognitive appraisal before a reply.
- Uncertain user-model hypotheses and observable short-horizon predictions.
- Prediction resolution from later replies or reactions.
- Learned retrieval/strategy utility from non-neutral outcomes.
- Explicitly imaginary rehearsal stored outside historical memory.
- Slow, evidence-gated self-model and policy evolution.

Simulation, prediction, or imagined future records must never enter episodic or
semantic recall as facts about what happened.

## Current GRILLO Capabilities

The rebuild already has a substantial memory system. Do not rebuild these
features under new names:

- A separate backend worker with extraction, relationship, reflection,
  consolidation, curiosity, tag-elaboration, compaction, and semantic-indexing
  beats.
- Turn events, memory candidates, memory blocks, memory slots, slot patches,
  diary entries, relationship profiles, emotion state, activity logs, and
  worker context traces.
- Worker tools for reading/searching memory, writing candidates/diary/blocks,
  patching profiles, updating emotion, and inserting archival memory.
- Source turn IDs on candidate and diary writes.
- Scope and participant filtering.
- Ladybug graph mirrors and dimension-specific native vector indexes.
- Local embedding support with provider fallback.
- Provider-compatible JSON mode with local Zod validation.
- Per-lane and global context budgets with reduction summaries.
- Browser/local fallback behavior when the native backend is unavailable.

## Resolved Recall Defect

The original native-packet path discarded the browser's query-based semantic
result and substituted recent records with synthetic scores. Phase 1 repaired
that path: the native packet now receives current-query vector matches with
stable record and evidence IDs, scores, timestamps, scope metadata, and exact
embedding model/provider/version filtering. Known incompatible generations do
not mix, and unrelated queries no longer receive arbitrary recent records.

The later observability gap is now closed diagnostically. Server receipts cover
all memory lanes, client receipts survive every budget reduction, and the final
receipt proves normalized-equivalent inclusion in the actual POML output plus
system-message preservation at the outbound request boundary. POML normalizes
the block's whitespace, so verification intentionally compares canonical
whitespace rather than claiming raw byte inclusion. Prompt selection and live
projection ownership remain unchanged.

## Structural Weaknesses To Address

### Shape validation is not evidence validation

Zod currently proves that worker output has an accepted shape. It does not
prove that a memory claim is supported by the cited turns. Durable writes need
an evidence acceptance step and a decision receipt.

### Promotion does not establish corroboration

The browser promotion policy groups high-confidence candidates by participant
and type. Two unrelated facts can satisfy the minimum count and enter
`verified_facts`. Model-produced confidence is not independent corroboration.
Cluster equivalent claims and inspect their evidence before promotion.

### Mutable summaries lose history

Blocks, relationship profiles, and slots represent current prose but cannot
reliably answer what was believed previously, when it changed, or why. Add
versioned claims and deterministic current-state projections.

### Context reduction lacks provenance receipts

The context packer reports reduction counts but not exact included, dropped,
and duplicate memory IDs. The system cannot currently prove which memory the
reply model actually saw.

### Vector records lack a complete lifecycle contract

Vectors should be rebuildable indexes, not canonical memory. Store embedding
model ID, version, dimension, source record ID, and index generation. Never mix
incompatible embeddings silently.

## Proposed Record Model

Keep raw evidence immutable and derive current state from it.

```text
Episode
  id, scope, participant, timestamp, role, content, source metadata

MemoryClaim
  id, kind, subject, predicate/key, value, confidence
  validFrom, validTo, evidenceIds, supersedesRecordIds, status

OpinionDelta
  id, subject, priorStateId, direction/change, reasonSummary, evidenceIds

MemoryCorrection
  id, target, correction, author, timestamp, evidenceIds, status

WorkerDecision
  id, runId, operation, targetId, outcome
  applied|rejected|deferred|noop, evidenceIds, publicReason

MemoryProjection
  deterministic current belief, relationship, slot, entity, and timeline views

VectorIndexEntry
  sourceRecordId, embeddingModel, embeddingVersion, dimension, generation
```

Store concise provider-safe reasoning summaries and decision rationales. Do not
attempt to extract or persist hidden chain-of-thought.

## Ordered Implementation Plan

### Phase 1: Recall correctness and observability

1. Route current-query vector matches into the native GRILLO packet.
2. Preserve stable IDs and evidence IDs through every context lane.
3. Return per-lane included, dropped, and duplicate IDs.
4. Add retrieval traces showing probes, scores, budgets, and final inclusion.
5. Add deterministic tests for relevant recall, irrelevant recall, scope
   isolation, context dropping, and embedding-dimension changes.

### Phase 2: Evidence ledger and temporal claims

1. Add immutable evidence, claim, correction, and worker-decision records.
2. Implement `ADD`, `UPDATE`, `SUPERSEDE`, `NOOP`, `REJECT`, and `DEFER`.
3. Require known evidence IDs for durable worker writes.
4. Add `validFrom`, `validTo`, and exact-target supersession rules.
5. Rebuild current beliefs, relationships, slots, and timelines from the ledger.

### Phase 3: Retrieval controller and repair loop

1. Deterministic temporal, correction, commitment, relationship, personal, and
   metacognitive intent detection is complete.
2. Deterministic intent-specific retrieval probes are emitted diagnostically;
   executing additional probes is not wired.
3. The memory-sufficiency receipt is computed before answering for
   provenance-enabled packets, but it does not yet control retrieval or reply
   behavior.
4. The append-only worker repair queue, explicit feedback/correction producers,
   and participant-safe worker tools are complete. Add deterministic producers
   for weak grounding, missing lanes, dropped evidence, and unresolved
   questions.
5. Per-scope watermarks are complete. Add a persistent lease only after the
   storage layer has an atomic acquire/renew/release primitive (or deployment
   explicitly guarantees one worker instance) so overlapping processes cannot
   process the same evidence.

### Phase 4: Developmental experimentation

1. Add structured scene appraisal and uncertain user hypotheses.
2. Add a small number of observable short-horizon predictions.
3. Resolve predictions only from later external evidence.
4. Learn bounded retrieval/response-strategy utility from attributed outcomes.
5. Keep rehearsal in a separate simulation ledger.
6. Permit self-model or policy changes only after repeated evidence and replay
   evaluation show no factual, temporal, persona, latency, or context regression.

## Required Evaluation Cases

- A corrected preference overrides an older inferred preference.
- A temporal question retrieves both old and current states in order.
- Two unrelated facts do not count as corroboration of one claim.
- An unsupported but shape-valid worker write is rejected.
- A failed or duplicate worker run does not create duplicate durable claims.
- A query retrieves relevant older semantic evidence instead of arbitrary recent
  records.
- Context receipts name exactly what the model saw and what was dropped.
- Persona and participant scopes never leak into one another.
- Rebuilding Ladybug projections from the ledger produces equivalent current
  state.
- Switching embedding models creates a new generation or rebuild instead of
  mixing dimensions/models.
- Imagined rehearsal never appears as historical evidence.

## Non-Goals

- Do not replace LadybugDB simply to adopt Letta, Zep, Mem0, or Graphiti names.
- Do not make GRILLO control replies, TTS, mouth, animation, or provider routing.
- Do not store hidden model chain-of-thought.
- Do not add Discord autonomy or cross-server behavior to WebWaifu.
- Do not implement learned policy evolution before deterministic memory and
  replay evaluations are trustworthy.

## First Session Prompt

Use the following prompt when handing this to another coding session:

```text
Read CONTEXT.md and GRILLO_VNEXT_HANDOFF.md in
C:\Users\SUBSECT\Documents\GitHub\wWeb Waifu4. Treat this rebuild as the only
repo to modify; WebWaifu4, dreaming-discord-bot, and mnemo are read-only
references. Inspect the current git diff before editing. Begin with Phase 1:
verify the confirmed native semantic-recall bypass in code and tests, then
propose the smallest implementation slice that sends real current-query vector
matches through the native GRILLO packet with stable provenance IDs and context
receipts. Do not start later developmental features until recall correctness is
measured.
```
