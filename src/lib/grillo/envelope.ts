import { randomUUID } from "node:crypto";

export type MessageType =
  | "turn.ingest.request"
  | "chat.generate.request"
  | "chat.generate.result"
  | "memory.extract.request"
  | "memory.extract.result"
  | "memory.promote.request"
  | "memory.promote.result"
  | "profile.snapshot.updated";

export interface Envelope<T = Record<string, unknown>> {
  message_type: MessageType;
  schema_version: "1.0.0";
  trace_id: string;
  turn_id: string;
  user_id: string;
  channel_id: string;
  interface_path?: string;
  created_at: string;
  idempotency_key?: string;
  payload: T;
}

export interface CreateEnvelopeOptions<T = Record<string, unknown>> {
  message_type: MessageType;
  turn_id: string;
  user_id: string;
  channel_id: string;
  payload: T;
  trace_id?: string;
  interface_path?: string;
  idempotency_key?: string;
}

export function createEnvelope<T = Record<string, unknown>>(
  options: CreateEnvelopeOptions<T>,
): Envelope<T> {
  return {
    message_type: options.message_type,
    schema_version: "1.0.0",
    trace_id: options.trace_id ?? randomUUID(),
    turn_id: options.turn_id,
    user_id: options.user_id,
    channel_id: options.channel_id,
    interface_path: options.interface_path,
    created_at: new Date().toISOString(),
    idempotency_key: options.idempotency_key,
    payload: options.payload,
  };
}
