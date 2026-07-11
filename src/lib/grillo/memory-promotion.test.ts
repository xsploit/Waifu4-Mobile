import { describe, expect, it } from 'vitest';
import { evaluatePromotion, type PromotionCandidate } from './memory-promotion';

describe('evaluatePromotion', () => {
  it('does not treat unrelated facts of the same type as corroboration', () => {
    const result = evaluatePromotion([
      candidate('candidate-1', 'likes garlic', ['turn-1']),
      candidate('candidate-2', 'owns a blue car', ['turn-2']),
    ], []);

    expect(result.results).toEqual([]);
    expect(result.consumedCandidateIds).toEqual([]);
  });

  it('promotes equivalent claims only with distinct source evidence', () => {
    const result = evaluatePromotion([
      candidate('candidate-1', 'likes garlic', ['turn-1']),
      candidate('candidate-2', '  LIKES   GARLIC ', ['turn-2']),
    ], []);

    expect(result.results).toEqual([
      expect.objectContaining({
        newItems: ['likes garlic'],
        promotedCandidateIds: ['candidate-1', 'candidate-2'],
        block: expect.objectContaining({
          block_name: 'verified_facts',
          items: ['likes garlic'],
          source_candidate_ids: ['candidate-1', 'candidate-2'],
        }),
      }),
    ]);
    expect(result.consumedCandidateIds).toEqual(['candidate-1', 'candidate-2']);
  });

  it('does not count duplicate candidates from one turn as independent evidence', () => {
    const result = evaluatePromotion([
      candidate('candidate-1', 'likes garlic', ['turn-1']),
      candidate('candidate-2', 'likes garlic', ['turn-1']),
    ], []);

    expect(result.results).toEqual([]);
  });

  it('merges multiple corroborated clusters into one block version', () => {
    const result = evaluatePromotion([
      candidate('candidate-1', 'likes garlic', ['turn-1']),
      candidate('candidate-2', 'likes garlic', ['turn-2']),
      candidate('candidate-3', 'likes synthwave', ['turn-3']),
      candidate('candidate-4', 'likes synthwave', ['turn-4']),
    ], []);

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.block.items).toEqual(['likes garlic', 'likes synthwave']);
    expect(result.results[0]?.block.block_id).toBe('local:local:subsect:verified_facts:v1');
  });
});

function candidate(
  candidate_id: string,
  summary: string,
  source_turn_ids: string[],
): PromotionCandidate {
  return {
    candidate_id,
    confidence: 0.9,
    content: summary,
    source_turn_ids,
    summary,
    type: 'fact',
    user_id: 'local:local:subsect',
  };
}
