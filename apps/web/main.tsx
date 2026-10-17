import '@fontsource/lato/latin-300.css';
import '@fontsource/lato/latin-400.css';
import '@fontsource/lato/latin-700.css';
import './styles/tokens.css';
import './styles/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { reloadOnStaleChunk } from './lib/staleChunk';

window.addEventListener('vite:preloadError', () => reloadOnStaleChunk());

// Production only, as before: in development the worker would serve stale code.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
