import React from 'react';
import ReactDOM from 'react-dom/client';
import { getCurrentWindow } from '@tauri-apps/api/window';
import App from './App';
import { DetectorWidget } from './components/DetectorWidget';
import './index.css';

const currentWindow = getCurrentWindow();
const isDetectorWindow = currentWindow.label === 'detector';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isDetectorWindow ? <DetectorWidget /> : <App />}
  </React.StrictMode>
);
