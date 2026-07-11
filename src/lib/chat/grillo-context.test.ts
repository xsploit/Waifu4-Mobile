import { describe, expect, it } from 'vitest';
import type { ChatTurn } from './chat-turn';
import { createDefaultRelationshipMemory } from './defaults';
import {
  buildGrilloContextPromptBlock,
  buildGrilloContextPromptMaterial,
} from './grillo-context';
import type {
  GrilloContextPacket,
  GrilloProvenanceLaneReceipt,
} from '../../shared/grilloContext';

describe('GRILLO client context provenance', () => {
  it('keeps the compatibility wrapper byte-identical to the material text', () => {
    const options = {
      persona: null,
      relationshipMemory: createDefaultRelationshipMemory(),
    };
    const material = buildGrilloContextPromptMaterial(options);

    expect(buildGrilloContextPromptBlock(options)).toBe(material.text);
    expect(material.text).toBe(BASELINE_BLOCK);
    expect(material.receipt).toMatchObject({
      stage: 'client_context_reducer',
      totalTokens: 289,
      usedFallback: false,
      version: '1.0.0',
    });
  });

  it('drops oldest channel IDs first under the section budget', () => {
    const turns = [turn('turn-a', 'a'.repeat(160)), turn('turn-b', 'b'.repeat(160)), turn('turn-c', 'c')];
    const material = buildGrilloContextPromptMaterial(
      {
        channelHistory: turns,
        persona: null,
        relationshipMemory: createDefaultRelationshipMemory(),
      },
      { sectionBudgets: { channel_history: 50 } },
    );

    expect(material.receipt.lanes.channel_history.dropped.map((item) => item.id)).toEqual([
      'turn:turn-a',
      'turn:turn-b',
    ]);
    expect(material.receipt.lanes.channel_history.includedOccurrences).toEqual(['turn:turn-c']);
  });

  it('removes the earliest lowest-score occurrence first', () => {
    const material = buildGrilloContextPromptMaterial(
      {
        memoryAdditions: {
          diaryThoughts: [],
          recalledMemories: [
            { id: 'low-a', score: 0.1, text: 'a'.repeat(400) },
            { id: 'low-b', score: 0.1, text: 'b'.repeat(400) },
            { id: 'high', score: 0.9, text: 'h'.repeat(400) },
          ],
          relationshipMemory: [],
        },
        persona: null,
        relationshipMemory: createDefaultRelationshipMemory(),
      },
      {
        globalBudget: 390,
        sectionBudgets: { recalled_memories: 1000 },
      },
    );

    expect(
      material.receipt.lanes.recalled_memories.dropped
        .filter((item) => item.step === 'drop_low_score_memories')
        .map((item) => item.id),
    ).toEqual(['low-a', 'low-b']);
    expect(material.receipt.lanes.recalled_memories.includedOccurrences).toEqual(['high']);
  });

  it('records the minimal global fallback without placing receipt data in the prompt', () => {
    const material = buildGrilloContextPromptMaterial(
      {
        channelHistory: [turn('one', 'one'), turn('two', 'two'), turn('three', 'three')],
        diaryContext: 'thought one\nthought two',
        memoryAdditions: {
          diaryThoughts: ['thought three'],
          recalledMemories: [
            { id: 'memory-a', score: 0.5, text: 'memory a' },
            { id: 'memory-b', score: 0.6, text: 'memory b' },
          ],
          relationshipMemory: ['relationship extra'],
        },
        persona: null,
        relationshipMemory: createDefaultRelationshipMemory(),
      },
      {
        globalBudget: 10,
        sectionBudgets: {
          background_information: 10000,
          channel_history: 10000,
          instructions: 10000,
          output_description: 10000,
          recalled_memories: 10000,
          relationship_memory: 10000,
          thoughts: 10000,
        },
      },
    );

    expect(material.receipt.usedFallback).toBe(true);
    expect(material.receipt.reductions.at(-1)?.step).toBe('fallback_minimal');
    expect(material.receipt.lanes.recalled_memories.includedOccurrences).toEqual([]);
    expect(material.receipt.lanes.thoughts.includedOccurrences).toEqual([]);
    expect(material.text).not.toContain('client_context_reducer');
  });

  it('propagates native server occurrences and keeps fallback IDs deterministic', () => {
    const packet = nativePacket();
    const native = buildGrilloContextPromptMaterial({
      memoryAdditions: {
        contextPacket: packet,
        diaryThoughts: [],
        recalledMemories: [],
        relationshipMemory: [],
      },
      persona: null,
      relationshipMemory: createDefaultRelationshipMemory(),
    });
    expect(native.receipt.lanes.channel_history.includedOccurrences).toEqual(['turn:native-1']);
    expect(native.receipt.lanes.relationship_memory.includedOccurrences).toEqual(['block:native:item:0']);
    expect(native.receipt.lanes.thoughts.includedOccurrences).toEqual(['diary:native']);

    const fallbackOptions = {
      diaryContext: 'same diary line',
      persona: null,
      relationshipMemory: createDefaultRelationshipMemory(),
      semanticMemoryContext: 'same semantic line',
    };
    const first = buildGrilloContextPromptMaterial(fallbackOptions).receipt;
    const second = buildGrilloContextPromptMaterial(fallbackOptions).receipt;
    expect(second.lanes.relationship_memory.requestedOccurrences).toEqual(
      first.lanes.relationship_memory.requestedOccurrences,
    );
    expect(second.lanes.recalled_memories.requestedOccurrences).toEqual(
      first.lanes.recalled_memories.requestedOccurrences,
    );
    expect(second.lanes.thoughts.requestedOccurrences).toEqual(
      first.lanes.thoughts.requestedOccurrences,
    );
  });
});

function turn(id: string, text: string): ChatTurn {
  return {
    badges: [],
    channel: 'local',
    displayName: 'Subsect',
    id,
    isBroadcaster: true,
    isLocal: true,
    isMod: true,
    isTrustedController: true,
    login: 'subsect',
    source: 'local',
    text,
    timestamp: 1,
  };
}

function nativePacket(): GrilloContextPacket {
  const lane = (id: string): GrilloProvenanceLaneReceipt => ({
    dropped: [],
    droppedIds: [],
    duplicateIds: [],
    includedIds: [id],
    includedOccurrences: [id],
    requestedIds: [id],
    requestedOccurrences: [id],
  });
  return {
    background_information: [],
    channel_history: ['Subsect: native history'],
    generatedAt: 1,
    output_description: [],
    provenance_receipt: {
      lanes: {
        channel_history: lane('turn:native-1'),
        recalled_memories: lane('semantic:native'),
        relationship_memory: lane('block:native:item:0'),
        thoughts: lane('diary:native'),
      },
      stage: 'server_context_packet',
      version: '1.0.0',
    },
    recalled_memories: [
      {
        createdAt: 1,
        evidenceIds: [],
        id: 'semantic:native',
        scopeKey: 'local:persona:test',
        source: 'semantic',
        text: 'native recall',
      },
    ],
    relationship_memory: ['native relationship'],
    retrieval_receipt: {
      embedding: null,
      lanes: {
        recalled_memories: {
          droppedIds: [],
          duplicateIds: [],
          includedIds: ['semantic:native'],
          requestedIds: ['semantic:native'],
        },
      },
      query: '',
      strategy: 'none',
    },
    scopeKey: 'local:persona:test',
    thoughts: ['native thought'],
  };
}

const BASELINE_BLOCK = `estimated_tokens: 289
used_fallback: false
reductions: none
## background_information
- active_persona: Web Waifu 4
- local_controller: not configured
- interface_path: local/current-speaker
- conversation_scope: twitch-chat
- turn_source: unknown
- current_speaker: current speaker
## instructions
- Use channel_history as transcript, relationship_memory as stable participant context, recalled_memories as semantic matches, and thoughts as private diary/reflection.
- Do not replay global cross-channel transcript. Use only the current channel/source/persona scope supplied in this packet.
- If memory conflicts with the current turn or speaker metadata, trust the current turn first.
- Local chat is a participant transcript turn, but trusted/controller metadata may permit commands or stronger operator intent.
- Do not rewrite the persona from memory; use memory only as context for this reply.
## channel_history
(empty)
## relationship_memory
- stage=new mood=guarded last_seen=never
- scores={"trust":4,"attraction":1,"respect":4,"irritation":1,"jealousy":0,"guard":16}
- last_action_tag=none
## recalled_memories
(empty)
## thoughts
(empty)
## output_description
- Return spoken dialogue for the live stream using the active reply length rules, then append the required hidden reply metadata block.
- Select emotion/animation metadata that matches the visible reply; avoid conflicting motion cues.`;
