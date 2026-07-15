import type { Dispatch, SetStateAction } from 'react';
import {
  endpointSupportsStructuredOutputs,
  selectReplyFormat,
  selectVercelEndpointReplyFormat,
  supportsImageInput,
  type ProviderEndpointInfo,
  type ProviderModelInfo,
} from '../../../brain/modelCapability';
import type { AiProxyHealth, AiSettings, RuntimeErrorEntry } from '../../../lib/chat/types';
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
  availableModelMetadata: ReadonlyMap<string, ProviderModelInfo>;
  availableModels: string[];
  modelsError: string | null;
  modelsLoading: boolean;
  onClearRuntimeErrors: () => void;
  onRefreshAiProxyHealth: () => void;
  onRefreshModels: () => void;
  runtimeErrors: RuntimeErrorEntry[];
  setAiSettings: Dispatch<SetStateAction<AiSettings>>;
  vercelProviderSlugs: string[];
  vercelProviderEndpoints: ProviderEndpointInfo[];
  vercelProvidersError: string | null;
  vercelProvidersLoading: boolean;
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

function describeReplyLane(
  aiSettings: AiSettings,
  model: ProviderModelInfo | undefined,
  endpointFormat?: 'structured' | 'text',
) {
  const format = endpointFormat ?? selectReplyFormat(aiSettings.llmProvider, model ?? null);
  if (
    format === 'structured' &&
    aiSettings.llmProvider === 'vercel-gateway' &&
    aiSettings.model === 'deepseek/deepseek-v4-pro'
  ) {
    return 'Strict tool JSON (provider may deliver one completed payload)';
  }
  return format === 'structured'
    ? 'Structured output stream'
    : 'Streaming text + hidden emotion metadata';
}

function getEndpointCapabilityTags(endpoint: ProviderEndpointInfo) {
  const parameters = new Set(endpoint.supportedParameters.map((parameter) => parameter.toLowerCase()));
  const tags: string[] = [];
  if (endpointSupportsStructuredOutputs(endpoint)) tags.push('json');
  if (parameters.has('tools') || parameters.has('tool_choice')) tags.push('tools');
  if (parameters.has('reasoning') || parameters.has('include_reasoning')) tags.push('reasoning');
  if (endpoint.supportsImplicitCaching) tags.push('cache');
  const context = formatModelCount(endpoint.contextLength);
  if (context) tags.push(`${context} ctx`);
  if (typeof endpoint.latencyP50Ms === 'number') tags.push(`${Math.round(endpoint.latencyP50Ms)}ms`);
  return tags;
}

function formatEndpointOption(endpoint: ProviderEndpointInfo) {
  const tags = getEndpointCapabilityTags(endpoint);
  return tags.length > 0 ? `${endpoint.providerName} [${tags.join(', ')}]` : endpoint.providerName;
}

function describeToolStatus(
  mode: AiSettings['toolChoiceMode'],
  providerState: AiProxyHealth['providerState'],
) {
  if (mode === 'off') {
    return 'Off';
  }
  const modeLabel = mode === 'required' ? 'Required' : 'Auto';
  if (providerState?.toolsAvailable === true) {
    return `${modeLabel}: ${providerState.toolNames?.join(', ') || 'available'}${
      providerState.toolsSource ? ` (${providerState.toolsSource})` : ''
    }`;
  }
  if (providerState?.toolsAvailable === false) {
    return `${modeLabel}: no runtime tool key available on last reply`;
  }
  return `${modeLabel}: availability reported after the next reply`;
}

function formatModelCount(value?: number) {
  if (!value || !Number.isFinite(value)) {
    return null;
  }
  if (value >= 1_000_000) {
    return `${Number((value / 1_000_000).toFixed(1))}M`;
  }
  if (value >= 1_000) {
    return `${Number((value / 1_000).toFixed(0))}K`;
  }
  return String(value);
}

function getModelCapabilityTags(model: ProviderModelInfo | undefined) {
  if (!model) {
    return [];
  }
  const tags = new Set((model.tags ?? []).map((tag) => tag.toLowerCase()));
  const params = new Set(model.supportedParameters.map((param) => param.toLowerCase()));
  const capabilityTags: string[] = [];

  if (model.supportsStructuredOutputs) {
    capabilityTags.push('json');
  }
  if (supportsImageInput(model)) {
    capabilityTags.push('vision');
  }
  if (tags.has('file') || tags.has('file-input')) {
    capabilityTags.push('files');
  }
  if (tags.has('video')) {
    capabilityTags.push('video');
  }
  if (tags.has('reasoning') || params.has('reasoning') || params.has('include_reasoning')) {
    capabilityTags.push('reasoning');
  }
  if (tags.has('tool-use') || params.has('tools') || params.has('tool_choice')) {
    capabilityTags.push('tools');
  }
  if (model.supportsImplicitCaching || tags.has('implicit-caching')) {
    capabilityTags.push('cache');
  }
  if (model.type && model.type !== 'language') {
    capabilityTags.push(model.type);
  }
  const contextWindow = formatModelCount(model.contextWindow);
  if (contextWindow) {
    capabilityTags.push(`${contextWindow} ctx`);
  }

  return capabilityTags;
}

function formatModelOption(modelId: string, metadata: ReadonlyMap<string, ProviderModelInfo>) {
  const tags = getModelCapabilityTags(metadata.get(modelId));
  return tags.length ? `${modelId} [${tags.join(', ')}]` : modelId;
}

const OPENROUTER_PROVIDER_SLUGS = [
  'alibaba',
  'deepseek',
  'morph',
  'parasail/fp8',
  'deepinfra/fp4',
  'digitalocean',
  'streamlake',
  'novita/fp8',
  'venice',
  'atlas-cloud/fp8',
  'baidu/fp8',
  'gmicloud/fp8',
  'siliconflow/fp8',
];

export function AiTab({
  activePersonaName,
  aiProxyHealth,
  aiProxyHealthError,
  aiSettings,
  availableModelMetadata,
  availableModels,
  modelsError,
  modelsLoading,
  onClearRuntimeErrors,
  onRefreshAiProxyHealth,
  onRefreshModels,
  runtimeErrors,
  setAiSettings,
  vercelProviderSlugs,
  vercelProviderEndpoints,
  vercelProvidersError,
  vercelProvidersLoading,
}: AiTabProps) {
  const selectedModel = aiSettings.model.trim();
  const modelOptions = filterSafeProviderModels(
    selectedModel ? Array.from(new Set([...availableModels, selectedModel])) : availableModels,
  );
  const providerState = aiProxyHealth?.providerState ?? null;
  const configuredModel = availableModelMetadata.get(aiSettings.model);
  const lastChatProvider = providerState?.provider ?? aiProxyHealth?.aiProvider;
  const lastChatModel = providerState?.model ?? aiProxyHealth?.model;
  const savedVercelProvider = aiSettings.vercelProviderSlugs.trim();
  const selectedSingleVercelProvider = savedVercelProvider.includes(',')
    ? ''
    : savedVercelProvider;
  const vercelProviderOptions = selectedSingleVercelProvider &&
    !vercelProviderSlugs.includes(selectedSingleVercelProvider)
    ? [selectedSingleVercelProvider, ...vercelProviderSlugs]
    : vercelProviderSlugs;
  const endpointByProvider = new Map(
    vercelProviderEndpoints.map((endpoint) => [endpoint.providerName, endpoint] as const),
  );
  const selectedVercelEndpoint = endpointByProvider.get(selectedSingleVercelProvider);
  const pinnedVercelProviders = aiSettings.vercelRoutingMode === 'pinned'
    ? savedVercelProvider.split(',').map((provider) => provider.trim()).filter(Boolean)
    : [];
  const vercelReplyFormat = selectVercelEndpointReplyFormat({
    allowFallbacks:
      aiSettings.vercelRoutingMode !== 'pinned' || aiSettings.vercelAllowFallbacks,
    endpoints: vercelProviderEndpoints,
    pinnedProviders: pinnedVercelProviders,
  });

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

      {aiSettings.llmProvider === 'openrouter-responses' ? (
        <div className="control-group">
          <div className="control-label">OpenRouter Routing</div>
          <select
            className="select-tech"
            onChange={(event) =>
              updateAiSettings(setAiSettings, {
                openRouterRoutingMode: event.target.value as AiSettings['openRouterRoutingMode'],
              })
            }
            value={aiSettings.openRouterRoutingMode}
          >
            <option value="auto">Auto</option>
            <option value="latency">Fastest latency</option>
            <option value="throughput">Highest throughput / Nitro</option>
            <option value="pinned">Pinned provider</option>
          </select>
          {aiSettings.openRouterRoutingMode === 'pinned' ? (
            <>
              <select
                className="select-tech"
                onChange={(event) =>
                  updateAiSettings(setAiSettings, {
                    openRouterProviderSlugs: event.target.value,
                  })
                }
                value={aiSettings.openRouterProviderSlugs}
              >
                <option value="">Choose provider slug</option>
                {OPENROUTER_PROVIDER_SLUGS.map((slug) => (
                  <option key={slug} value={slug}>
                    {slug}
                  </option>
                ))}
              </select>
              <input
                className="input-tech"
                onChange={(event) =>
                  updateAiSettings(setAiSettings, {
                    openRouterProviderSlugs: event.target.value,
                  })
                }
                placeholder="provider slug or comma list"
                value={aiSettings.openRouterProviderSlugs}
              />
              <label className="toggle-row">
                <input
                  checked={aiSettings.openRouterAllowFallbacks}
                  onChange={(event) =>
                    updateAiSettings(setAiSettings, {
                      openRouterAllowFallbacks: event.target.checked,
                    })
                  }
                  type="checkbox"
                />
                <span>Allow fallback if pinned provider fails</span>
              </label>
            </>
          ) : null}
          <div className="field-hint">
            Auto uses OpenRouter default routing. Fastest latency sends provider.sort=latency.
            Throughput sends provider.sort=throughput. Pinned sends provider.only with the chosen
            slug list.
          </div>
        </div>
      ) : null}

      {aiSettings.llmProvider === 'vercel-gateway' ? (
        <div className="control-group">
          <div className="control-label">Vercel Provider Routing</div>
          <select
            className="select-tech"
            onChange={(event) =>
              updateAiSettings(setAiSettings, {
                vercelRoutingMode: event.target.value as AiSettings['vercelRoutingMode'],
              })
            }
            value={aiSettings.vercelRoutingMode}
          >
            <option value="auto">Verified auto</option>
            <option value="latency">Fastest first token</option>
            <option value="throughput">Highest throughput</option>
            <option value="cost">Lowest cost</option>
            <option value="pinned">Pinned provider order</option>
          </select>
          {aiSettings.vercelRoutingMode === 'pinned' ? (
            <>
              <select
                className="select-tech"
                onChange={(event) =>
                  updateAiSettings(setAiSettings, { vercelProviderSlugs: event.target.value })
                }
                value={selectedSingleVercelProvider}
              >
                <option value="">
                  {vercelProvidersLoading ? 'Loading selected-model providers...' : 'Choose provider'}
                </option>
                {vercelProviderOptions.map((slug) => (
                  <option key={slug} value={slug}>
                    {endpointByProvider.has(slug)
                      ? formatEndpointOption(endpointByProvider.get(slug)!)
                      : `${slug} [saved; metadata unavailable]`}
                  </option>
                ))}
              </select>
              <input
                className="input-tech"
                onChange={(event) =>
                  updateAiSettings(setAiSettings, { vercelProviderSlugs: event.target.value })
                }
                placeholder="provider slug or ordered comma list"
                value={aiSettings.vercelProviderSlugs}
              />
              <label className="toggle-row">
                <input
                  checked={aiSettings.vercelAllowFallbacks}
                  onChange={(event) =>
                    updateAiSettings(setAiSettings, { vercelAllowFallbacks: event.target.checked })
                  }
                  type="checkbox"
                />
                <span>Allow other providers after this order</span>
              </label>
            </>
          ) : null}
          <div className="field-hint">
            Auto lets Vercel route dynamically by availability and latency. Explicit modes use
            gateway sort, order, or only controls. Pinned choices are loaded from the selected
            model's live Vercel endpoint catalog.
          </div>
          {vercelProvidersError ? <div className="error-copy">{vercelProvidersError}</div> : null}
          {selectedVercelEndpoint ? (
            <div className="status-copy">
              Selected endpoint: <strong>{getEndpointCapabilityTags(selectedVercelEndpoint).join(', ') || 'text only'}</strong>
              {' '}· uptime 1h <strong>{selectedVercelEndpoint.uptimeLastHour?.toFixed(2) ?? 'n/a'}%</strong>
              {' '}· p95 <strong>{selectedVercelEndpoint.latencyP95Ms !== undefined
                ? `${Math.round(selectedVercelEndpoint.latencyP95Ms)}ms`
                : 'n/a'}</strong>
            </div>
          ) : null}
          {aiSettings.model === 'deepseek/deepseek-v4-pro' ? (
            <div className="field-hint">
              Compatibility: {vercelReplyFormat === 'structured'
                ? 'every eligible endpoint advertises structured output.'
                : 'the eligible endpoints do not all advertise structured output, so live chat uses streaming text metadata.'}
            </div>
          ) : null}
        </div>
      ) : null}

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
                <option key={model} title={formatModelOption(model, availableModelMetadata)} value={model}>
                  {formatModelOption(model, availableModelMetadata)}
                </option>
              ))}
            </optgroup>
          ) : null}
          {modelOptions.length === 0 ? (
            <option value="">Refresh models from provider</option>
          ) : null}
        </select>
        {availableModelMetadata.has(aiSettings.model) ? (
          <div className="status-copy">
            Capabilities:{' '}
            <strong>
              {getModelCapabilityTags(availableModelMetadata.get(aiSettings.model)).join(', ') ||
                'metadata loaded'}
            </strong>
          </div>
        ) : null}
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
          Provider: <strong>{aiSettings.llmProvider}</strong>
        </div>
        <div className="status-copy">
          Conversation: <strong>app-owned / provider stateless</strong>
        </div>
        <div className="status-copy">
          Reply lane:{' '}
          <strong>
            {describeReplyLane(
              aiSettings,
              configuredModel,
              aiSettings.llmProvider === 'vercel-gateway' ? vercelReplyFormat : undefined,
            )}
          </strong>
        </div>
        <div className="status-copy">
          Transport: <strong>AI SDK HTTP stream</strong>
        </div>
        <div className="status-copy">
          Last completed chat:{' '}
          <strong>
            {lastChatProvider && lastChatModel
              ? `${lastChatProvider} / ${lastChatModel}`
              : 'not reported this session'}
          </strong>
        </div>
        <div className="status-copy">
          Prompt cache:{' '}
          <strong>
            {typeof providerState?.cachedTokens === 'number'
              ? providerState.cachedTokens > 0
                ? `${providerState.cachedTokens} cached tokens read`
                : typeof providerState.cacheWriteTokens === 'number' && providerState.cacheWriteTokens > 0
                  ? `${providerState.cacheWriteTokens} tokens cached for reuse`
                  : 'enabled; no cache hit on the last response'
              : 'enabled; provider usage not reported yet'}
          </strong>
          {providerState?.promptCacheMode ? ` / ${providerState.promptCacheMode}` : ''}
        </div>
        <div className="status-copy">
          Tools:{' '}
          <strong>
            {describeToolStatus(aiSettings.toolChoiceMode, providerState)}
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
          <option value="off">Tool Calls: Off</option>
          <option value="auto">Tool Calls: Auto</option>
          <option value="required">Tool Calls: Required</option>
        </select>
        <div className="field-hint">
          Off keeps normal chat lean. Auto exposes tools from the first turn and lets the prompt
          decide. Required forces provider tool choice and can loop on normal chat, so use it only
          for tool-call diagnostics.
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
        <div className="field-hint">
          Provider calls are stateless. Conversation continuity is rendered from the active
          persona, transcript, relationship memory, semantic recall, and current situation.
        </div>
        <div className="field-hint">
          Cache telemetry appears only when the provider reports it; an absent value is not shown
          as zero or as proof that caching is disabled.
        </div>
        <button className="btn-tech secondary" onClick={onRefreshAiProxyHealth} type="button">
          Check Backend
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
        <textarea
          className="input-tech"
          onChange={(event) =>
            updateAiSettings(setAiSettings, {
              runtimeSituation: event.target.value,
            })
          }
          placeholder="Current situation, e.g. You are reading another Twitch channel, but nobody there can see or hear you. Only Subsect can hear you locally."
          rows={5}
          value={aiSettings.runtimeSituation}
        />
        <div className="field-hint">
          Runtime Situation is injected into the current-scene prompt every turn. Use it for the
          current setup, not permanent character facts.
        </div>
      </div>

      <div className="control-group">
        <div className="control-label">Chat Runtime</div>
        <div className="status-copy">
          Errors are kept out of the conversation, subtitles, memory, and stream overlay.
        </div>
        {runtimeErrors.length > 0 ? (
          <div className="memory-list">
            {runtimeErrors.slice().reverse().map((entry) => (
              <div className="memory-entry" key={entry.id}>
                <div className="memory-entry-header">
                  <strong>{entry.scope}</strong>
                  <span>{new Date(entry.createdAt).toLocaleTimeString()}</span>
                </div>
                <p>{entry.message}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="field-hint">No chat runtime errors this session.</div>
        )}
        <button
          className="btn-tech secondary"
          disabled={runtimeErrors.length === 0}
          onClick={onClearRuntimeErrors}
          type="button"
        >
          Clear Runtime Errors
        </button>
      </div>
    </>
  );
}
