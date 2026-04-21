import React from 'react';
import ReactDOM from 'react-dom/client';
import { SWRConfig } from 'swr';
import './index.css';
import { ThemeProvider } from './components/ThemeProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { localStorageProvider } from './lib/swrCache';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <ToastProvider>
      <SWRConfig
        value={{
          provider: localStorageProvider(),
          dedupingInterval: 2000,
          errorRetryCount: 3,
          errorRetryInterval: 5000,
          keepPreviousData: true,
          onError: (error: Error) => {
            // Deduplicate identical error messages within a 10-second window
            const now = Date.now();
            const lastError = (window as any).__lastError;
            if (lastError && lastError.message === error.message && now - lastError.timestamp < 10000) {
              return;
            }
            (window as any).__lastError = { message: error.message, timestamp: now };
            
            if ((window as any).__emitErrorToast) {
              (window as any).__emitErrorToast(error.message || 'An error occurred');
            }
          },
        }}
      >
        <ErrorBoundary>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </ErrorBoundary>
      </SWRConfig>
    </ToastProvider>
  </React.StrictMode>
);

serviceWorkerRegistration.register();
