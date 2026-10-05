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
    view.focusDefault();
    expect(document.activeElement).toBe(launch);
    view.update({});
    view.dispose();
    expect(host.childElementCount).toBe(0);
    host.remove();
  });
});
