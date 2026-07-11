import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { GatewayId, LlmMessage } from '../../src/brain/BrainTypes';
import { completeChat } from '../ai/llmGateway';
import { readProviderKeys } from '../ai/providerKeys';
import { GrilloWorkerService, type GrilloWorkerCompletionRequest } from './GrilloWorkerService';
import {
  getLadybugMemoryService,
  type LadybugSemanticMemoryRecord,
} from './LadybugMemoryService';
import { readQueryStringArray } from './queryValues';

const gatewaySchema = z.enum(['vercel-gateway', 'openrouter-responses']);
const contextBodySchema = z
  .object({
    embeddingModel: z.string().max(240).optional(),
    embeddingProvider: z.string().max(120).optional(),
    embeddingVersion: z.string().max(120).optional(),
    participantKeys: z.array(z.string().max(240)).max(64).optional(),
    query: z.string().max(4000).optional(),
    queryEmbedding: z.array(z.number().finite()).max(10000).optional(),
    scopeKey: z.string().max(240).optional(),
  })
  .strict();
const runtimeBodySchema = z
  .object({
    beatType: z.unknown().optional(),
    embedding: z.unknown().optional(),
    enabled: z.unknown().optional(),
    intervalMs: z.unknown().optional(),
    llmProvider: gatewaySchema.optional(),
    maxRounds: z.unknown().optional(),
    maxToolRounds: z.unknown().optional(),
    memoryModel: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    provider: gatewaySchema.optional(),
    reason: z.unknown().optional(),
    scopeKey: z.unknown().optional(),
  })
  .passthrough();
const migrationApplyBodySchema = z
  .object({
    dryRun: z.boolean(),
    evidenceGeneration: z.string().regex(/^[a-f0-9]{64}$/),
    planHash: z.string().regex(/^[a-f0-9]{64}$/),
    scopeKey: z.string().trim().min(1).max(240),
    sourceGeneration: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const memoryFeedbackBodySchema = z
  .object({
    content: z.string().trim().min(1).max(100_000),
    participantKey: z.string().trim().max(180).optional(),
    scopeKey: z.string().trim().min(1).max(240),
    source: z.string().trim().max(120).optional(),
  })
  .strict();
const memoryCorrectionBodySchema = memoryFeedbackBodySchema.extend({
  correctedValue: z.json(),
  reason: z.string().trim().min(1).max(2_000),
  targetClaimId: z.string().trim().min(1).max(240),
});

let grilloWorkerService: GrilloWorkerService | null = null;

function getGrilloWorkerService() {
  grilloWorkerService ??= new GrilloWorkerService(getLadybugMemoryService());
  return grilloWorkerService;
}

function normalizeScopeKey(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : 'local:persona:default';
}

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? value[0] : undefined;
}

function sendError(res: Response, error: unknown, fallback: string) {
  res.json({
    ok: false,
    backend: getLadybugMemoryService().getBackendLabel(),
    error: error instanceof Error ? error.message : fallback,
  });
}

function resolveGateway(req: Request, body: z.infer<typeof runtimeBodySchema>): GatewayId | null {
  const raw = body.provider ?? body.llmProvider ?? header(req, 'x-yourwifey-llm-provider');
  const parsed = gatewaySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function toLlmMessages(messages: GrilloWorkerCompletionRequest['messages']): LlmMessage[] {
  return messages.map((message) => ({
    content: message.content,
    role: message.role,
  }));
}

function createGrilloCompletion(req: Request, body: z.infer<typeof runtimeBodySchema>) {
  const keys = readProviderKeys(req);
  const provider = resolveGateway(req, body);
  const model = body.model ?? body.memoryModel ?? header(req, 'x-yourwifey-llm-model') ?? '';
  const apiKey = keys.llmKey;
  if (!provider || !model || !apiKey) {
    return {
      completion: undefined,
      model,
      provider: provider ?? 'backend-native',
    };
  }

  return {
    completion: async (workerRequest: GrilloWorkerCompletionRequest) => {
      const result = await completeChat({
        apiKey,
        byokOpenAiKey: keys.byokOpenAiKey,
        jsonMode: workerRequest.responseFormat.type === 'json_object',
        maxTokens: workerRequest.maxTokens,
        messages: toLlmMessages(workerRequest.messages),
        model,
        provider,
        temperature: workerRequest.temperature,
      });
      return {
        meta: { model: result.model, provider: result.provider },
        text: result.text,
      };
    },
    model,
    provider,
  };
}

export function createMemoryRouter() {
  const router = Router();

  router.get('/status', async (_req, res) => {
    try {
      res.json({ ok: true, ...(await getLadybugMemoryService().getStatus()) });
    } catch (error) {
      sendError(res, error, 'Ladybug memory status failed.');
    }
  });

  router.get('/graph', async (_req, res) => {
    try {
      res.json({
        ok: true,
        backend: getLadybugMemoryService().getBackendLabel(),
        graph: await getLadybugMemoryService().getGraphSummary(),
      });
    } catch (error) {
      sendError(res, error, 'Ladybug memory graph load failed.');
    }
  });

  router.post('/grillo/turn', async (req, res) => {
    try {
      res.json({
        ok: true,
        backend: getLadybugMemoryService().getBackendLabel(),
        ...(await getGrilloWorkerService().ingestTurnPair(req.body ?? {})),
      });
    } catch (error) {
      sendError(res, error, 'GRILLO turn ingest failed.');
    }
  });

  router.post('/grillo/run/manual', async (req, res) => {
    try {
      res.json({
        ok: true,
        backend: getLadybugMemoryService().getBackendLabel(),
        result: await getGrilloWorkerService().runManualExtraction(req.body ?? {}),
      });
    } catch (error) {
      sendError(res, error, 'GRILLO manual run failed.');
    }
  });

  router.get('/grillo/context', async (req, res) => {
    try {
      res.json({
        ok: true,
        backend: getLadybugMemoryService().getBackendLabel(),
        packet: await getGrilloWorkerService().buildContextPacket({
          participantKeys: readQueryStringArray(
            req.query.participantKeys ?? req.query.participantKey,
          ),
          query: req.query.query,
          scopeKey: req.query.scopeKey,
        }),
      });
    } catch (error) {
      sendError(res, error, 'GRILLO context packet failed.');
    }
  });

  router.post('/grillo/context', async (req, res) => {
    try {
      const input = contextBodySchema.parse(req.body ?? {});
      res.json({
        ok: true,
        backend: getLadybugMemoryService().getBackendLabel(),
        packet: await getGrilloWorkerService().buildContextPacket(input),
      });
    } catch (error) {
      sendError(res, error, 'GRILLO context packet failed.');
    }
  });

  router.get('/grillo/ledger', async (req, res) => {
    try {
      res.json({
        ok: true,
        backend: getLadybugMemoryService().getBackendLabel(),
        ledger: await getGrilloWorkerService().getEvidenceLedgerReplay(req.query.scopeKey),
      });
    } catch (error) {
      sendError(res, error, 'GRILLO evidence ledger load failed.');
    }
  });

  router.get('/grillo/projection', async (req, res) => {
    try {
      res.json({
        ok: true,
        backend: getLadybugMemoryService().getBackendLabel(),
        projection: await getGrilloWorkerService().getEvidenceLedgerProjection(req.query.scopeKey),
      });
    } catch (error) {
      sendError(res, error, 'GRILLO ledger projection failed.');
    }
  });

  router.get('/grillo/projection/coverage', async (req, res) => {
    try {
      res.json({
        ok: true,
        backend: getLadybugMemoryService().getBackendLabel(),
        coverage: await getGrilloWorkerService().getEvidenceProjectionCoverage(req.query.scopeKey),
      });
    } catch (error) {
      sendError(res, error, 'GRILLO projection coverage audit failed.');
    }
  });

  // Read-only migration diagnostics: compares the legacy relationship prompt
  // lane with the ledger projection. Does not feed live prompt injection.
  router.get('/grillo/projection/shadow', async (req, res) => {
    try {
      res.json({
        ok: true,
        backend: getLadybugMemoryService().getBackendLabel(),
        shadow: await getGrilloWorkerService().getPromptShadowComparison(
          req.query.scopeKey,
          readQueryStringArray(req.query.participantKeys ?? req.query.participantKey),
        ),
      });
    } catch (error) {
      sendError(res, error, 'GRILLO prompt shadow comparison failed.');
    }
  });

  router.get('/grillo/migration/plan', async (req, res) => {
    try {
      res.json({
        ok: true,
        backend: getLadybugMemoryService().getBackendLabel(),
        plan: await getGrilloWorkerService().getEvidenceMigrationPlan(req.query.scopeKey),
      });
    } catch (error) {
      sendError(res, error, 'GRILLO migration planning failed.');
    }
  });

  router.post('/grillo/migration/apply', async (req, res) => {
    try {
      const body = migrationApplyBodySchema.parse(req.body ?? {});
      const result = await getGrilloWorkerService().applyEvidenceMigration(body.scopeKey, body);
      const status =
        result.status === 'stale' || result.status === 'blocked'
          ? 409
          : result.status === 'failed'
            ? 500
            : 200;
      res.status(status).json({
        ok: status === 200,
        backend: getLadybugMemoryService().getBackendLabel(),
        result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ ok: false, error: 'Invalid GRILLO migration request.' });
        return;
      }
      res.status(500);
      sendError(res, error, 'GRILLO migration apply failed.');
    }
  });

  router.post('/grillo/feedback', async (req, res) => {
    try {
      const body = memoryFeedbackBodySchema.parse(req.body ?? {});
      res.json({
        ok: true,
        backend: getLadybugMemoryService().getBackendLabel(),
        evidence: await getGrilloWorkerService().recordMemoryFeedback(body),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ ok: false, error: 'Invalid GRILLO feedback request.' });
        return;
      }
      res.status(500);
      sendError(res, error, 'GRILLO feedback write failed.');
    }
  });

  router.post('/grillo/correction', async (req, res) => {
    try {
      const body = memoryCorrectionBodySchema.parse(req.body ?? {});
      const result = await getGrilloWorkerService().recordMemoryCorrection(body);
      res.status(result.decision.outcome === 'applied' ? 200 : 409).json({
        ok: result.decision.outcome === 'applied',
        backend: getLadybugMemoryService().getBackendLabel(),
        result,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ ok: false, error: 'Invalid GRILLO correction request.' });
        return;
      }
      res.status(500);
      sendError(res, error, 'GRILLO correction write failed.');
    }
  });

  router.get('/grillo/runtime', (_req, res) => {
    res.json({
      ok: true,
      backend: getLadybugMemoryService().getBackendLabel(),
      runtime: getGrilloWorkerService().getRuntimeStatus(),
    });
  });

  router.put('/grillo/runtime', async (req, res) => {
    try {
      const body = runtimeBodySchema.parse(req.body ?? {});
      res.json({
        ok: true,
        backend: getLadybugMemoryService().getBackendLabel(),
        runtime: getGrilloWorkerService().start({
          enabled: body.enabled,
          intervalMs: body.intervalMs,
        }),
      });
    } catch (error) {
      sendError(res, error, 'GRILLO runtime update failed.');
    }
  });

  router.post('/grillo/run/tick', async (req, res) => {
    try {
      const body = runtimeBodySchema.parse(req.body ?? {});
      const lane = createGrilloCompletion(req, body);
      const result = await getGrilloWorkerService().runTickWithOptions(
        {
          beatType: body.beatType,
          reason: body.reason,
          scopeKey: body.scopeKey,
        },
        {
          completion: lane.completion,
          maxRounds: body.maxRounds,
          maxToolRounds: body.maxToolRounds,
          model: lane.model,
          provider: lane.provider,
        },
      );
      res.json({
        ok: true,
        backend: getLadybugMemoryService().getBackendLabel(),
        result,
      });
    } catch (error) {
      sendError(res, error, 'GRILLO tick failed.');
    }
  });

  router.get('/grillo', async (req, res) => {
    try {
      const scopeKey = normalizeScopeKey(req.query.scopeKey);
      res.json({
        ok: true,
        backend: getLadybugMemoryService().getBackendLabel(),
        scopeKey,
        state: await getLadybugMemoryService().loadGrilloState(scopeKey),
      });
    } catch (error) {
      sendError(res, error, 'Ladybug GRILLO memory load failed.');
    }
  });

  router.put('/grillo', async (req, res) => {
    try {
      const body = req.body as { scopeKey?: unknown; state?: unknown };
      const scopeKey = normalizeScopeKey(body.scopeKey);
      await getLadybugMemoryService().saveGrilloState(scopeKey, body.state);
      res.json({ ok: true, backend: getLadybugMemoryService().getBackendLabel(), scopeKey });
    } catch (error) {
      sendError(res, error, 'Ladybug GRILLO memory save failed.');
    }
  });

  router.delete('/grillo', async (req, res) => {
    try {
      const scopeKey = normalizeScopeKey(req.query.scopeKey);
      await getLadybugMemoryService().deleteGrilloState(scopeKey);
      res.json({ ok: true, backend: getLadybugMemoryService().getBackendLabel(), scopeKey });
    } catch (error) {
      sendError(res, error, 'Ladybug GRILLO memory delete failed.');
    }
  });

  router.get('/semantic', async (req, res) => {
    try {
      const scopeKey = normalizeScopeKey(req.query.scopeKey);
      res.json({
        ok: true,
        backend: getLadybugMemoryService().getBackendLabel(),
        records: await getLadybugMemoryService().loadSemanticRecords(scopeKey),
        scopeKey,
      });
    } catch (error) {
      sendError(res, error, 'Ladybug semantic memory load failed.');
    }
  });

  router.put('/semantic', async (req, res) => {
    try {
      const body = req.body as { records?: unknown; scopeKey?: unknown };
      const scopeKey = normalizeScopeKey(body.scopeKey);
      const records = Array.isArray(body.records) ? body.records : [];
      await getLadybugMemoryService().saveSemanticRecords(
        scopeKey,
        records as LadybugSemanticMemoryRecord[],
      );
      res.json({ ok: true, backend: getLadybugMemoryService().getBackendLabel(), scopeKey });
    } catch (error) {
      sendError(res, error, 'Ladybug semantic memory save failed.');
    }
  });

  router.delete('/semantic', async (req, res) => {
    try {
      const scopeKey = normalizeScopeKey(req.query.scopeKey);
      await getLadybugMemoryService().deleteSemanticRecords(scopeKey);
      res.json({ ok: true, backend: getLadybugMemoryService().getBackendLabel(), scopeKey });
    } catch (error) {
      sendError(res, error, 'Ladybug semantic memory delete failed.');
    }
  });

  router.post('/semantic/search', async (req, res) => {
    try {
      const body = req.body as { embedding?: unknown; limit?: unknown; scopeKey?: unknown };
      const scopeKey = normalizeScopeKey(body.scopeKey);
      const embedding = Array.isArray(body.embedding)
        ? body.embedding.filter((value): value is number => typeof value === 'number')
        : [];
      const limit = typeof body.limit === 'number' ? body.limit : 8;
      res.json({
        ok: true,
        backend: getLadybugMemoryService().getBackendLabel(),
        matches: await getLadybugMemoryService().querySemanticVectors(scopeKey, embedding, limit),
        scopeKey,
      });
    } catch (error) {
      sendError(res, error, 'Ladybug semantic vector search failed.');
    }
  });

  router.get('/relationships', async (_req, res) => {
    try {
      res.json({
        ok: true,
        backend: getLadybugMemoryService().getBackendLabel(),
        profiles: await getLadybugMemoryService().loadRelationshipProfiles(),
      });
    } catch (error) {
      sendError(res, error, 'Ladybug relationship profile load failed.');
    }
  });

  router.put('/relationships', async (req, res) => {
    try {
      const body = req.body as { profiles?: unknown };
      const profiles =
        body.profiles && typeof body.profiles === 'object' && !Array.isArray(body.profiles)
          ? (body.profiles as Record<string, unknown>)
          : {};
      await getLadybugMemoryService().saveRelationshipProfiles(profiles);
      res.json({ ok: true, backend: getLadybugMemoryService().getBackendLabel() });
    } catch (error) {
      sendError(res, error, 'Ladybug relationship profile save failed.');
    }
  });

  router.delete('/relationships', async (req, res) => {
    try {
      const scopeKey = normalizeScopeKey(req.query.scopeKey);
      await getLadybugMemoryService().deleteRelationshipProfile(scopeKey);
      res.json({ ok: true, backend: getLadybugMemoryService().getBackendLabel(), scopeKey });
    } catch (error) {
      sendError(res, error, 'Ladybug relationship profile delete failed.');
    }
  });

  return router;
}
