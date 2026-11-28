import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// the theme module reads localStorage, matchMedia and document when it loads, so each test loads a fresh copy with stubs
async function load(opts: { stored?: string; systemDark?: boolean }) {
  vi.resetModules();
  const store: Record<string, string> = opts.stored ? { 'testdaf-theme': opts.stored } : {};
  const dataset: Record<string, string> = {};
  vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } });
  vi.stubGlobal('document', { documentElement: { dataset } });
  vi.stubGlobal('matchMedia', () => ({ matches: !!opts.systemDark, addEventListener: () => {} }));
  const m = await import('./theme');
  return { m, store, dataset };
}
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => vi.resetModules());

describe('theme', () => {
  it('follows the system setting until the toggle is used', async () => {
    expect((await load({ systemDark: true })).dataset.theme).toBe('dark');
    expect((await load({ systemDark: false })).dataset.theme).toBe('light');
  });
  it('a stored choice beats the system setting', async () => {
    expect((await load({ stored: 'light', systemDark: true })).dataset.theme).toBe('light');
    expect((await load({ stored: 'dark', systemDark: false })).dataset.theme).toBe('dark');
  });
  it('toggling flips the theme, updates the page and remembers it', async () => {
    const { m, store, dataset } = await load({ systemDark: false });
    m.toggleTheme();
    expect(m.currentTheme()).toBe('dark'); expect(dataset.theme).toBe('dark'); expect(store['testdaf-theme']).toBe('dark');
    m.toggleTheme();
    expect(m.currentTheme()).toBe('light'); expect(store['testdaf-theme']).toBe('light');
  });
  it('ignores a garbage stored value', async () => {
    expect((await load({ stored: 'purple', systemDark: true })).dataset.theme).toBe('dark');
  });
});
