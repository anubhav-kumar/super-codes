// Build-time configuration. VITE_* values are public: never put secrets here.
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'CA CRM';
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
