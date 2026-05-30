import type { Dispatch, SetStateAction } from 'react';
import type { AiProxyHealth, AiSettings } from '../../../lib/chat/types';
import {
  applyLlmProviderSwitchDefaults,
  filterSafeProviderModels,
} from '../../../lib/chat/provider-defaults';
import { getReplyLengthLabel, REPLY_LENGTH_MODES } from '../../../lib/chat/reply-length';
import { Slider } from '../ui/Slider';

type AiTabProps = {
  activePersonaName: string;
  aiProxyHealth: AiProxyHealth | null;
  aiProxyHealthError: string | null;
  aiSettings: AiSettings;
  availableModels: string[];
  modelsError: string | null;
  modelsLoading: boolean;
  onRefreshAiProxyHealth: () => void;
  onRefreshModels: () => void;
  setAiSettings: Dispatch<SetStateAction<AiSettings>>;
};

function updateAiSettings(
  setAiSettings: Dispatch<SetStateAction<AiSettings>>,
  patch: Partial<AiSettings>,
) {
  setAiSettings((current) => ({
    ...current,
    ...patch,
  }));
}

function formatProviderTransport(providerState: AiProxyHealth['providerState']) {
  return providerState?.transport === 'http-stream' ? 'HTTP stream' : 'unknown';
}

function describeProviderState(providerState: AiProxyHealth['providerState']) {
  return providerState?.stateMode === 'stateless'
    ? 'Provider calls are stateless. Conversation continuity is Web Waifu-owned: recent turns, diary, relationship memory, semantic recall, tools, and stream context are rendered into each request.'
    : 'The backend reports provider transport state after refresh.';
}

export function AiTab({
  activePersonaName,
  aiProxyHealth,
  aiProxyHealthError,
  aiSettings,
  availableModels,
  modelsError,
  modelsLoading,
  onRefreshAiProxyHealth,
  onRefreshModels,
  setAiSettings,
}: AiTabProps) {
  const selectedModel = aiSettings.model.trim();
  const modelOptions = filterSafeProviderModels(
    selectedModel ? Array.from(new Set([...availableModels, selectedModel])) : availableModels,
  );
  const providerState = aiProxyHealth?.providerState ?? null;

  return (
    <>
      <div className="control-group">
        <div className="control-label">LLM Provider</div>
        <select
          className="select-tech"
          onChange={(event) => {
            const llmProvider = event.target.value as AiSettings['llmProvider'];
            setAiSettings((current) => applyLlmProviderSwitchDefaults(current, llmProvider));
          }}
          value={aiSettings.llmProvider}
        >
          <option value="vercel-gateway">Vercel AI Gateway</option>
          <option value="openrouter-responses">OpenRouter</option>
        </select>
        <div className="field-hint">
          Vercel AI Gateway and OpenRouter are aggregator providers. Pick any returned language
          model ID from either catalog; Web Waifu owns the conversation context locally.
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">
          {aiSettings.llmProvider === 'openrouter-responses'
            ? 'OpenRouter Model'
            : 'AI Gateway Model'}
        </div>
        <select
          className="select-tech"
          onChange={(event) =>
            updateAiSettings(setAiSettings, {
              model: event.target.value,
            })
          }
          value={aiSettings.model}
        >
          {modelOptions.length > 0 ? (
            <optgroup label="Provider API models">
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </optgroup>
          ) : null}
          {modelOptions.length === 0 ? (
            <option value="">Refresh models from provider</option>
          ) : null}
        </select>
        <div className="field-hint">
          Models are loaded directly from the selected aggregator API through the backend. Image,
          video, embedding, OpenAI o1, and OpenAI pro models are hidden from chat model pickers.
        </div>
        <button className="btn-tech secondary" onClick={onRefreshModels} type="button">
          {modelsLoading ? 'Refreshing...' : 'Refresh Models'}
        </button>
        {modelsError ? <div className="status-copy">{modelsError}</div> : null}
      </div>

      <div className="control-group">
        <div className="control-label">Backend Transport</div>
        <select
          className="select-tech"
          onChange={(event) =>
            updateAiSettings(setAiSettings, {
              aiTransportMode: event.target.value as AiSettings['aiTransportMode'],
            })
          }
          value={aiSettings.aiTransportMode}
        >
          <option value="http-stream">AI SDK HTTP Stream</option>
        </select>
        <div className="status-copy">
          Conversation state: <strong>app-owned</strong>. The provider request is stateless with
          rendered POML, recent transcript, diary, semantic memory, and Twitch/local context.
        </div>
        <div className="status-copy">
          Provider: <strong>{aiProxyHealth?.aiProvider ?? 'unknown'}</strong>
        </div>
        <div className="status-copy">
          State: <strong>{providerState?.stateMode ?? 'stateless'}</strong>
        </div>
        <div className="status-copy">
          Active state:{' '}
          <strong>
            {providerState?.activeState?.stateKey ??
              providerState?.activeStateKey ??
              providerState?.stateKey ??
              'default'}
          </strong>
        </div>
        <div className="status-copy">
          Transport: <strong>{formatProviderTransport(providerState)}</strong>
        </div>
        <div className="status-copy">
          Prompt cache: <strong>{providerState?.promptCacheKey ?? 'none'}</strong> / last cached
          tokens: <strong>{providerState?.cachedTokens ?? 0}</strong>
        </div>
        <div className="status-copy">
          Tools:{' '}
          <strong>
            {providerState?.toolsAvailable
              ? `${providerState.toolNames?.join(', ') || 'available'}${
                  providerState.toolsSource ? ` (${providerState.toolsSource})` : ''
                }`
              : 'not configured'}
          </strong>
        </div>
        <select
          className="select-tech"
          onChange={(event) =>
            updateAiSettings(setAiSettings, {
              toolChoiceMode: event.target.value as AiSettings['toolChoiceMode'],
            })
          }
          value={aiSettings.toolChoiceMode}
        >
          <option value="auto">Tool Calls: Auto</option>
          <option value="required">Tool Calls: Required</option>
        </select>
        <div className="field-hint">
          Auto exposes tools from the first turn and lets the prompt decide. Required forces provider
          tool choice and can loop on normal chat, so use it only for tool-call diagnostics.
        </div>
        <Slider
          label={`Max tool rounds ${aiSettings.maxToolRounds}`}
          max={30}
          min={1}
          onInput={(value) =>
            updateAiSettings(setAiSettings, { maxToolRounds: Math.round(value) })
          }
          step={1}
          value={aiSettings.maxToolRounds}
        />
        <div className="field-hint">{describeProviderState(providerState)}</div>
        <div className="field-hint">
          Cached tokens are the last value reported by the provider. A zero here means no cached
          token usage has been reported yet, not that prompt caching is disabled.
        </div>
        <button className="btn-tech secondary" onClick={onRefreshAiProxyHealth} type="button">
          Refresh Transport
        </button>
        {aiProxyHealthError ? <div className="status-copy">{aiProxyHealthError}</div> : null}
      </div>

      <div className="control-group">
        <div className="control-label">Generation Params</div>
        <select
          className="select-tech"
          onChange={(event) =>
            updateAiSettings(setAiSettings, {
              replyLength: event.target.value as AiSettings['replyLength'],
            })
          }
          value={aiSettings.replyLength}
        >
          {REPLY_LENGTH_MODES.map((mode) => (
            <option key={mode} value={mode}>
              Reply Length: {getReplyLengthLabel(mode)}
            </option>
          ))}
        </select>
        <div className="field-hint">
          Max Output is only a ceiling. Reply Length controls whether the prompt asks her to stay
          tight, balanced, or actually yap.
        </div>
        <Slider
          label="Temp"
          max={2}
          min={0}
          onInput={(value) => updateAiSettings(setAiSettings, { temperature: value })}
          step={0.05}
          value={aiSettings.temperature}
        />
        <Slider
          label="Max Output"
          max={1000}
          min={80}
          onInput={(value) => updateAiSettings(setAiSettings, { maxTokens: value })}
          step={20}
          value={aiSettings.maxTokens}
        />
      </div>

      <div className="control-group">
        <div className="control-label">Prompt Context</div>
        <div className="status-copy">
          Active persona: <strong>{activePersonaName}</strong>
        </div>
        <div className="field-hint">
          Prompt context now comes from persona, memory, Twitch/local chat turns, tools, TTS, and
          animation state. External host launch/share params are no longer injected.
        </div>
      </div>
    </>
  );
}
