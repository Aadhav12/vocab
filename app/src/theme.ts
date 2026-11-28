// Light / dark theme. Follows the system setting until the toggle is used; the choice is then remembered.
import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'testdaf-theme';
const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null;
const read = (): Theme | null => { try { const v = localStorage.getItem(KEY); return v === 'dark' || v === 'light' ? v : null; } catch { return null; } };
let explicit: Theme | null = read();
const listeners = new Set<() => void>();

export const currentTheme = (): Theme => explicit ?? (mq?.matches ? 'dark' : 'light');
function apply() {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = currentTheme();
  listeners.forEach((l) => l());
}
export function setTheme(t: Theme) { explicit = t; try { localStorage.setItem(KEY, t); } catch { /* optional */ } apply(); }
export const toggleTheme = () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
mq?.addEventListener?.('change', () => { if (!explicit) apply(); });
apply();

export function useTheme(): Theme {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, currentTheme);
}
