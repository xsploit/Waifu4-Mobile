import { StatusPanel } from '../ui/StatusPanel';
import { ChatPanel } from '../ui/ChatPanel';

export function App() {
  return (
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        color: '#e8e8ec',
        background: '#16161a',
        minHeight: '100vh',
        margin: 0,
        padding: '32px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      <header>
        <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>WebWaifu — rebuild</h1>
        <p style={{ margin: '0 0 12px', color: '#9b9ba3', fontSize: 14 }}>
          LLM lane online. Next: TTS → mouth → avatar.
        </p>
        <StatusPanel />
      </header>
      <ChatPanel />
    </main>
  );
}
