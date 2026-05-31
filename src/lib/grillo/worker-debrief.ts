// @ts-nocheck
export interface WorkerDebriefSideEffects {
  candidateIds: string[];
  diaryIds: string[];
  profileVersions: number[];
  slotWrites: number;
  archivalWrites: number;
}

export interface WorkerDebriefToolCall {
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
}

export interface WorkerDebriefIssue {
  code:
    | "missing_candidate_write"
    | "missing_diary_write"
    | "failed_tool_call"
    | "suppressed_recovery";
  toolName?: string;
  message: string;
}

export interface WorkerDebriefRecoveryAction {
  toolName: string;
  args: Record<string, unknown>;
  reason: string;
}

export interface WorkerDebriefPlan {
  issues: WorkerDebriefIssue[];
  recoveryActions: WorkerDebriefRecoveryAction[];
  suppressedCount: number;
  suppressionNotes: string[];
}

export interface WorkerDebriefInput {
  parsedObject: Record<string, unknown> | null;
  sideEffects: WorkerDebriefSideEffects;
  toolCalls: WorkerDebriefToolCall[];
  maxRecoveryActions?: number;
}

const CANDIDATE_TYPES = new Set(["preference", "fact", "goal", "boundary", "bond_signal", "thread"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

function toolCallFailed(call: WorkerDebriefToolCall): boolean {
  if (!isObject(call.result)) return false;
  if (call.result.ok === false) return true;
  if (asString(call.result.error).length > 0) return true;
  return false;
}

function hasSuccessfulToolCall(toolCalls: WorkerDebriefToolCall[], toolName: string): boolean {
  return toolCalls.some((call) => call.toolName === toolName && !toolCallFailed(call));
}

function normalizeCandidateAction(raw: unknown): { args?: Record<string, unknown>; suppression?: string } {
  if (!isObject(raw)) return {};
  const type = asString(raw.type);
  const content = asString(raw.content);
  const summary = asString(raw.summary);
  if (!CANDIDATE_TYPES.has(type) || !content.length || !summary.length) {
    return { suppression: "candidate payload missing required fields for recovery write" };
  }
  const confidence = asNumber(raw.confidence);
  return {
    args: {
      type,
      content,
      summary,
      confidence: confidence === null ? 0.75 : Math.max(0, Math.min(1, confidence)),
      tags: asStringArray(raw.tags).slice(0, 8),
    },
  };
}

function normalizeDiaryAction(raw: unknown): { args?: Record<string, unknown>; suppression?: string } {
  if (!isObject(raw)) return {};
  const summary = asString(raw.summary);
  const personalThought = asString(raw.personal_thought);
  if (!summary.length || !personalThought.length) {
    return { suppression: "diary payload missing required fields for recovery write" };
  }
  return {
    args: {
      summary,
      personal_thought: personalThought,
      tags: asStringArray(raw.tags).slice(0, 8),
      content: asString(raw.content) || undefined,
      interaction_summary: asString(raw.interaction_summary) || undefined,
      user_message: asString(raw.user_message) || undefined,
      context_tags: asStringArray(raw.context_tags).slice(0, 8),
      involved_users: asStringArray(raw.involved_users).slice(0, 8),
      emotions: Array.isArray(raw.emotions) ? raw.emotions : undefined,
      beat_type: asString(raw.beat_type) || undefined,
    },
  };
}

function dedupeRecoveryActions(actions: WorkerDebriefRecoveryAction[]): WorkerDebriefRecoveryAction[] {
  const out: WorkerDebriefRecoveryAction[] = [];
  const seen = new Set<string>();
  for (const action of actions) {
    const key = `${action.toolName}:${JSON.stringify(action.args)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(action);
  }
  return out;
}

export function buildWorkerDebriefPlan(input: WorkerDebriefInput): WorkerDebriefPlan {
  const issues: WorkerDebriefIssue[] = [];
  const suppressionNotes: string[] = [];
  const recoveryActions: WorkerDebriefRecoveryAction[] = [];
  const maxRecoveryActions = Math.max(1, Math.min(12, Number(input.maxRecoveryActions ?? 4)));

  const parsed = input.parsedObject;
  if (parsed) {
    const parsedCandidate = parsed.candidate;
    const parsedDiary = parsed.diary;

    const candidateExpected = isObject(parsedCandidate);
    const diaryExpected = isObject(parsedDiary);
    const candidateWritten = input.sideEffects.candidateIds.length > 0 || hasSuccessfulToolCall(input.toolCalls, "core.worker_candidate_write");
    const diaryWritten = input.sideEffects.diaryIds.length > 0 || hasSuccessfulToolCall(input.toolCalls, "core.worker_diary_write");

    if (candidateExpected && !candidateWritten) {
      issues.push({
        code: "missing_candidate_write",
        toolName: "core.worker_candidate_write",
        message: "Structured output contained candidate data, but no candidate write was recorded.",
      });
      const normalized = normalizeCandidateAction(parsedCandidate);
      if (normalized.args) {
        recoveryActions.push({
          toolName: "core.worker_candidate_write",
          args: normalized.args,
          reason: "recover_missing_candidate_write",
        });
      } else if (normalized.suppression) {
        suppressionNotes.push(normalized.suppression);
        issues.push({
          code: "suppressed_recovery",
          toolName: "core.worker_candidate_write",
          message: normalized.suppression,
        });
      }
    }

    if (diaryExpected && !diaryWritten) {
      issues.push({
        code: "missing_diary_write",
        toolName: "core.worker_diary_write",
        message: "Structured output contained diary data, but no diary write was recorded.",
      });
      const normalized = normalizeDiaryAction(parsedDiary);
      if (normalized.args) {
        recoveryActions.push({
          toolName: "core.worker_diary_write",
          args: normalized.args,
          reason: "recover_missing_diary_write",
        });
      } else if (normalized.suppression) {
        suppressionNotes.push(normalized.suppression);
        issues.push({
          code: "suppressed_recovery",
          toolName: "core.worker_diary_write",
          message: normalized.suppression,
        });
      }
    }
  }

  for (const call of input.toolCalls) {
    if (!toolCallFailed(call)) continue;
    issues.push({
      code: "failed_tool_call",
      toolName: call.toolName,
      message: `Tool call failed and is eligible for recovery: ${call.toolName}`,
    });
    if (!isObject(call.args)) {
      const message = `suppressed retry for ${call.toolName}: args were not an object`;
      suppressionNotes.push(message);
      issues.push({ code: "suppressed_recovery", toolName: call.toolName, message });
      continue;
    }
    recoveryActions.push({
      toolName: call.toolName,
      args: call.args,
      reason: "retry_failed_tool_call",
    });
  }

  const deduped = dedupeRecoveryActions(recoveryActions);
  const capped = deduped.slice(0, maxRecoveryActions);
  if (deduped.length > capped.length) {
    suppressionNotes.push(
      `suppressed ${deduped.length - capped.length} recovery actions due to maxRecoveryActions=${maxRecoveryActions}`,
    );
  }

  return {
    issues,
    recoveryActions: capped,
    suppressedCount: suppressionNotes.length,
    suppressionNotes,
  };
}
