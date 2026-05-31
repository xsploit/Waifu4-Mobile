import { useState } from 'react';
import { StatusPanel } from '../ui/StatusPanel';
import { ChatPanel } from '../ui/ChatPanel';
import { VrmStage } from '../components/VrmStage';
import { createDefaultSequencerSettings, createDefaultVisualSettings } from '../lib/menu/defaults';

export function App() {
  const [visualSettings, setVisualSettings] = useState(() => createDefaultVisualSettings());
  const [sequencerSettings, setSequencerSettings] = useState(() => createDefaultSequencerSettings());

  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        color: '#e8e8ec',
        background: '#16161a',
        minHeight: '100vh',
        height: '100vh',
        margin: 0,
        padding: '32px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        overflow: 'auto',
      }}
    >
      <header>
        <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>WebWaifu — rebuild</h1>
        <p style={{ margin: '0 0 12px', color: '#9b9ba3', fontSize: 14 }}>
          LLM lane online. Next: TTS → mouth → avatar.
        </p>
        <StatusPanel />
      </header>
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
          gap: 20,
          alignItems: 'stretch',
        }}
      >
        <div
          style={{
            position: 'relative',
            height: 'min(62vh, 560px)',
            minHeight: 420,
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            background: '#101014',
          }}
        >
          <VrmStage
            active
            facialExpressionRequest={null}
            manualPlayRequest={null}
            modelUrl="/cdn-assets/product/avatar.vrm"
            sequencerSettings={sequencerSettings}
            setSequencerSettings={setSequencerSettings}
            setVisualSettings={setVisualSettings}
            visualSettings={visualSettings}
          />
        </div>
        <ChatPanel />
      </section>
    </main>
  );
}
