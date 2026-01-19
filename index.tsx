import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { migrateAllClues } from './services/clueManager';

// Expose migration function for one-time use
(window as any).migrateAllClues = migrateAllClues;

// DESIGN LOCKED: No further visual changes authorized.
const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);