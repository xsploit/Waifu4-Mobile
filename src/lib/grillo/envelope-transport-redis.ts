import type { Envelope, MessageType } from "./envelope";
import type { EnvelopeTransport, RedisTransportConfig, ConsumeResult } from "./envelope-transport";

interface RedisLike {
  xadd(
    key: string,
    id: string,
    field: string,
    value: string,
  ): Promise<string>;
  xread(
    ...args: Array<string | number>
  ): Promise<Array<[string, Array<[string, string[]]>]> | null>;
  ping?(): Promise<unknown>;
  quit?(): Promise<unknown>;
  disconnect?(): void;
}

class RedisEnvelopeTransport implements EnvelopeTransport {
  readonly kind = "redis" as const;
  private readonly streamKey: string;

  constructor(
    private readonly config: RedisTransportConfig,
    private readonly redis: RedisLike,
  ) {
    this.streamKey = config.streamKey || "grillo:envelopes";
  }

  async publish(envelope: Envelope): Promise<void> {
    if (this.config.validator && !this.config.validator(envelope)) return;
    await this.redis.xadd(this.streamKey, "*", "data", JSON.stringify(envelope));
  }

  async consume(fromOffset: string, filter?: MessageType[]): Promise<ConsumeResult> {
    const startId = fromOffset && fromOffset !== "0" ? fromOffset : "0-0";
    const allowed = filter && filter.length ? new Set(filter) : null;
    const streamRows = await this.redis.xread("COUNT", 200, "STREAMS", this.streamKey, startId);
    if (!streamRows || !streamRows.length) {
      return { envelopes: [], nextOffset: fromOffset || "0-0" };
    }

    const rows = streamRows[0]?.[1] ?? [];
    const envelopes: Envelope[] = [];
    let lastId = fromOffset || "0-0";
    for (const [entryId, fields] of rows) {
      lastId = entryId;
      const idx = fields.findIndex((x) => x === "data");
      if (idx < 0 || idx + 1 >= fields.length) continue;
      const raw = fields[idx + 1];
      if (!raw) continue;
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      if (this.config.validator && !this.config.validator(parsed)) continue;
      const envelope = parsed as Envelope;
      if (allowed && !allowed.has(envelope.message_type)) continue;
      envelopes.push(envelope);
    }
    return { envelopes, nextOffset: lastId };
  }

  async close(): Promise<void> {
    if (typeof this.redis.quit === "function") {
      try {
        await this.redis.quit();
      } catch {
        // ignore
      }
      return;
    }
    if (typeof this.redis.disconnect === "function") {
      this.redis.disconnect();
    }
  }
}

export async function createRedisEnvelopeTransport(config: RedisTransportConfig): Promise<EnvelopeTransport> {
  let RedisCtor: new (url: string) => RedisLike;
  try {
    const mod = await import("ioredis");
    RedisCtor = mod.default as unknown as new (url: string) => RedisLike;
  } catch {
    throw new Error("ENVELOPE_TRANSPORT=redis requires ioredis. Run: bun add ioredis");
  }
  const redis = new RedisCtor(config.url);
  if (typeof redis.ping === "function") {
    await redis.ping();
  }
  return new RedisEnvelopeTransport(config, redis);
}
