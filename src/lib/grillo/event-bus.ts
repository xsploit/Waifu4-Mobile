import { EventEmitter } from "node:events";
import type { Envelope, MessageType } from "./envelope";

export type EnvelopeHandler<T = Record<string, unknown>> = (
  envelope: Envelope<T>,
) => void;

export type EnvelopeValidator = (envelope: Envelope) => boolean;

export interface EventBus {
  emit(envelope: Envelope): void;
  on<T = Record<string, unknown>>(
    messageType: MessageType,
    handler: EnvelopeHandler<T>,
  ): void;
  off<T = Record<string, unknown>>(
    messageType: MessageType,
    handler: EnvelopeHandler<T>,
  ): void;
}

export interface EventBusOptions {
  validateEnvelope?: EnvelopeValidator;
}

const MAX_EVENT_BUS_LISTENERS = 50;

export function createEventBus(options: EventBusOptions = {}): EventBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(MAX_EVENT_BUS_LISTENERS);

  return {
    emit(envelope: Envelope): void {
      if (options.validateEnvelope && !options.validateEnvelope(envelope)) {
        console.error(
          "[event-bus] envelope validation failed",
          envelope.message_type,
          envelope.trace_id,
        );
        return;
      }
      emitter.emit(envelope.message_type, envelope);
    },

    on<T = Record<string, unknown>>(
      messageType: MessageType,
      handler: EnvelopeHandler<T>,
    ): void {
      const listenerCount = emitter.listenerCount(messageType);
      if (listenerCount >= MAX_EVENT_BUS_LISTENERS) {
        console.warn(
          "[event-bus] listener count is high",
          messageType,
          listenerCount + 1,
        );
      }
      emitter.on(messageType, handler as (...args: unknown[]) => void);
    },

    off<T = Record<string, unknown>>(
      messageType: MessageType,
      handler: EnvelopeHandler<T>,
    ): void {
      emitter.off(messageType, handler as (...args: unknown[]) => void);
    },
  };
}
