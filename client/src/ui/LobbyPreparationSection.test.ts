import { describe, expect, it } from 'vitest';
import { buildLobbyPreparationSection } from './LobbyPreparationSection';

describe('buildLobbyPreparationSection', () => {
  it('keeps supplied route controls in one named accessible command frame', () => {
    const playerField = document.createElement('div');
    playerField.textContent = 'Players';

    const section = buildLobbyPreparationSection({
      id: 'crew-manifest',
      title: 'Crew manifest',
      description: 'Assign the battery before deployment.',
      children: [playerField],
    });

    expect(section.tagName).toBe('SECTION');
    expect(section.getAttribute('aria-labelledby')).toBe('crew-manifest-heading');
    expect(section.querySelector('.lobby-preparation-section__title')?.textContent)
      .toBe('Crew manifest');
    expect(section.querySelector('.lobby-preparation-section__purpose')?.textContent)
      .toBe('Assign the battery before deployment.');
    expect(section.querySelector('.lobby-preparation-section__body')?.firstElementChild)
      .toBe(playerField);
  });
});
