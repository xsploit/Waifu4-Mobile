import { useEffect, useMemo, useRef, useState } from 'react';
import {
  capturePersonaVoiceTuning,
  createPersonaVoiceBindingFromSettings,
} from '../../../lib/chat/persona-voice';
import type {
  AiSettings,
  PersonaDraft,
  PersonaProfile,
  PersonaVoiceBinding,
  PersonaVoiceProvider,
} from '../../../lib/chat/types';
import type { PiperVoiceProfile } from '../../../lib/tts/piper';
import type { RemoteTtsVoice } from '../../../lib/tts/remote';

type CharacterTabProps = {
  activePersona: PersonaProfile | null;
  aiSettings: AiSettings;
  personaVoiceBinding?: PersonaVoiceBinding;
  personas: PersonaProfile[];
  remoteTtsVoices: RemoteTtsVoice[];
  ttsVoices: PiperVoiceProfile[];
  onActivatePersona: (id: string) => void;
  onDeletePersona: (id: string) => void;
  onSavePersona: (
    draft: PersonaDraft,
    personaId?: string,
    voicePreset?: PersonaVoiceBinding,
  ) => void;
};

type CharacterExport = {
  persona: PersonaDraft;
  version: 1;
  voicePreset?: PersonaVoiceBinding;
};

const EMPTY_DRAFT: PersonaDraft = {
  name: '',
  systemPrompt: '',
  description: '',
  userNickname: '',
};

function getRuntimeVoiceLabel(
  provider: PersonaVoiceProvider,
  voiceId: string,
  piperVoices: PiperVoiceProfile[],
  remoteVoices: RemoteTtsVoice[],
) {
  if (provider === 'piper') {
    return piperVoices.find((voice) => voice.key === voiceId)?.name ?? voiceId;
  }
  return remoteVoices.find((voice) => voice.provider === provider && voice.id === voiceId)?.name ?? voiceId;
}

function createVoiceDraft(
  aiSettings: AiSettings,
  piperVoices: PiperVoiceProfile[],
  remoteVoices: RemoteTtsVoice[],
  provider: PersonaVoiceProvider = aiSettings.ttsProvider,
): PersonaVoiceBinding {
  const runtimeBinding = createPersonaVoiceBindingFromSettings(aiSettings, {
    provider,
    updatedAt: Date.now(),
  });
  if (runtimeBinding) {
    return {
      ...runtimeBinding,
      label: getRuntimeVoiceLabel(provider, runtimeBinding.voiceId, piperVoices, remoteVoices),
    };
  }

  const voiceId = provider === 'piper' ? (piperVoices[0]?.key ?? '') : '';
  return {
    label: getRuntimeVoiceLabel(provider, voiceId, piperVoices, remoteVoices),
    modelId:
      provider === 'fish-speech'
        ? aiSettings.fishSpeechModel
        : provider === 'inworld'
          ? aiSettings.inworldModelId
          : undefined,
    provider,
    tuning: capturePersonaVoiceTuning(provider, aiSettings),
    updatedAt: Date.now(),
    voiceId,
  };
}

function parseImportedVoicePreset(value: unknown): PersonaVoiceBinding | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const source = value as Partial<PersonaVoiceBinding>;
  if (
    source.provider !== 'piper' &&
    source.provider !== 'fish-speech' &&
    source.provider !== 'inworld'
  ) {
    return undefined;
  }
  const voiceId = String(source.voiceId ?? '').trim();
  if (!voiceId) {
    return undefined;
  }
  return {
    customVoiceId: typeof source.customVoiceId === 'string' ? source.customVoiceId : undefined,
    label: String(source.label ?? voiceId),
    modelId: typeof source.modelId === 'string' ? source.modelId : undefined,
    provider: source.provider,
    tuning:
      source.tuning && typeof source.tuning === 'object' && !Array.isArray(source.tuning)
        ? source.tuning
        : undefined,
    updatedAt: Date.now(),
    voiceId,
  };
}

export function CharacterTab({
  activePersona,
  aiSettings,
  personaVoiceBinding,
  personas,
  remoteTtsVoices,
  ttsVoices,
  onActivatePersona,
  onDeletePersona,
  onSavePersona,
}: CharacterTabProps) {
  const [draftId, setDraftId] = useState<string | undefined>(activePersona?.id);
  const [draft, setDraft] = useState<PersonaDraft>(activePersona ?? EMPTY_DRAFT);
  const [voicePreset, setVoicePreset] = useState<PersonaVoiceBinding>(() =>
    personaVoiceBinding ?? createVoiceDraft(aiSettings, ttsVoices, remoteTtsVoices),
  );
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!activePersona) {
      return;
    }

    setDraftId(activePersona.id);
    setDraft({
      name: activePersona.name,
      systemPrompt: activePersona.systemPrompt,
      description: activePersona.description,
      userNickname: activePersona.userNickname,
    });
    setVoicePreset(
      personaVoiceBinding ?? createVoiceDraft(aiSettings, ttsVoices, remoteTtsVoices),
    );
  }, [activePersona, personaVoiceBinding]);

  const providerRemoteVoices = useMemo(
    () => remoteTtsVoices.filter((voice) => voice.provider === voicePreset.provider),
    [remoteTtsVoices, voicePreset.provider],
  );

  const updateDraft = (patch: Partial<PersonaDraft>) => {
    setDraft((current) => ({
      ...current,
      ...patch,
    }));
  };

  const updateVoicePreset = (patch: Partial<PersonaVoiceBinding>) => {
    setVoicePreset((current) => ({
      ...current,
      ...patch,
      updatedAt: Date.now(),
    }));
  };

  const selectVoice = (voiceId: string) => {
    updateVoicePreset({
      label: getRuntimeVoiceLabel(
        voicePreset.provider,
        voiceId,
        ttsVoices,
        remoteTtsVoices,
      ),
      voiceId,
    });
  };

  const handleSave = () => {
    if (!draft.name.trim()) {
      return;
    }

    const savedVoicePreset = voicePreset.voiceId.trim()
      ? {
          ...voicePreset,
          label: voicePreset.label.trim() || voicePreset.voiceId.trim(),
          modelId: voicePreset.modelId?.trim() || undefined,
          updatedAt: Date.now(),
          voiceId: voicePreset.voiceId.trim(),
        }
      : undefined;
    onSavePersona(
      {
        name: draft.name.trim(),
        systemPrompt: draft.systemPrompt.trim(),
        description: draft.description.trim(),
        userNickname: draft.userNickname.trim(),
      },
      draftId,
      savedVoicePreset,
    );
  };

  const resetForNewPersona = () => {
    setDraftId(undefined);
    setDraft(EMPTY_DRAFT);
    setVoicePreset(createVoiceDraft(aiSettings, ttsVoices, remoteTtsVoices));
  };

  return (
    <>
      <div className="control-group">
        <div className="control-label">Default Character</div>
        <select
          className="select-tech"
          onChange={(event) => onActivatePersona(event.target.value)}
          value={activePersona?.id ?? personas[0]?.id ?? ''}
        >
          {personas.map((persona) => (
            <option key={persona.id} value={persona.id}>
              {persona.name}
            </option>
          ))}
        </select>
      </div>

      <div className="control-group">
        <div className="control-label">Character Name</div>
        <input
          className="input-tech"
          onChange={(event) => updateDraft({ name: event.target.value })}
          placeholder="Character name..."
          type="text"
          value={draft.name}
        />
      </div>

      <div className="control-group">
        <div className="control-label">System Prompt</div>
        <textarea
          className="textarea-tech"
          onChange={(event) => updateDraft({ systemPrompt: event.target.value })}
          placeholder="Define her voice, boundaries, and behavior..."
          rows={7}
          value={draft.systemPrompt}
        />
      </div>

      <div className="control-group">
        <div className="control-label">Description</div>
        <input
          className="input-tech"
          onChange={(event) => updateDraft({ description: event.target.value })}
          placeholder="Short internal description..."
          type="text"
          value={draft.description}
        />
      </div>

      <div className="control-group">
        <div className="control-label">User Nickname</div>
        <input
          className="input-tech"
          onChange={(event) => updateDraft({ userNickname: event.target.value })}
          placeholder="How she should address you..."
          type="text"
          value={draft.userNickname}
        />
      </div>

      <div className="control-group">
        <div className="control-label">Character Voice</div>
        <select
          className="select-tech"
          onChange={(event) =>
            setVoicePreset(
              createVoiceDraft(
                aiSettings,
                ttsVoices,
                remoteTtsVoices,
                event.target.value as PersonaVoiceProvider,
              ),
            )
          }
          value={voicePreset.provider}
        >
          <option value="piper">Piper Local</option>
          <option value="fish-speech">Fish Speech</option>
          <option value="inworld">Inworld</option>
        </select>

        {voicePreset.provider === 'piper' ? (
          <select
            className="select-tech"
            onChange={(event) => selectVoice(event.target.value)}
            value={voicePreset.voiceId}
          >
            {!ttsVoices.some((voice) => voice.key === voicePreset.voiceId) && voicePreset.voiceId ? (
              <option value={voicePreset.voiceId}>{voicePreset.label || voicePreset.voiceId}</option>
            ) : null}
            {ttsVoices.map((voice) => (
              <option key={voice.key} value={voice.key}>
                {voice.name} | {voice.key}
              </option>
            ))}
          </select>
        ) : (
          <>
            {voicePreset.provider === 'fish-speech' ? (
              <select
                className="select-tech"
                onChange={(event) => updateVoicePreset({ modelId: event.target.value })}
                value={voicePreset.modelId ?? aiSettings.fishSpeechModel}
              >
                <option value="s2.1-pro-free">s2.1-pro-free</option>
                <option value="s2">s2-pro</option>
                <option value="s1">s1</option>
              </select>
            ) : (
              <input
                className="input-tech"
                onChange={(event) => updateVoicePreset({ modelId: event.target.value })}
                placeholder="Inworld model id"
                type="text"
                value={voicePreset.modelId ?? ''}
              />
            )}
            <select
              className="select-tech"
              onChange={(event) => selectVoice(event.target.value)}
              value={providerRemoteVoices.some((voice) => voice.id === voicePreset.voiceId) ? voicePreset.voiceId : ''}
            >
              <option value="">Manual voice ID</option>
              {providerRemoteVoices.map((voice) => (
                <option key={`${voice.provider}:${voice.id}`} value={voice.id}>
                  {voice.name} | {voice.id}
                </option>
              ))}
            </select>
            <input
              className="input-tech"
              onChange={(event) => selectVoice(event.target.value)}
              placeholder={`${voicePreset.provider === 'fish-speech' ? 'Fish reference' : 'Inworld voice'} id`}
              type="text"
              value={voicePreset.voiceId}
            />
          </>
        )}

        <div className="btn-row">
          <button
            className="btn-tech secondary"
            onClick={() =>
              setVoicePreset(createVoiceDraft(aiSettings, ttsVoices, remoteTtsVoices))
            }
            type="button"
          >
            Use Current TTS Setup
          </button>
        </div>
        <div className="status-copy">
          {voicePreset.voiceId
            ? `${voicePreset.label || voicePreset.voiceId} / ${voicePreset.modelId || 'default model'}`
            : 'No character voice assigned.'}
        </div>
      </div>

      <div className="btn-row">
        <button
          className="btn-tech"
          disabled={!draft.name.trim()}
          onClick={handleSave}
          type="button"
        >
          {draftId ? 'Save Persona' : 'Create Persona'}
        </button>
        <button className="btn-tech secondary" onClick={resetForNewPersona} type="button">
          New
        </button>
      </div>

      <div className="btn-row">
        <button
          className="btn-tech danger"
          disabled={!draftId}
          onClick={() => {
            if (draftId) {
              onDeletePersona(draftId);
            }
          }}
          type="button"
        >
          Delete
        </button>
        <button
          className="btn-tech secondary"
          onClick={() => {
            const payload: CharacterExport = {
              persona: draft,
              version: 1,
              voicePreset: voicePreset.voiceId.trim() ? voicePreset : undefined,
            };
            const blob = new Blob([JSON.stringify(payload, null, 2)], {
              type: 'application/json',
            });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${draft.name || 'persona'}.json`;
            anchor.click();
            URL.revokeObjectURL(url);
          }}
          type="button"
        >
          Export
        </button>
        <button
          className="btn-tech secondary"
          onClick={() => importInputRef.current?.click()}
          type="button"
        >
          Import
        </button>
        <input
          accept=".json"
          className="hidden-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }

            const reader = new FileReader();
            reader.onload = () => {
              try {
                const parsed = JSON.parse(String(reader.result ?? '{}')) as Record<string, unknown>;
                const personaSource =
                  parsed.persona && typeof parsed.persona === 'object'
                    ? (parsed.persona as Partial<PersonaDraft>)
                    : (parsed as Partial<PersonaDraft>);
                setDraftId(undefined);
                setDraft({
                  name: String(personaSource.name ?? ''),
                  systemPrompt: String(personaSource.systemPrompt ?? ''),
                  description: String(personaSource.description ?? ''),
                  userNickname: String(personaSource.userNickname ?? ''),
                });
                setVoicePreset(
                  parseImportedVoicePreset(parsed.voicePreset) ??
                    createVoiceDraft(aiSettings, ttsVoices, remoteTtsVoices),
                );
              } catch {
                // Ignore malformed imports.
              }
            };
            reader.readAsText(file);
            event.target.value = '';
          }}
          ref={importInputRef}
          type="file"
        />
      </div>
    </>
  );
}
