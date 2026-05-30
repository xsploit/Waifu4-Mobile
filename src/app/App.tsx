import { StatusPanel } from '../ui/StatusPanel';

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
      }}
    >
      <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>WebWaifu — rebuild</h1>
      <p style={{ margin: '0 0 24px', color: '#9b9ba3', fontSize: 14 }}>
        Phase 0 shell. Core loop comes next: input → LLM → text → TTS → mouth → avatar.
      </p>
      <StatusPanel />
    </main>
  );
}
