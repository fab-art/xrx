import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { ThemeProvider } from '@/components/rssb/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import { ServiceWorkerRegister } from '@/components/rssb/ServiceWorkerRegister';

// Note: intentionally not wrapped in <StrictMode> — the app's autosave
// (debounced writes to IndexedDB) and several effects assume single-invoke
// semantics, matching the previous Next.js config (reactStrictMode: false).
createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <App />
    <Toaster />
    <ServiceWorkerRegister />
  </ThemeProvider>,
);
