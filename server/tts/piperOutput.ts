import type { Request, Response } from 'express';
import { z } from 'zod';
import { TtsOutputFanout, type TtsOutputMode } from './outputFanout';

const routingSchema = z.object({
  outputMode: z.enum(['local-only', 'discord-only', 'local+discord', 'external']),
  segmentIndex: z.coerce.number().int().min(0).max(10_000),
  ttsSessionId: z.string().trim().min(1).max(128),
  utteranceId: z.string().trim().min(1).max(128),
});

export type Pcm16Wav = {
  audio: Uint8Array;
  sampleRate: number;
};

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function isDiscordOutputMode(mode: TtsOutputMode): boolean {
  return mode === 'discord-only' || mode === 'local+discord';
}

/** Extracts the only WAV shape accepted by DiscordVoiceOutput: mono little-endian PCM16. */
export function extractMonoPcm16Wav(bytes: Uint8Array): Pcm16Wav {
  if (bytes.byteLength < 12 || readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WAVE') {
    throw new RangeError('Piper output must be a RIFF/WAVE payload.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fmt: { sampleRate: number } | undefined;
  let audio: Uint8Array | undefined;
  let offset = 12;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = readAscii(bytes, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkEnd > bytes.byteLength) {
      throw new RangeError('Piper WAV contains a truncated chunk.');
    }

    if (chunkId === 'fmt ') {
      if (fmt || chunkSize < 16) {
        throw new RangeError('Piper WAV must contain one complete fmt chunk.');
      }
      const format = view.getUint16(chunkStart, true);
      const channels = view.getUint16(chunkStart + 2, true);
      const sampleRate = view.getUint32(chunkStart + 4, true);
      const byteRate = view.getUint32(chunkStart + 8, true);
      const blockAlign = view.getUint16(chunkStart + 12, true);
      const bitDepth = view.getUint16(chunkStart + 14, true);
      if (
        format !== 1 ||
        channels !== 1 ||
        !Number.isInteger(sampleRate) ||
        sampleRate <= 0 ||
        byteRate !== sampleRate * Int16Array.BYTES_PER_ELEMENT ||
        blockAlign !== Int16Array.BYTES_PER_ELEMENT ||
        bitDepth !== 16
      ) {
        throw new RangeError('Piper WAV must be mono PCM16.');
      }
      fmt = { sampleRate };
    } else if (chunkId === 'data') {
      if (audio) {
        throw new RangeError('Piper WAV must contain one data chunk.');
      }
      if (chunkSize % Int16Array.BYTES_PER_ELEMENT !== 0) {
        throw new RangeError('Piper WAV data must contain complete PCM16 samples.');
      }
      audio = bytes.subarray(chunkStart, chunkEnd);
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (!fmt || !audio) {
    throw new RangeError('Piper WAV is missing fmt or data audio.');
  }
  return { audio, sampleRate: fmt.sampleRate };
}

export function handlePiperOutput(req: Request, res: Response, outputFanout: TtsOutputFanout): void {
  const parsed = routingSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.message });
    return;
  }
  const routing = parsed.data;
  if (!isDiscordOutputMode(routing.outputMode)) {
    res.status(204).end();
    return;
  }
  if (!(req.body instanceof Uint8Array)) {
    res.status(400).json({ ok: false, error: 'Piper WAV body is required.' });
    return;
  }

  try {
    const { audio, sampleRate } = extractMonoPcm16Wav(req.body);
    const forwarded = outputFanout.tryEnqueue(routing.outputMode, {
      audio,
      chunkIndex: 0,
      format: 'pcm',
      isFinal: true,
      sampleRate,
      segmentIndex: routing.segmentIndex,
      sessionId: routing.ttsSessionId,
      utteranceId: routing.utteranceId,
    });
    res.status(202).json({ ok: true, forwarded });
  } catch (error) {
    res.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid Piper WAV payload.',
    });
  }
}
