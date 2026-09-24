import { describe, expect, it } from 'vitest';
import { QUICK_OPERATIONS, type QuickOperation } from '../../client/quickOperations';
import { skirmishBriefingNotes } from './SkirmishBriefing';

function configured(settings: QuickOperation['settings']): QuickOperation {
  return { ...QUICK_OPERATIONS[0]!, settings };
}

describe('Skirmish briefing presentation', () => {
  it.each(QUICK_OPERATIONS)('explains $title without changing its launch settings', (operation) => {
    const before = structuredClone(operation);
    const notes = skirmishBriefingNotes(operation);
    expect(notes.length).toBeGreaterThanOrEqual(3);
    expect(notes.every((note) => note.title.length > 0 && note.body.length > 0)).toBe(true);
    expect(skirmishBriefingNotes(operation)).toEqual(notes);
    expect(operation).toEqual(before);
  });

  it('uses the shared default rounds and does not promise carryover in a single round', () => {
    expect(skirmishBriefingNotes(configured({}))[0]?.title).toBe('Best of 3 rounds');
    expect(skirmishBriefingNotes(configured({ rounds: 1 }))[0]?.body).toContain('no next round');
    expect(skirmishBriefingNotes(configured({ rounds: 5 }))[0]?.title).toBe('Best of 5 rounds');
    expect(skirmishBriefingNotes(configured({}))[0]?.body).toContain('unused ammunition carry');
  });

  it.each([
    [undefined, 'Side edges are open'], ['open', 'Side edges are open'],
    ['wrap', 'opposite edge'], ['reflective', 'reflect the shell'], ['concrete', 'detonates there'],
  ] as const)('describes %s walls from settings, not the operation ID', (walls, fragment) => {
    expect(skirmishBriefingNotes(configured({ walls }))[1]?.body).toContain(fragment);
  });

  it('separates an illustrative world from a mechanical hazard', () => {
    const decorative = skirmishBriefingNotes(configured({ battlefieldWorld: 'obsidian-caldera' }));
    expect(decorative.some((note) => note.body.includes('Lava'))).toBe(false);
    expect(skirmishBriefingNotes(configured({ hazards: 'lava' })).some((note) => note.body.includes('Lava'))).toBe(true);
  });

  it('explains purchase restrictions without removing the opening kit', () => {
    const restricted = skirmishBriefingNotes(configured({ armsLevel: 0 }));
    expect(restricted.find((note) => note.title === 'Level 0 restocks')?.body).toContain('does not remove your opening kit');
    expect(skirmishBriefingNotes(configured({ armsLevel: 4 })).some((note) => note.title.includes('restocks'))).toBe(false);
  });

  it('reports configured sudden death, not an invented difficulty or reward', () => {
    const active = skirmishBriefingNotes(configured({ suddenDeathTurn: 12 }));
    expect(active.find((note) => note.title === 'The firing solution will change')?.body).toContain('After turn 12 in each round');
    expect(skirmishBriefingNotes(configured({ suddenDeathTurn: 0 })).some((note) => note.body.includes('gravity increases'))).toBe(false);
    expect(JSON.stringify(active)).not.toMatch(/XP|reward|seed 42|rating/);
  });
});
