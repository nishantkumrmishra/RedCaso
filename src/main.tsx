import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { FluentDialogProvider } from './components/FluentDialog';
import './index.css';

// Globally suppress generic browser context menu (except on text inputs/textareas)
window.addEventListener('contextmenu', (e) => {
  const target = e.target as HTMLElement;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return;
  }
  e.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <FluentDialogProvider>
      <App />
    </FluentDialogProvider>
  </React.StrictMode>
);
