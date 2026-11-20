import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { initServiceWorker } from './offline/serviceWorker.js';
import { startOutboxSync } from './offline/outbox.js';
import './index.css';

initServiceWorker();
startOutboxSync();

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <BrowserRouter>
            <App />
        </BrowserRouter>
    </StrictMode>
);
