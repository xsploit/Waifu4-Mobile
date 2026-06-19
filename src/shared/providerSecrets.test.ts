import { describe, expect, it } from 'vitest';
import { mapProviderSecrets } from './providerSecrets';

describe('mapProviderSecrets', () => {
  it('maps keyed browser backup secrets and skips incomplete entries', () => {
    expect(
      mapProviderSecrets([
        { keyName: 'fishSpeech.apiKey', secret: 'fish-key' },
        { keyName: 'inworld.apiKey', secret: 'inworld-key' },
        { keyName: 'missing-secret' },
        { secret: 'missing-name' },
      ]),
    ).toEqual({
      'fishSpeech.apiKey': 'fish-key',
      'inworld.apiKey': 'inworld-key',
    });
  });

  it('returns an empty map when backup secrets are absent', () => {
    expect(mapProviderSecrets(undefined)).toEqual({});
  });
});
