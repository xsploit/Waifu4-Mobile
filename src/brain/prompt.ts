import { EMOTIONS, type ReplyFormat } from './BrainTypes';

/**
 * Build the system prompt. Explains the active output lane to the model so the
 * reply parser always has something well-formed to work with (D3).
 */
export function buildSystemPrompt(persona: string, replyFormat: ReplyFormat): string {
  const emotions = EMOTIONS.join(', ');
  const metaInstruction =
    replyFormat === 'structured'
      ? [
          'Respond ONLY with a JSON object matching this shape:',
          `{ "message": string, "emotion": one of [${emotions}], "valence": number -1..1, "arousal": number 0..1, "dominance": number -1..1 }.`,
          'Put the spoken dialogue in "message". Output no text outside the JSON object.',
        ].join(' ')
      : [
          'Write your spoken reply as plain text.',
          'Then append exactly one metadata block on its own final line:',
          `<yw-meta>{"emotion":"<one of ${emotions}>","valence":<-1..1>,"arousal":<0..1>,"dominance":<-1..1>}</yw-meta>`,
          'Put only spoken dialogue before the block. Do not explain the metadata.',
        ].join(' ');

  return [
    persona.trim(),
    '',
    metaInstruction,
    'An emotion is a feeling, never an animation name.',
  ].join('\n');
}
