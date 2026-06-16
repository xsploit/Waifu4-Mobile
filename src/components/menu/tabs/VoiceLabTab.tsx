import { useEffect, useMemo, useState } from 'react';
import type {
  AiSettings,
  PersonaProfile,
  PersonaVoiceBinding,
  VoiceCreationProvider,
  VoiceLabSample,
  VoiceLabVoice,
} from '../../../lib/chat/types';
import type { PiperVoiceProfile } from '../../../lib/tts/piper';
import type {
  CreatedRemoteTtsVoice,
  CreateRemoteTtsVoiceRequest,
  DesignedRemoteTtsVoiceCandidate,
  DesignRemoteTtsVoiceRequest,
  DesignRemoteTtsVoiceResult,
  PublishDesignedRemoteTtsVoiceRequest,
  RemoteTtsProvider,
  RemoteTtsVoice,
} from '../../../lib/tts/remote';

type VoiceLabTabProps = {
  activePersona: PersonaProfile | null;
  aiSettings: AiSettings;
  onApplyPersonaVoice: (personaId: string) => void;
  onDeleteVoice: (voiceId: string) => void;
  onCreateProviderVoice: (request: CreateRemoteTtsVoiceRequest) => Promise<CreatedRemoteTtsVoice>;
  onDesignProviderVoice: (request: DesignRemoteTtsVoiceRequest) => Promise<DesignRemoteTtsVoiceResult>;
  onPublishDesignedVoice: (
    request: PublishDesignedRemoteTtsVoiceRequest,
  ) => Promise<CreatedRemoteTtsVoice>;
  onRefreshRemoteVoices: (provider: RemoteTtsProvider) => void;
  onSaveVoice: (voice: VoiceLabVoice) => void;
  onUseCurrentVoiceAsPersonaDefault: (personaId: string) => void;
  personaVoiceBindings: Record<string, PersonaVoiceBinding>;
  personas: PersonaProfile[];
  remoteTtsVoices: RemoteTtsVoice[];
  remoteVoicesError: string | null;
  remoteVoicesLoading: boolean;
  ttsVoices: PiperVoiceProfile[];
  voiceLabVoices: VoiceLabVoice[];
};

type VoiceDraft = Omit<VoiceLabVoice, 'createdAt' | 'id' | 'status' | 'updatedAt'> & {
  id?: string;
  createdAt?: number;
};

const DEFAULT_LANGUAGE = 'EN_US';
const DEFAULT_REMOVE_BACKGROUND_NOISE = true;
const DEFAULT_ENHANCE_AUDIO_QUALITY = true;
const DEFAULT_DESIGN_INSTRUCTION =
  'Warm expressive streamer voice with clear diction, natural pacing, and playful emotional range.';
const DEFAULT_DESIGN_PREVIEW_TEXT =
  'Hey there, I am testing a new voice for WebWaifu.';

const EMPTY_DRAFT: VoiceDraft = {
  accent: '',
  ageVibe: '',
  assignedPersonaIds: [],
  description: '',
  emotionalTone: '',
  expressiveness: 0.65,
  modelId: '',
  name: '',
  provider: 'fish-speech',
  providerVoiceId: '',
  sample: null,
  speakingStyle: '',
  stability: 0.55,
};

function providerLabel(provider: VoiceCreationProvider | PersonaVoiceBinding['provider']) {
  switch (provider) {
    case 'fish-speech':
      return 'Fish Speech';
    case 'inworld':
      return 'Inworld';
    case 'piper':
      return 'Piper';
    default:
      return provider;
  }
}

function describeBinding(
  binding: PersonaVoiceBinding | undefined,
  voices: VoiceLabVoice[],
  piperVoices: PiperVoiceProfile[],
) {
  if (!binding) {
    return 'No voice assigned.';
  }

  const customVoice = binding.customVoiceId
    ? voices.find((voice) => voice.id === binding.customVoiceId)
    : null;
  const piperVoice =
    binding.provider === 'piper'
      ? piperVoices.find((voice) => voice.key === binding.voiceId)
      : null;
  const label = customVoice?.name ?? piperVoice?.name ?? binding.label ?? binding.voiceId;
  return `${providerLabel(binding.provider)} / ${label}`;
}

function sampleLabel(sample: VoiceLabSample | null) {
  if (!sample) {
    return 'No sample selected';
  }
  const sizeKb = Math.max(1, Math.round(sample.size / 1024));
  return `${sample.fileName} (${sizeKb} KB)`;
}

function base64ToFile(base64: string, fileName: string, mimeType = 'audio/wav') {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], fileName, { type: mimeType, lastModified: Date.now() });
}

function candidateAudioSrc(candidate: DesignedRemoteTtsVoiceCandidate) {
  return candidate.audioBase64 ? `data:audio/wav;base64,${candidate.audioBase64}` : '';
}

export function VoiceLabTab({
  activePersona,
  aiSettings,
  onApplyPersonaVoice,
  onCreateProviderVoice,
  onDeleteVoice,
  onDesignProviderVoice,
  onPublishDesignedVoice,
  onRefreshRemoteVoices,
  onSaveVoice,
  onUseCurrentVoiceAsPersonaDefault,
  personaVoiceBindings,
  personas,
  remoteTtsVoices,
  remoteVoicesError,
  remoteVoicesLoading,
  ttsVoices,
  voiceLabVoices,
}: VoiceLabTabProps) {
  const [draft, setDraft] = useState<VoiceDraft>(EMPTY_DRAFT);
  const [selectedPersonaId, setSelectedPersonaId] = useState(
    activePersona?.id ?? personas[0]?.id ?? '',
  );
  const [sampleFile, setSampleFile] = useState<File | null>(null);
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);
  const [transcription, setTranscription] = useState('');
  const [tags, setTags] = useState('');
  const [removeBackgroundNoise, setRemoveBackgroundNoise] = useState(
    DEFAULT_REMOVE_BACKGROUND_NOISE,
  );
  const [enhanceAudioQuality, setEnhanceAudioQuality] = useState(
    DEFAULT_ENHANCE_AUDIO_QUALITY,
  );
  const [creatingVoice, setCreatingVoice] = useState(false);
  const [creationStatus, setCreationStatus] = useState('');
  const [designInstruction, setDesignInstruction] = useState(DEFAULT_DESIGN_INSTRUCTION);
  const [designPreviewText, setDesignPreviewText] = useState(DEFAULT_DESIGN_PREVIEW_TEXT);
  const [designCandidateCount, setDesignCandidateCount] = useState(2);
  const [designedCandidates, setDesignedCandidates] = useState<DesignedRemoteTtsVoiceCandidate[]>(
    [],
  );
  const [designingVoice, setDesigningVoice] = useState(false);
  const [publishingDesignedVoice, setPublishingDesignedVoice] = useState(false);
  const [designStatus, setDesignStatus] = useState('');

  useEffect(() => {
    if (activePersona?.id) {
      setSelectedPersonaId(activePersona.id);
    }
  }, [activePersona?.id]);

  const selectedPersonaBinding = selectedPersonaId
    ? personaVoiceBindings[selectedPersonaId]
    : undefined;
  const activeRuntimeVoice = useMemo(() => {
    if (aiSettings.ttsProvider === 'piper') {
      const voice = ttsVoices.find((entry) => entry.key === aiSettings.ttsVoice);
      return `Piper / ${(voice?.name ?? aiSettings.ttsVoice) || 'none'}`;
    }
    if (aiSettings.ttsProvider === 'fish-speech') {
      return `Fish Speech / ${aiSettings.fishSpeechVoiceId || 'no voice id'}`;
    }
    return `Inworld / ${aiSettings.inworldVoiceId || 'no voice id'}`;
  }, [
    aiSettings.fishSpeechVoiceId,
    aiSettings.inworldVoiceId,
    aiSettings.ttsProvider,
    aiSettings.ttsVoice,
    ttsVoices,
  ]);

  const updateDraft = (patch: Partial<VoiceDraft>) => {
    setDraft((current) => ({
      ...current,
      ...patch,
    }));
  };

  const toggleAssignedPersona = (personaId: string) => {
    setDraft((current) => {
      const nextIds = current.assignedPersonaIds.includes(personaId)
        ? current.assignedPersonaIds.filter((id) => id !== personaId)
        : [...current.assignedPersonaIds, personaId];
      return {
        ...current,
        assignedPersonaIds: nextIds,
      };
    });
  };

  const handleEditVoice = (voice: VoiceLabVoice) => {
    setSampleFile(null);
    setCreationStatus('');
    setLanguage(DEFAULT_LANGUAGE);
    setTranscription('');
    setTags('');
    setRemoveBackgroundNoise(DEFAULT_REMOVE_BACKGROUND_NOISE);
    setEnhanceAudioQuality(DEFAULT_ENHANCE_AUDIO_QUALITY);
    setDraft({
      accent: voice.accent,
      ageVibe: voice.ageVibe,
      assignedPersonaIds: voice.assignedPersonaIds,
      createdAt: voice.createdAt,
      description: voice.description,
      emotionalTone: voice.emotionalTone,
      expressiveness: voice.expressiveness,
      id: voice.id,
      modelId: voice.modelId,
      name: voice.name,
      provider: voice.provider,
      providerVoiceId: voice.providerVoiceId,
      sample: voice.sample,
      speakingStyle: voice.speakingStyle,
      stability: voice.stability,
    });
  };

  const handleUseProviderVoice = (voice: RemoteTtsVoice) => {
    updateDraft({
      description: voice.description ?? draft.description,
      modelId:
        draft.modelId ||
        (voice.provider === 'fish-speech' ? 's2' : 'inworld-tts-2'),
      name: draft.name || voice.name,
      provider: voice.provider,
      providerVoiceId: voice.id,
    });
    setTags(voice.tags?.join(', ') ?? tags);
    setLanguage(voice.languages?.[0] ?? language);
  };

  const buildVoiceFromDraft = (
    voiceDraft: VoiceDraft,
    now: number,
    status: VoiceLabVoice['status'],
  ): VoiceLabVoice => ({
    accent: voiceDraft.accent.trim(),
    ageVibe: voiceDraft.ageVibe.trim(),
    assignedPersonaIds: voiceDraft.assignedPersonaIds,
    createdAt: voiceDraft.createdAt ?? now,
    description: voiceDraft.description.trim(),
    emotionalTone: voiceDraft.emotionalTone.trim(),
    expressiveness: voiceDraft.expressiveness,
    id: voiceDraft.id ?? `voice-lab-${now}`,
    modelId: voiceDraft.modelId.trim(),
    name: voiceDraft.name.trim(),
    provider: voiceDraft.provider,
    providerVoiceId: voiceDraft.providerVoiceId.trim(),
    sample: voiceDraft.sample,
    speakingStyle: voiceDraft.speakingStyle.trim(),
    stability: voiceDraft.stability,
    status,
    updatedAt: now,
  });

  const resetDraft = () => {
    setDraft(EMPTY_DRAFT);
    setSampleFile(null);
    setCreationStatus('');
    setTranscription('');
    setTags('');
    setLanguage(DEFAULT_LANGUAGE);
    setRemoveBackgroundNoise(DEFAULT_REMOVE_BACKGROUND_NOISE);
    setEnhanceAudioQuality(DEFAULT_ENHANCE_AUDIO_QUALITY);
  };

  const handleDesignProviderVoice = async () => {
    const instruction = designInstruction.trim();
    const previewText = designPreviewText.trim();
    if (!instruction || !previewText) {
      setDesignStatus('Voice design needs an instruction and preview text.');
      return;
    }

    setDesigningVoice(true);
    setDesignStatus(`Designing ${providerLabel(draft.provider)} voice previews...`);
    try {
      const result = await onDesignProviderVoice({
        provider: draft.provider,
        instruction,
        previewText,
        language: language.trim() || undefined,
        n: Math.min(designCandidateCount, draft.provider === 'fish-speech' ? 4 : 3),
      });
      setDesignedCandidates(result.candidates);
      setDesignStatus(`Designed ${result.candidates.length} ${providerLabel(draft.provider)} preview(s).`);
    } catch (error) {
      setDesignStatus(error instanceof Error ? error.message : 'Voice design failed.');
    } finally {
      setDesigningVoice(false);
    }
  };

  const handleUseDesignedCandidate = async (candidate: DesignedRemoteTtsVoiceCandidate) => {
    const name = draft.name.trim();
    if (candidate.provider === 'fish-speech') {
      if (!candidate.audioBase64) {
        setDesignStatus('Fish design candidate did not include preview audio.');
        return;
      }
      const file = base64ToFile(candidate.audioBase64, `${name || candidate.id}.wav`);
      setSampleFile(file);
      updateDraft({
        description: draft.description || candidate.instruction || designInstruction.trim(),
        modelId: draft.modelId || 's2',
        name: name || `Fish Design ${candidate.index + 1}`,
        provider: 'fish-speech',
        sample: {
          fileName: file.name,
          lastModified: file.lastModified,
          mimeType: file.type,
          size: file.size,
        },
      });
      setTranscription(candidate.text ?? designPreviewText);
      setDesignStatus('Loaded Fish preview as the clone sample. Use Clone Provider Voice to save it.');
      return;
    }

    if (!name) {
      setDesignStatus('Name the voice before publishing an Inworld design.');
      return;
    }
    if (!candidate.previewVoiceId) {
      setDesignStatus('Inworld design candidate did not include a preview voice id.');
      return;
    }

    setPublishingDesignedVoice(true);
    setDesignStatus('Publishing Inworld designed voice...');
    try {
      const created = await onPublishDesignedVoice({
        provider: 'inworld',
        voiceId: candidate.previewVoiceId,
        name,
        description: draft.description.trim() || designInstruction.trim(),
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      const now = Date.now();
      const nextDraft: VoiceDraft = {
        ...draft,
        modelId: created.modelId ?? (draft.modelId || 'inworld-tts-2'),
        provider: 'inworld',
        providerVoiceId: created.id,
      };
      onSaveVoice(buildVoiceFromDraft(nextDraft, now, 'ready'));
      resetDraft();
      setDesignedCandidates([]);
      setDesignStatus(`Published ${created.name || name} (${created.id}).`);
    } catch (error) {
      setDesignStatus(error instanceof Error ? error.message : 'Designed voice publish failed.');
    } finally {
      setPublishingDesignedVoice(false);
    }
  };

  const handleSave = () => {
    const now = Date.now();
    const name = draft.name.trim();
    if (!name) {
      return;
    }

    onSaveVoice(buildVoiceFromDraft(draft, now, draft.providerVoiceId.trim() ? 'ready' : 'draft'));
    resetDraft();
  };

  const handleCreateProviderVoice = async () => {
    const name = draft.name.trim();
    if (!name || !sampleFile) {
      return;
    }
    setCreatingVoice(true);
            setCreationStatus(`Cloning ${providerLabel(draft.provider)} voice from sample...`);
    try {
      const created = await onCreateProviderVoice({
        provider: draft.provider,
        name,
        sampleFile,
        description: draft.description.trim() || undefined,
        language: language.trim() || undefined,
        transcription: transcription.trim() || undefined,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        removeBackgroundNoise,
        enhanceAudioQuality,
        visibility: draft.provider === 'fish-speech' ? 'private' : undefined,
      });
      const now = Date.now();
      const nextDraft: VoiceDraft = {
        ...draft,
        modelId:
          created.modelId ??
          (draft.modelId || (draft.provider === 'fish-speech' ? 's2' : 'inworld-tts-2')),
        providerVoiceId: created.id,
        sample: draft.sample,
      };
      onSaveVoice(buildVoiceFromDraft(nextDraft, now, 'ready'));
      resetDraft();
      setCreationStatus(`Created ${created.name || name} (${created.id}).`);
    } catch (error) {
      setCreationStatus(error instanceof Error ? error.message : 'Voice creation failed.');
    } finally {
      setCreatingVoice(false);
    }
  };

  return (
    <>
      <div className="control-group">
        <div className="control-label">Persona Voice Defaults</div>
        <select
          className="select-tech"
          onChange={(event) => setSelectedPersonaId(event.target.value)}
          value={selectedPersonaId}
        >
          {personas.map((persona) => (
            <option key={persona.id} value={persona.id}>
              {persona.name}
            </option>
          ))}
        </select>
        <div className="status-grid">
          <div className="status-copy">
            Assigned{' '}
            <strong>{describeBinding(selectedPersonaBinding, voiceLabVoices, ttsVoices)}</strong>
          </div>
          <div className="status-copy">
            Current TTS <strong>{activeRuntimeVoice}</strong>
          </div>
        </div>
        <div className="btn-row">
          <button
            className="btn-tech secondary"
            disabled={!selectedPersonaId}
            onClick={() => onUseCurrentVoiceAsPersonaDefault(selectedPersonaId)}
            type="button"
          >
            Save Current As Default
          </button>
          <button
            className="btn-tech secondary"
            disabled={!selectedPersonaBinding || !selectedPersonaId}
            onClick={() => onApplyPersonaVoice(selectedPersonaId)}
            type="button"
          >
            Apply Default Voice
          </button>
        </div>
        <div className="field-hint">
          Persona switches use this binding first, then fall back to the built-in Piper preset.
          Neuro-sama defaults to the Neuro-sama Piper voice until you override it.
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Create / Register Voice</div>
        <input
          className="input-tech"
          onChange={(event) => updateDraft({ name: event.target.value })}
          placeholder="Voice name..."
          type="text"
          value={draft.name}
        />
        <select
          className="select-tech"
          onChange={(event) =>
            updateDraft({ provider: event.target.value as VoiceCreationProvider })
          }
          value={draft.provider}
        >
          <option value="fish-speech">Fish Speech zero-shot / custom voice</option>
          <option value="inworld">Inworld custom voice</option>
        </select>
        <div className="control-label">Voice Design</div>
        <textarea
          className="textarea-tech"
          maxLength={draft.provider === 'inworld' ? 250 : 2000}
          onChange={(event) => setDesignInstruction(event.target.value)}
          placeholder="Describe age, accent, timbre, energy, pacing, and delivery..."
          rows={3}
          value={designInstruction}
        />
        <textarea
          className="textarea-tech"
          maxLength={draft.provider === 'fish-speech' ? 300 : undefined}
          onChange={(event) => setDesignPreviewText(event.target.value)}
          placeholder="Preview sentence the provider should speak..."
          rows={2}
          value={designPreviewText}
        />
        <div className="slider-row slider-row-compact">
          <span>Candidates</span>
          <input
            max={draft.provider === 'fish-speech' ? 4 : 3}
            min={1}
            onChange={(event) => setDesignCandidateCount(Number(event.target.value))}
            step={1}
            type="range"
            value={designCandidateCount}
          />
          <span className="val">{designCandidateCount}</span>
        </div>
        <div className="btn-row">
          <button
            className="btn-tech secondary"
            disabled={designingVoice || publishingDesignedVoice}
            onClick={handleDesignProviderVoice}
            type="button"
          >
            {designingVoice ? 'Designing...' : 'Design Voice'}
          </button>
        </div>
        {designStatus ? <div className="field-hint">{designStatus}</div> : null}
        {designedCandidates.map((candidate) => (
          <div className="memory-entry" key={`${candidate.provider}-${candidate.id}`}>
            <div className="memory-entry-header">
              <strong>
                {providerLabel(candidate.provider)} candidate {candidate.index + 1}
              </strong>
              <span>{candidate.durationMs ? `${candidate.durationMs} ms` : candidate.id}</span>
            </div>
            {candidate.text ? <div className="status-copy">{candidate.text}</div> : null}
            {candidate.audioBase64 ? (
              <audio controls preload="metadata" src={candidateAudioSrc(candidate)} />
            ) : null}
            <div className="btn-row">
              <button
                className="btn-tech secondary"
                disabled={publishingDesignedVoice}
                onClick={() => {
                  void handleUseDesignedCandidate(candidate);
                }}
                type="button"
              >
                {candidate.provider === 'fish-speech'
                  ? 'Use As Clone Sample'
                  : publishingDesignedVoice
                    ? 'Publishing...'
                    : 'Publish Designed Voice'}
              </button>
            </div>
          </div>
        ))}
        <input
          accept="audio/*"
          className="input-tech"
          onChange={(event) => {
            const file = event.target.files?.[0];
            setSampleFile(file ?? null);
            updateDraft({
              sample: file
                ? {
                    fileName: file.name,
                    lastModified: file.lastModified,
                    mimeType: file.type,
                    size: file.size,
                  }
                : null,
            });
          }}
          type="file"
        />
        <div className="field-hint">Sample: {sampleLabel(draft.sample)}</div>
        <input
          className="input-tech"
          onChange={(event) => setLanguage(event.target.value)}
          placeholder="Language, e.g. EN_US..."
          type="text"
          value={language}
        />
        <textarea
          className="textarea-tech"
          onChange={(event) => setTranscription(event.target.value)}
          placeholder="Optional sample transcript. Helps the provider clone the sample accurately."
          rows={2}
          value={transcription}
        />
        <input
          className="input-tech"
          onChange={(event) => setTags(event.target.value)}
          placeholder="Tags, comma separated..."
          type="text"
          value={tags}
        />
        <label className="toggle-row">
          <span>Remove background noise</span>
          <input
            checked={removeBackgroundNoise}
            onChange={(event) => setRemoveBackgroundNoise(event.target.checked)}
            type="checkbox"
          />
        </label>
        <label className="toggle-row">
          <span>Enhance audio quality</span>
          <input
            checked={enhanceAudioQuality}
            onChange={(event) => setEnhanceAudioQuality(event.target.checked)}
            type="checkbox"
          />
        </label>
        <div className="btn-row">
          <button
            className="btn-tech"
            disabled={!draft.name.trim() || !sampleFile || creatingVoice}
            onClick={handleCreateProviderVoice}
            type="button"
          >
            {creatingVoice ? 'Cloning...' : 'Clone Provider Voice'}
          </button>
        </div>
        {creationStatus ? <div className="field-hint">{creationStatus}</div> : null}
        <input
          className="input-tech"
          onChange={(event) => updateDraft({ providerVoiceId: event.target.value })}
          placeholder="Provider voice id after creation..."
          type="text"
          value={draft.providerVoiceId}
        />
        <input
          className="input-tech"
          onChange={(event) => updateDraft({ modelId: event.target.value })}
          placeholder="Model id, e.g. s2 or inworld-tts-2..."
          type="text"
          value={draft.modelId}
        />
        <textarea
          className="textarea-tech"
          onChange={(event) => updateDraft({ description: event.target.value })}
          placeholder="Clone notes: sarcastic raspy vtuber, energetic, dry delivery..."
          rows={3}
          value={draft.description}
        />
        <input
          className="input-tech"
          onChange={(event) => updateDraft({ ageVibe: event.target.value })}
          placeholder="Age vibe / register, e.g. late teen to young adult..."
          type="text"
          value={draft.ageVibe}
        />
        <input
          className="input-tech"
          onChange={(event) => updateDraft({ accent: event.target.value })}
          placeholder="Accent / language notes..."
          type="text"
          value={draft.accent}
        />
        <input
          className="input-tech"
          onChange={(event) => updateDraft({ speakingStyle: event.target.value })}
          placeholder="Speaking style..."
          type="text"
          value={draft.speakingStyle}
        />
        <input
          className="input-tech"
          onChange={(event) => updateDraft({ emotionalTone: event.target.value })}
          placeholder="Emotional tone..."
          type="text"
          value={draft.emotionalTone}
        />
        <div className="slider-row slider-row-compact">
          <span>Stability</span>
          <input
            max={1}
            min={0}
            onChange={(event) => updateDraft({ stability: Number(event.target.value) })}
            step={0.01}
            type="range"
            value={draft.stability}
          />
          <span className="val">{draft.stability.toFixed(2)}</span>
        </div>
        <div className="slider-row slider-row-compact">
          <span>Expressive</span>
          <input
            max={1}
            min={0}
            onChange={(event) => updateDraft({ expressiveness: Number(event.target.value) })}
            step={0.01}
            type="range"
            value={draft.expressiveness}
          />
          <span className="val">{draft.expressiveness.toFixed(2)}</span>
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Attach To Personas</div>
        {personas.map((persona) => (
          <label className="toggle-row" key={persona.id}>
            <span>{persona.name}</span>
            <input
              checked={draft.assignedPersonaIds.includes(persona.id)}
              onChange={() => toggleAssignedPersona(persona.id)}
              type="checkbox"
            />
          </label>
        ))}
        <div className="btn-row">
          <button
            className="btn-tech"
            disabled={!draft.name.trim()}
            onClick={handleSave}
            type="button"
          >
            Save Voice
          </button>
          <button
            className="btn-tech secondary"
            onClick={resetDraft}
            type="button"
          >
            New Clone
          </button>
        </div>
        <div className="field-hint">
          Saving a ready voice with a provider id also updates the selected persona defaults.
          Fish Speech and Inworld can create provider voices from the uploaded sample, or you can paste an existing provider id.
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Provider Voice Catalog</div>
        <div className="btn-row">
          <button
            className="btn-tech secondary"
            disabled={remoteVoicesLoading}
            onClick={() => onRefreshRemoteVoices('fish-speech')}
            type="button"
          >
            {remoteVoicesLoading ? 'Fetching...' : 'Fetch Fish Voices'}
          </button>
          <button
            className="btn-tech secondary"
            disabled={remoteVoicesLoading}
            onClick={() => onRefreshRemoteVoices('inworld')}
            type="button"
          >
            {remoteVoicesLoading ? 'Fetching...' : 'Fetch Inworld Voices'}
          </button>
        </div>
        {remoteVoicesError ? <div className="status-copy">{remoteVoicesError}</div> : null}
        {remoteTtsVoices.length === 0 ? (
          <div className="status-copy">No provider voices loaded.</div>
        ) : (
          remoteTtsVoices.map((voice) => (
            <div className="memory-entry" key={`${voice.provider}-${voice.id}`}>
              <div className="memory-entry-header">
                <strong>{voice.name || voice.id}</strong>
                <span>{providerLabel(voice.provider)}</span>
              </div>
              <div className="status-copy">{voice.id}</div>
              <div className="status-copy">{voice.description || 'No description.'}</div>
              <div className="btn-row">
                <button
                  className="btn-tech secondary"
                  onClick={() => handleUseProviderVoice(voice)}
                  type="button"
                >
                  Use In Voice Draft
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="control-group">
        <div className="control-label">Voice Library</div>
        {voiceLabVoices.length === 0 ? (
          <div className="status-copy">No custom voices saved yet.</div>
        ) : (
          voiceLabVoices.map((voice) => (
            <div className="memory-entry" key={voice.id}>
              <div className="memory-entry-header">
                <strong>{voice.name}</strong>
                <span>
                  {providerLabel(voice.provider)} / {voice.status}
                </span>
              </div>
              <div className="status-copy">
                {voice.providerVoiceId || 'No provider voice id yet'}{' '}
                {voice.modelId ? `/ ${voice.modelId}` : ''}
              </div>
              <div className="status-copy">{voice.description || 'No description.'}</div>
              <div className="status-copy">Sample: {sampleLabel(voice.sample)}</div>
              <div className="btn-row">
                <button
                  className="btn-tech secondary"
                  onClick={() => handleEditVoice(voice)}
                  type="button"
                >
                  Edit
                </button>
                <button
                  className="btn-tech danger"
                  onClick={() => onDeleteVoice(voice.id)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
