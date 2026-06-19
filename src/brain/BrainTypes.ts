import { z } from 'zod';

/**
 * Canonical assistant emotion enum (Resolved Decision D3 follow-up).
 * An emotion is NEVER an animation name. Low-stakes / reversible.
 */
const EMOTIONS = [
  'neutral',
  'amused',
  'happy',
  'sad',
  'angry',
  'surprised',
  'affectionate',
  'annoyed',
  'curious',
] as const;

export type Emotion = (typeof EMOTIONS)[number];

/**
 * The one canonical reply contract (D3). Never changes across phases.
 * `message` is the only field ever sent to TTS; the rest is metadata that is
 * parsed + logged from Phase 3, and consumed by the avatar only from Phase 9.
 */
export const assistantReplySchema = z.object({
  message: z.string().describe('The spoken dialogue to say out loud. No stage directions, no JSON, no metadata.'),
  emotion: z.enum(EMOTIONS).describe('The single feeling that best fits this message. A feeling, never an animation name.'),
  valence: z.number().min(-1).max(1).describe('Pleasantness of the mood, -1 (very negative) to 1 (very positive).'),
  arousal: z.number().min(0).max(1).describe('Energy/intensity of the mood, 0 (calm) to 1 (highly energized).'),
  dominance: z.number().min(-1).max(1).describe('Sense of control, -1 (submissive) to 1 (dominant).'),
});

export type AssistantReply = z.infer<typeof assistantReplySchema>;

/** The non-spoken part of a reply. */
const replyMetadataSchema = assistantReplySchema.omit({ message: true });
export type ReplyMetadata = z.infer<typeof replyMetadataSchema>;

/** Lenient parse for metadata coming off the wire (Lane A object / Lane B JSON). */
export function coerceMetadata(value: unknown): ReplyMetadata | null {
  const result = replyMetadataSchema.safeParse(value);
  return result.success ? result.data : null;
}

export type LlmMessageRole = 'system' | 'user' | 'assistant';

export type LlmImageInput = {
  imageUrl: string;
  mediaType?: string;
  detail?: 'auto' | 'high' | 'low';
};

export type LlmMessage = {
  role: LlmMessageRole;
  content: string;
  images?: LlmImageInput[];
};

export type GatewayId = 'vercel-gateway' | 'openrouter-responses';

/** 'structured' => Lane A (strict JSON). 'text' => Lane B (text + <yw-meta>). */
export type ReplyFormat = 'structured' | 'text';

/** OpenAI reasoning effort. Default 'minimal' — a chatty companion, not a solver. */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';
