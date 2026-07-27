import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { createRoot } from 'react-dom/client';
import { VrmStage } from '../components/VrmStage';
import { createDefaultSequencerSettings, createDefaultVisualSettings } from '../lib/menu/defaults';
import type {
  FacialExpressionRequest,
  ManualPlayRequest,
  SequencerSettings,
  VisualSettings,
} from '../lib/menu/types';
import { DEFAULT_ANIMATIONS } from '../lib/vrm/sequencer';
import { getTtsManager } from './tts-manager-shim';
import './stage.css';

type AvatarCommand =
  | { type: 'active'; active: boolean }
  | { type: 'expression'; request: FacialExpressionRequest | null }
  | { type: 'lipSync'; active: boolean; amplitude: number; weights: {
      aa: number;
      ih: number;
      ou: number;
      ee: number;
      oh: number;
    }; bands: { low: number; midLow: number; midHigh: number; high: number } }
  | { type: 'model'; url: string | null }
  | { type: 'play'; request: ManualPlayRequest | null }
  | { type: 'playAsset'; url: string }
  | { type: 'sequencer'; settings: Partial<SequencerSettings> }
  | { type: 'visual'; settings: Partial<VisualSettings> };

type AndroidAvatarBridge = {
  onEvent?: (json: string) => void;
  onReady?: () => void;
};

declare global {
  interface Window {
    AndroidAvatar?: AndroidAvatarBridge;
    WebWaifuAvatar?: {
      receive: (json: string) => void;
    };
  }
}

function postNativeEvent(event: unknown) {
  window.AndroidAvatar?.onEvent?.(JSON.stringify(event));
}

function mergeState<T extends object>(
  setter: Dispatch<SetStateAction<T>>,
  patch: Partial<T>,
) {
  setter((current) => ({ ...current, ...patch }));
}

function MobileAvatarStage() {
  const [active, setActive] = useState(true);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [visualSettings, setVisualSettings] = useState(createDefaultVisualSettings);
  const [sequencerSettings, setSequencerSettings] = useState(createDefaultSequencerSettings);
  const [manualPlayRequest, setManualPlayRequest] = useState<ManualPlayRequest | null>(null);
  const [facialExpressionRequest, setFacialExpressionRequest] =
    useState<FacialExpressionRequest | null>(null);
  const manualPlayNonceRef = useRef(Date.now());

  const receive = useCallback((json: string) => {
    let command: AvatarCommand;
    try {
      command = JSON.parse(json) as AvatarCommand;
    } catch (error) {
      postNativeEvent({ type: 'error', message: `Invalid avatar command: ${String(error)}` });
      return;
    }

    switch (command.type) {
      case 'active':
        setActive(command.active);
        break;
      case 'expression':
        setFacialExpressionRequest(command.request);
        break;
      case 'lipSync':
        getTtsManager().updateFrame(
          command.active,
          command.amplitude,
          {
            A: command.weights.aa,
            I: command.weights.ih,
            U: command.weights.ou,
            E: command.weights.ee,
            O: command.weights.oh,
          },
          command.bands,
        );
        break;
      case 'model':
        setModelUrl(command.url);
        break;
      case 'play':
        setManualPlayRequest(command.request);
        break;
      case 'playAsset': {
        const index = DEFAULT_ANIMATIONS.findIndex((entry) => entry.url === command.url);
        if (index < 0) {
          postNativeEvent({
            type: 'error',
            message: `Animation is not in the Waifu4 playlist: ${command.url}`,
          });
          break;
        }
        manualPlayNonceRef.current += 1;
        setManualPlayRequest({ index, nonce: manualPlayNonceRef.current });
        break;
      }
      case 'sequencer':
        mergeState(setSequencerSettings, command.settings);
        break;
      case 'visual':
        mergeState(setVisualSettings, command.settings);
        break;
    }
  }, []);

  useEffect(() => {
    window.WebWaifuAvatar = { receive };
    window.AndroidAvatar?.onReady?.();
    return () => {
      delete window.WebWaifuAvatar;
    };
  }, [receive]);

  return (
    <VrmStage
      active={active}
      facialExpressionRequest={facialExpressionRequest}
      manualPlayRequest={manualPlayRequest}
      modelUrl={modelUrl}
      onAnimationTelemetry={(patch) => postNativeEvent({ type: 'animation', patch })}
      onFacialExpressionTelemetry={(patch) => postNativeEvent({ type: 'expression', patch })}
      onVrmTelemetry={(snapshot) => postNativeEvent({ type: 'vrm', snapshot })}
      sequencerSettings={sequencerSettings}
      setSequencerSettings={setSequencerSettings}
      setVisualSettings={setVisualSettings}
      visualSettings={visualSettings}
    />
  );
}

const root = document.getElementById('avatar-root');
if (!root) {
  throw new Error('Avatar root is missing.');
}

createRoot(root).render(
  <StrictMode>
    <MobileAvatarStage />
  </StrictMode>,
);
