import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/lib/env'; // validates environment at boot
import '@/styles/index.css';
import { initTheme } from '@/stores/themeStore';
import { App } from './App';

initTheme();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
