'use client';

import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);
const HIDE_AFTER_MS = 4000;
const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };

// → { success(text), error(text), info(text) }. Errors use role="alert", others role="status".
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (kind, text) => {
      const id = ++nextId.current;
      // Same text twice in a row (e.g. repeated poll failures) shows once.
      setToasts((all) =>
        all.some((t) => t.text === text) ? all : [...all.slice(-2), { id, kind, text }],
      );
      setTimeout(() => dismiss(id), HIDE_AFTER_MS);
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: (text) => show('success', text),
      error: (text) => show('error', text),
      info: (text) => show('info', text),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region">
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div
              key={t.id}
              className={`toast ${t.kind}`}
              role={t.kind === 'error' ? 'alert' : 'status'}
            >
              <Icon className="toast-icon" size={18} aria-hidden="true" />
              <span className="toast-text">{t.text}</span>
              <button
                type="button"
                className="icon-button"
                aria-label="Dismiss"
                onClick={() => dismiss(t.id)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
