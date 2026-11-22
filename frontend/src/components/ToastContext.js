import { createContext } from 'react';

/** The `toast` API ToastProvider supplies: { success, error, info, dismiss }. Read it with useToast(). */
const ToastContext = createContext(null);

export default ToastContext;
