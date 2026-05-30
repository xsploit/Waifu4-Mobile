import { useEffect, useRef, useState } from 'react';
import type { PersonaDraft, PersonaProfile } from '../../../lib/chat/types';

type CharacterTabProps = {
  activePersona: PersonaProfile | null;
  personas: PersonaProfile[];
  onActivatePersona: (id: string) => void;
  onDeletePersona: (id: string) => void;
  onSavePersona: (draft: PersonaDraft, personaId?: string) => void;
};

const EMPTY_DRAFT: PersonaDraft = {
  name: '',
  systemPrompt: '',
  description: '',
  userNickname: '',
};

export function CharacterTab({
  activePersona,
  personas,
  onActivatePersona,
  onDeletePersona,
  onSavePersona,
}: CharacterTabProps) {
  const [draftId, setDraftId] = useState<string | undefined>(activePersona?.id);
  const [draft, setDraft] = useState<PersonaDraft>(activePersona ?? EMPTY_DRAFT);
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
  }, [activePersona]);

  const updateDraft = (patch: Partial<PersonaDraft>) => {
    setDraft((current) => ({
      ...current,
      ...patch,
    }));
  };

  const handleSave = () => {
    if (!draft.name.trim()) {
      return;
    }

    onSavePersona(
      {
        name: draft.name.trim(),
        systemPrompt: draft.systemPrompt.trim(),
        description: draft.description.trim(),
        userNickname: draft.userNickname.trim(),
      },
      draftId,
    );
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

      <div className="btn-row">
        <button
          className="btn-tech"
          disabled={!draft.name.trim()}
          onClick={handleSave}
          type="button"
        >
          {draftId ? 'Save Persona' : 'Create Persona'}
        </button>
        <button
          className="btn-tech secondary"
          onClick={() => {
            setDraftId(undefined);
            setDraft(EMPTY_DRAFT);
          }}
          type="button"
        >
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
            const blob = new Blob([JSON.stringify(draft, null, 2)], {
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
                const parsed = JSON.parse(String(reader.result ?? '{}')) as Partial<PersonaDraft>;
                setDraftId(undefined);
                setDraft({
                  name: String(parsed.name ?? ''),
                  systemPrompt: String(parsed.systemPrompt ?? ''),
                  description: String(parsed.description ?? ''),
                  userNickname: String(parsed.userNickname ?? ''),
                });
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
