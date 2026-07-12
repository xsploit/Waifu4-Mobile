import { describe, expect, it } from "vitest";
import { VoiceActivityDetector, type Pcm16AudioFrame } from "./VoiceActivityDetector";

const sampleRate = 1000;
const config = {
  sampleRate,
  startThreshold: 0.2,
  endThreshold: 0.1,
  endSilenceMs: 20,
  minSpeechMs: 20,
  maxUtteranceMs: 80,
  preRollMs: 10,
};

function frame(speakerId: string, timestampMs: number, value: number, durationMs = 10): Pcm16AudioFrame {
  return { speakerId, timestampMs, samples: new Int16Array(durationMs).fill(value) };
}

describe("VoiceActivityDetector", () => {
  it("tracks speakers independently without mixing their frames", () => {
    const detector = new VoiceActivityDetector(config);

    expect(detector.push(frame("alice", 0, 0))).toEqual([]);
    expect(detector.push(frame("bob", 0, 12000))).toEqual([]);
    expect(detector.push(frame("alice", 10, 12000))).toEqual([]);
    expect(detector.push(frame("bob", 10, 0))).toEqual([]);
    expect(detector.push(frame("bob", 20, 12000))).toEqual([]);
    expect(detector.push(frame("alice", 20, 12000))).toEqual([]);
    expect(detector.push(frame("alice", 30, 0))).toEqual([]);
    const emitted = detector.push(frame("alice", 40, 0));

    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.speakerId).toBe("alice");
    expect(emitted[0]?.frames.map((item) => item.speakerId)).toEqual(["alice", "alice", "alice", "alice", "alice"]);
    expect(detector.disconnect("bob")).toHaveLength(1);
  });

  it("uses pre-roll, RMS/peak thresholding, minimum speech, and silence termination", () => {
    const detector = new VoiceActivityDetector(config);

    detector.push(frame("speaker", 0, 0));
    detector.push(frame("speaker", 10, 0));
    detector.push(frame("speaker", 20, 10000));
    detector.push(frame("speaker", 30, 10000));
    detector.push(frame("speaker", 40, 0));
    const emitted = detector.push(frame("speaker", 50, 0));

    expect(emitted[0]).toMatchObject({
      startTimestampMs: 10,
      endTimestampMs: 60,
      speechDurationMs: 20,
    });
    expect(emitted[0]?.frames.map((item) => item.timestampMs)).toEqual([10, 20, 30, 40, 50]);
  });

  it("forces a bounded maximum-duration boundary and flushes remaining state", () => {
    const detector = new VoiceActivityDetector({ ...config, minSpeechMs: 10, maxUtteranceMs: 30, maxTrackedSpeakers: 2 });

    expect(detector.push(frame("a", 0, 12000))).toEqual([]);
    expect(detector.push(frame("a", 10, 12000))).toEqual([]);
    const first = detector.push(frame("a", 20, 12000));
    expect(first[0]?.endTimestampMs).toBe(30);
    expect(detector.push(frame("a", 30, 12000))).toEqual([]);
    expect(detector.flush("a")[0]?.startTimestampMs).toBe(30);
    expect(detector.trackedSpeakerCount).toBe(0);

    detector.push(frame("x", 0, 12000));
    detector.push(frame("y", 0, 12000));
    const evicted = detector.push(frame("z", 0, 12000));
    expect(evicted[0]?.speakerId).toBe("x");
    expect(detector.trackedSpeakerCount).toBe(2);
  });

  it("caps total buffered duration across short silence gaps, not just voiced duration", () => {
    const detector = new VoiceActivityDetector({
      ...config,
      endSilenceMs: 20,
      minSpeechMs: 20,
      maxUtteranceMs: 50,
      preRollMs: 0,
    });

    detector.push(frame("speaker", 0, 12000));
    detector.push(frame("speaker", 10, 0));
    detector.push(frame("speaker", 20, 12000));
    detector.push(frame("speaker", 30, 0));
    const emitted = detector.push(frame("speaker", 40, 12000));

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      startTimestampMs: 0,
      endTimestampMs: 50,
      speechDurationMs: 30,
    });
    expect(emitted[0]?.frames).toHaveLength(5);
  });

  it("disconnects one speaker while preserving other speakers", () => {
    const detector = new VoiceActivityDetector({ ...config, minSpeechMs: 10 });
    detector.push(frame("left", 0, 12000));
    detector.push(frame("right", 0, 12000));

    expect(detector.disconnect("left")[0]?.speakerId).toBe("left");
    expect(detector.trackedSpeakerCount).toBe(1);
    expect(detector.flush()[0]?.speakerId).toBe("right");
    expect(detector.trackedSpeakerCount).toBe(0);
  });
});
