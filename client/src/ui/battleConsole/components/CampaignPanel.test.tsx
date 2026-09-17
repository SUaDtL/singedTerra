// @vitest-environment jsdom

import { fireEvent, getByRole, getByText, queryByRole, waitFor } from '@testing-library/dom';
import { render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CampaignBattleConsolePresentation } from '../types';
import { CampaignPanel } from './CampaignPanel';

const campaign: CampaignBattleConsolePresentation = {
  commitmentCount: 3,
  supplies: 4,
  retryable: false,
  objects: [],
  result: { outcome: 'success', reason: 'objective', commitmentId: 3 },
  checkpoint: {
    encounterId: 'fuel-stop',
    story: {
      id: 'fuel-stop-secured', title: 'Fuel Stop Secured',
      body: 'The refinery is still standing.',
    },
    selectedRouteId: null,
    routeRequired: true,
    decisionPending: true,
    decisionApplied: false,
    finalEncounter: false,
    hull: 72,
    emergencyPatchAvailable: false,
    ammunition: [
      { weaponId: 'baby_missile', quantity: null, maximum: null },
      { weaponId: 'missile', quantity: 1, maximum: 3 },
      { weaponId: 'cluster_bomb', quantity: 2, maximum: 2 },
      { weaponId: 'shield', quantity: 1, maximum: 1 },
    ],
  },
};

afterEach(() => { document.body.innerHTML = ''; });

describe('CampaignPanel', () => {
  it('emits typed route and checkpoint choices and keeps full carried-kit facts visible', () => {
    const host = document.createElement('div');
    const dispatch = vi.fn();
    render(<CampaignPanel campaign={campaign} dispatch={dispatch} />, host);
    expect(getByRole(host, 'dialog', { name: 'Campaign checkpoint' })).toBeTruthy();
    expect(getByRole(host, 'list', { name: 'Carried kit' }).textContent)
      .toContain('missile · 1 / 3');
    fireEvent.click(getByRole(host, 'button', { name: 'Enter Salvage Pit' }));
    fireEvent.click(getByRole(host, 'button', { name: 'Refill missile · 1' }));
    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: 'campaign-route-select', routeId: 'salvage-pit-route',
    });
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: 'campaign-checkpoint-choice', choice: { kind: 'refill', weaponId: 'missile' },
    });
    expect((getByRole(host, 'button', {
      name: 'Refill cluster bomb · 1',
    }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('lets narrative be skipped and restores prior focus after the safe panel closes', async () => {
    const before = document.createElement('button');
    before.textContent = 'Battle control';
    document.body.append(before);
    before.focus();
    const host = document.createElement('div');
    document.body.append(host);
    const dispatch = vi.fn();
    render(<CampaignPanel campaign={campaign} dispatch={dispatch} />, host);
    const skip = getByRole(host, 'button', { name: 'Skip story' });
    await waitFor(() => { expect(document.activeElement).toBe(skip); });
    fireEvent.click(skip);
    await waitFor(() => {
      expect(queryByRole(host, 'button', { name: 'Skip story' })).toBeNull();
      expect(document.activeElement).toBe(getByRole(host, 'button', { name: 'Take High Road' }));
    });
    render(<CampaignPanel campaign={{
      ...campaign,
      checkpoint: {
        ...campaign.checkpoint!, encounterId: 'high-road',
        story: { id: 'high-road-cleared', title: 'High Road Cleared', body: 'The pump survived.' },
      },
    }} dispatch={dispatch} />, host);
    await waitFor(() => {
      expect(getByRole(host, 'button', { name: 'Skip story' })).toBeTruthy();
    });
    render(<CampaignPanel campaign={{ ...campaign, checkpoint: null }} dispatch={dispatch} />, host);
    await waitFor(() => { expect(document.activeElement).toBe(before); });
  });

  it('traps keyboard traversal and exposes the free emergency hull recovery', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const dispatch = vi.fn();
    render(<CampaignPanel campaign={{
      ...campaign,
      checkpoint: { ...campaign.checkpoint!, hull: 42, emergencyPatchAvailable: true },
    }} dispatch={dispatch} />, host);
    const dialog = getByRole(host, 'dialog', { name: 'Campaign checkpoint' });
    const controls = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const first = controls[0]!;
    const last = controls.at(-1)!;
    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.click(getByRole(host, 'button', {
      name: 'Apply emergency hull patch · free · restore to 60',
    }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'campaign-emergency-patch' });
  });

  it('continues only after route and service decisions and labels the finale complete', () => {
    const host = document.createElement('div');
    const dispatch = vi.fn();
    render(<CampaignPanel campaign={{
      ...campaign,
      checkpoint: {
        ...campaign.checkpoint!, selectedRouteId: 'high-road-route', routeRequired: false,
        decisionPending: false, decisionApplied: true,
      },
    }} dispatch={dispatch} />, host);
    fireEvent.click(getByRole(host, 'button', { name: 'Continue Ash Road' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'campaign-continue' });

    render(<CampaignPanel campaign={{
      ...campaign,
      checkpoint: { ...campaign.checkpoint!, encounterId: 'relay-ridge', finalEncounter: true },
    }} dispatch={dispatch} />, host);
    expect(getByText(host, 'Chapter complete')).toBeTruthy();
    expect(queryByRole(host, 'button', { name: 'Continue Ash Road' })).toBeNull();
  });
});
