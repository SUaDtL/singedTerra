import type { QuickOperation } from '../../client/quickOperations';
import { QUICK_DUEL_DEFAULT_ROUNDS } from '../../client/quickDuelLaunch';

export interface SkirmishBriefingNote {
  readonly title: string;
  readonly body: string;
}

/**
 * Presentation-only explanations of existing settings. Conditions, not preset
 * IDs, select the copy so a new preset can reuse it. This does not compose a
 * launch, generate a seed or replace the authored field-order evaluator.
 */
export function skirmishBriefingNotes(operation: QuickOperation): readonly SkirmishBriefingNote[] {
  const settings = operation.settings;
  const rounds = settings.rounds ?? QUICK_DUEL_DEFAULT_ROUNDS;
  const notes: SkirmishBriefingNote[] = [{
    title: rounds === 1 ? 'Single-round duel' : `Best of ${rounds} rounds`,
    body: rounds === 1
      ? 'Eliminate the opposing tank to win the duel. There is no next round to save ammunition for.'
      : 'Eliminate the opposing tank to take a round. Credits and unused ammunition carry into the next round; hull and terrain reset.',
  }];
  if (settings.walls === 'wrap') notes.push({
    title: 'The edge is another route',
    body: 'A shell leaving one side enters at the opposite edge. Consider both firing directions when the direct arc is awkward.',
  });
  else if (settings.walls === 'reflective') notes.push({
    title: 'Bank shots off the walls',
    body: 'Sidewalls reflect the shell back into the arena. A direct shot is not the only path to the opponent.',
  });
  else if (settings.walls === 'concrete') notes.push({
    title: 'Solid arena boundaries',
    body: 'A shell striking a concrete sidewall detonates there. Allow clearance for the complete flight path.',
  });
  else notes.push({
    title: 'Read the firing line',
    body: 'Side edges are open: shells that leave the arena are lost. Check wind and elevation before committing a special round.',
  });
  if (settings.hazards === 'lava') notes.push({
    title: 'Position matters',
    body: 'Lava is solid to shells but dangerous to tanks. Craters and collapsing ground can change where it is safe to stand.',
  });
  if (settings.armsLevel !== undefined && settings.armsLevel < 4) notes.push({
    title: `Level ${settings.armsLevel} restocks`,
    body: `The shop only sells equipment up to arms level ${settings.armsLevel}. This does not remove your opening kit. Preserve the special rounds you cannot replace.`,
  });
  if ((settings.suddenDeathTurn ?? 0) > 0) notes.push({
    title: 'The firing solution will change',
    body: `After turn ${settings.suddenDeathTurn} in each round, gravity increases. Recheck the arc rather than repeating an earlier shot unchanged.`,
  });
  if (notes.length === 2) notes.push({
    title: 'Choose damage or ground control',
    body: 'A wider crater can undermine a position; a smaller shell preserves more ground. Use the free Baby Missile for ranging; spend special ammunition deliberately.',
  });
  return notes;
}
