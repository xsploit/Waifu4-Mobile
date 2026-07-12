export type TtsOutputMode = 'local-only' | 'discord-only' | 'local+discord' | 'external';

export type TtsOutputChunk = {
  audio: Uint8Array;
  cancel?: boolean;
  chunkIndex: number;
  format: string;
  isFinal?: boolean;
  sampleRate?: number;
  segmentIndex: number;
  sessionId: string;
  utteranceId: string;
};

export type TtsOutputSink = {
  tryEnqueue: (chunk: TtsOutputChunk) => boolean;
};

/**
 * Best-effort sidecar routing. The latency-critical caller never receives a
 * promise and never waits for Discord connection, encoding, or playback.
 */
export class TtsOutputFanout {
  private discordSink: TtsOutputSink | null = null;

  public setDiscordSink(sink: TtsOutputSink | null): void {
    this.discordSink = sink;
  }

  public tryEnqueue(mode: TtsOutputMode, chunk: TtsOutputChunk): boolean {
    if (mode !== 'discord-only' && mode !== 'local+discord') {
      return true;
    }
    const sink = this.discordSink;
    if (!sink) {
      return false;
    }
    try {
      return sink.tryEnqueue(chunk);
    } catch {
      return false;
    }
  }
}
