import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('[Template React Simple] Root element not found');
}

const root = createRoot(rootElement);

const render = (node: ReactNode) => {
  root.render(node);
};

render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
