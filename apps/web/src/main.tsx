/**
 * Web Application Entry Point
 * Injects dev TMA mock and mounts React root.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { setupDevTmaMock } from './mock-tma';
import './i18n';
import './index.css';
import { App } from './App';

// Setup dev mock when running outside Telegram in dev mode (Rule REQ-069)
setupDevTmaMock();

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
