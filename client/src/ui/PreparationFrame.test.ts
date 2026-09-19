import { describe, expect, it, vi } from 'vitest';
import {
  createPreparationFrame,
  createPreparationPrimaryAction,
  updatePreparationPrimaryAction,
} from './PreparationFrame';

describe('shared preparation frame', () => {
  it('owns one heading, body viewport, and in-flow action dock', () => {
    const body = document.createElement('section');
    body.dataset.modeContent = 'local';
    const secondary = document.createElement('button');
    secondary.textContent = 'Alternative route';
    const primary = document.createElement('button');
    primary.textContent = 'Deploy local battle';

    const frame = createPreparationFrame(document, {
      eyebrow: 'Local operation',
      title: 'Crew preparation',
      description: 'Configure the crew and confirm the rules.',
      body,
      dockLabel: 'Deployment',
      dockStatus: '2 players · Shared screen',
      primaryAction: primary,
      secondaryActions: secondary,
    });

    expect(frame.dataset.preparationFrame).toBe('');
    expect(frame.querySelector(':scope > .preparation-frame__heading h2')?.textContent)
      .toBe('Crew preparation');
    expect(frame.querySelector(':scope > .preparation-frame__body')?.contains(body)).toBe(true);
    const dock = frame.querySelector<HTMLElement>(':scope > .preparation-frame__dock');
    expect(dock?.querySelector('.preparation-frame__dock-label')?.textContent).toBe('Deployment');
    expect(dock?.querySelector('.preparation-frame__dock-status')?.textContent)
      .toBe('2 players · Shared screen');
    expect(dock?.contains(primary)).toBe(true);
    expect(dock?.contains(secondary)).toBe(true);
    expect(primary.matches('[data-preparation-primary].preparation-frame__primary-action')).toBe(true);
  });

  it('renders and updates the one truthful primary action without outliving its owner', () => {
    const controller = new AbortController();
    const onActivate = vi.fn();
    const primary = createPreparationPrimaryAction(document, {
      label: 'Create operation',
      onActivate,
      listenerSignal: controller.signal,
    });

    primary.click();
    expect(onActivate).toHaveBeenCalledOnce();

    updatePreparationPrimaryAction(primary, {
      label: 'Creating…',
      disabled: true,
      busy: true,
    });
    expect(primary.textContent).toBe('Creating…');
    expect(primary.disabled).toBe(true);
    expect(primary.getAttribute('aria-busy')).toBe('true');

    updatePreparationPrimaryAction(primary, { label: 'Create operation', disabled: false });
    controller.abort();
    primary.click();
    expect(onActivate).toHaveBeenCalledOnce();
  });
});
