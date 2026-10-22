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
  it('discloses unfinished-run loss before launch', () => {
    const host = document.createElement('div');
    const view = createLastStandCommandView(host);
    const disclosure = host.querySelector<HTMLElement>('[data-last-stand-loss-disclosure]')!;
    expect(disclosure?.textContent).toContain('Leaving or reloading an unfinished run loses its progress without a reward.');
    expect(disclosure?.textContent).toContain('Saved upgrades and pending defeat rewards stay in this browser only after a successful save.');
    expect(disclosure?.hidden).toBe(false);
    expect(host.querySelector('a')?.getAttribute('aria-describedby')).toBe(disclosure?.id);
    expect(host.textContent).not.toContain('Stored locally on this device');
    view.dispose();
  });
});
