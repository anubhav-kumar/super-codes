// Per-browser UI preferences (theme, details panel). No personal data is stored here.
// Storage can be unavailable (private mode, blocked site data), so every access is guarded.

const PREFIX = 'vartalap.';

export function readPref(key, fallback) {
  try {
    return window.localStorage.getItem(PREFIX + key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writePref(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    // Ignore: the preference just won't persist.
  }
}

export const THEMES = ['system', 'light', 'dark'];

// 'system' removes the attribute so CSS follows prefers-color-scheme.
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
}

// Inline in <head> so the stored theme applies before first paint (no flash).
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem('${PREFIX}theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
