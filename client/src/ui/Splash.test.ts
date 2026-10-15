/**
 * Splash.test.ts - jsdom DOM-testing capability seed.
 *
 * Splash.ts is a good target for jsdom specifically because mountSplash() builds
 * real DOM nodes (overlay, <img>, prompt, hint), injects a <style> tag, wires
 * click/touchstart/keydown listeners, and removes itself after a fade timeout.
 * This exercises the actual module, not a stand-in.
 *
 * The module auto-mounts on import, so each test resets the DOM and re-imports
 * via vi.resetModules() to get a fresh, isolated mount.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Splash (jsdom DOM behavior)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('leaves the authored orientation bay as the only initial phone-portrait handoff', async () => {
    const matchMedia = vi.fn((query: string) => ({
      matches: query === '(orientation: portrait) and (max-width: 480px)',
    } as MediaQueryList));
    vi.stubGlobal('matchMedia', matchMedia);

    const { mountSplash } = await import('./Splash');
    mountSplash();

    expect(matchMedia).toHaveBeenCalledWith(
      '(orientation: portrait) and (max-width: 480px)',
    );
    expect(document.getElementById('st-splash')).toBeNull();
    expect(document.getElementById('st-splash-style')).toBeNull();
  });

  it('keeps the title splash when the initial viewport is not phone portrait', async () => {
    const matchMedia = vi.fn(() => ({ matches: false } as MediaQueryList));
    vi.stubGlobal('matchMedia', matchMedia);

    const { mountSplash } = await import('./Splash');
    mountSplash();

    expect(document.getElementById('st-splash')).not.toBeNull();
    expect(document.getElementById('st-splash-style')).not.toBeNull();
  });

  it('skips only the exact Last Stand return so the restored Campaigns page is immediately usable', async () => {
    const original = window.location.href;
    try {
      window.history.replaceState(null, '', '/#campaigns/last-stand');
      const { mountSplash } = await import('./Splash');
      mountSplash();
      expect(document.getElementById('st-splash')).toBeNull();

      window.history.replaceState(null, '', '/#campaigns/last-stand/extra');
      vi.resetModules();
      const nearMiss = await import('./Splash');
      nearMiss.mountSplash();
      expect(document.getElementById('st-splash')).not.toBeNull();
    } finally {
      window.history.replaceState(null, '', original);
    }
  });

  it('auto-mounts a fully-formed overlay on import, with style, art, title, prompt and hint', async () => {
    const { mountSplash } = await import('./Splash');
    // The module already auto-mounted on import above; calling mountSplash() again
    // here is the idempotent no-op path, exercised separately below.
    mountSplash();

    const overlay = document.getElementById('st-splash');
    expect(overlay).not.toBeNull();
    expect(overlay!.getAttribute('role')).toBe('button');
    expect(overlay!.getAttribute('tabindex')).toBe('0');
    expect(overlay!.getAttribute('aria-label')).toMatch(/singedTerra/);

    const frame = overlay!.querySelector('.st-splash__frame');
    expect(frame).not.toBeNull();

    const art = overlay!.querySelector('img.st-splash__art') as HTMLImageElement | null;
    expect(art).not.toBeNull();
    expect(art!.src).toContain('splash-hero.png');
    expect(art!.draggable).toBe(false);

    const title = overlay!.querySelector('.st-splash__title');
    expect(title?.textContent).toBe('singedTerra');

    const tagline = overlay!.querySelector('.st-splash__tagline');
    expect(tagline?.textContent).toBe('A LOVE LETTER TO SCORCHED EARTH - 1991');

    const prompt = overlay!.querySelector('.st-splash__prompt');
    expect(prompt?.textContent).toBe('> PRESS ANY KEY TO START');

    const hint = overlay!.querySelector('.st-splash__hint');
    expect(hint?.textContent).toBe('CLICK - TAP - SPACE');

    // Style injected exactly once into <head>.
    expect(document.querySelectorAll('#st-splash-style').length).toBe(1);
  });

  it('mountSplash() is idempotent while an overlay is already showing', async () => {
    const { mountSplash } = await import('./Splash');
    mountSplash();
    mountSplash();
    mountSplash();
    expect(document.querySelectorAll('#st-splash').length).toBe(1);
  });

  it('dismisses on click: fades immediately, then removes itself after the fade duration', async () => {
    vi.useFakeTimers();
    const { mountSplash } = await import('./Splash');
    mountSplash();
    const overlay = document.getElementById('st-splash')!;

    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(overlay.classList.contains('st-splash--out')).toBe(true);
    // Still in the DOM mid-fade: removal is deferred to the FADE_MS timeout.
    expect(document.getElementById('st-splash')).not.toBeNull();

    vi.advanceTimersByTime(420);
    expect(document.getElementById('st-splash')).toBeNull();
  });

  it('dismisses on any keydown (not just a click on the overlay itself)', async () => {
    vi.useFakeTimers();
    const { mountSplash } = await import('./Splash');
    mountSplash();
    const overlay = document.getElementById('st-splash')!;

    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(overlay.classList.contains('st-splash--out')).toBe(true);

    vi.advanceTimersByTime(420);
    expect(document.getElementById('st-splash')).toBeNull();
  });
});
