import { describe, expect, it } from 'vitest';
import { createLastStandCommandView } from './LastStandCommandView';

describe('Last Stand campaign entry', () => {
  it('offers a real base-aware launch link and releases its view on selection change', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const view = createLastStandCommandView(host);
    const launch = host.querySelector<HTMLAnchorElement>('[data-command-action="launch-last-stand"]')!;

    expect(launch.getAttribute('href')).toBe(`${import.meta.env.BASE_URL}last-stand/`);
    expect(launch.textContent).toBe('Launch Last Stand');
    expect(launch.hasAttribute('data-command-primary')).toBe(true);
    expect(launch.hasAttribute('data-preparation-primary')).toBe(true);
    view.focusDefault();
    expect(document.activeElement).toBe(launch);
    view.update({});
    view.dispose();
    expect(host.childElementCount).toBe(0);
    host.remove();
  });
});

describe('LastStandCommandView', () => {
  it('explains checkpoint rollback, paused resume and local-only saves before launch', () => {
    const host = document.createElement('div');
    const view = createLastStandCommandView(host);
    const disclosure = host.querySelector<HTMLElement>('[data-last-stand-loss-disclosure]')!;
    expect(disclosure?.textContent).toContain('last confirmed wave checkpoint and banked rewards');
    expect(disclosure?.textContent).toContain('Resume starts paused');
    expect(disclosure?.textContent).toContain('upgrades and spending roll back together');
    expect(disclosure?.textContent).toContain('do not sync with your account');
    expect(disclosure?.hidden).toBe(false);
    expect(host.querySelector('a')?.getAttribute('aria-describedby')).toBe(disclosure?.id);
    expect(host.textContent).not.toContain('Stored locally on this device');
    view.dispose();
  });
  it.each([4, 5, 6])('offers a read-only version %i checkpoint hint and never changes save bytes', (version) => {
    const key='singedTerra.lastStand.prototype.v1';
    const raw=JSON.stringify({version,checkpoint:{runId:7,encounter:{tier:2,completedWave:300}}});
    localStorage.setItem(key,raw);
    try {
      const host=document.createElement('div'),view=createLastStandCommandView(host);
      expect(host.querySelector('a')?.textContent).toBe('Resume Tier 2 · Wave 301');
      expect(localStorage.getItem(key)).toBe(raw);
      localStorage.setItem(key,'invalid');view.update({});
      expect(host.querySelector('a')?.textContent).toBe('Launch Last Stand');
      expect(localStorage.getItem(key)).toBe('invalid');view.dispose();
    } finally { localStorage.removeItem(key); }
  });
  it.each([3, 7, '6', null])('does not interpret unsupported save version %s', (version) => {
    const key = 'singedTerra.lastStand.prototype.v1';
    const raw = JSON.stringify({ version, checkpoint: { runId: 7, encounter: { tier: 2, completedWave: 300 } } });
    localStorage.setItem(key, raw);
    try {
      const host = document.createElement('div');
      const view = createLastStandCommandView(host);
      expect(host.querySelector('a')?.textContent).toBe('Launch Last Stand');
      expect(localStorage.getItem(key)).toBe(raw);
      view.dispose();
    } finally { localStorage.removeItem(key); }
  });
});
