import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@shared/engine/GameEngine';
import type { GameState } from '@shared/types/GameState';
import { HUD } from './HUD';

// Frozen public-HUD fixtures; these projections do not claim an executed match.
const players = [
  { name: '<svg/onload=1>', color: '#e84d4d' },
  { name: 'A &amp; B', color: '#4d8ce8' },
  { name: 'aaaaaa<svg/onload=1>', color: '#4de87a' },
  { name: 'Cafe\u0301', color: '#e8c84d' },
];
const replacementPlayers = [
  { name: 'Ranger', color: '#e84d4d' },
  { name: 'Scout', color: '#4d8ce8' },
  { name: 'Delta', color: '#4de87a' },
  { name: 'Echo', color: '#e8c84d' },
];

// Literal oracles are independent of production sorting, rounding and escaping.
const singleCells = [
  'Player', 'Kills', 'Dmg',
  'aaaaaa<svg/onload=1>', '1', '131',
  'Cafe\u0301', '0', '88',
  '<svg/onload=1>', '1', '72',
  'A &amp; B', '1', '26',
];
const multiCells = [
  'Player', 'Wins', 'Kills', 'Dmg',
  'aaaaaa<svg/onload=1>', '3', '1', '131',
  'A &amp; B', '1', '1', '26',
  'Cafe\u0301', '0', '0', '88',
  '<svg/onload=1>', '0', '1', '72',
];
const roundCells = [
  'Player', 'Wins', 'Kills', 'Dmg',
  'aaaaaa<svg/onload=1>', '1', '1', '131',
  'A &amp; B', '1', '1', '26',
  'Cafe\u0301', '0', '0', '88',
  '<svg/onload=1>', '0', '1', '72',
];
const replacementCells = [
  'Player', 'Kills', 'Dmg',
  'Scout', '2', '65',
  'Echo', '1', '53',
  'Ranger', '0', '41',
  'Delta', '0', '19',
];
const head3 = ['st-hud__score-th', 'st-hud__score-th st-hud__score-num', 'st-hud__score-th st-hud__score-num'];
const head4 = ['st-hud__score-th', 'st-hud__score-th st-hud__score-num', 'st-hud__score-th st-hud__score-num', 'st-hud__score-th st-hud__score-num'];
const row3 = ['st-hud__score-name', 'st-hud__score-num', 'st-hud__score-num'];
const row4 = ['st-hud__score-name', 'st-hud__score-num', 'st-hud__score-num', 'st-hud__score-num'];
const winner3 = ['st-hud__score-name st-hud__score-cell--winner', 'st-hud__score-num st-hud__score-cell--winner', 'st-hud__score-num st-hud__score-cell--winner'];
const winner4 = ['st-hud__score-name st-hud__score-cell--winner', 'st-hud__score-num st-hud__score-cell--winner', 'st-hud__score-num st-hud__score-cell--winner', 'st-hud__score-num st-hud__score-cell--winner'];

type Mount = { fixture: HTMLElement; app: HTMLElement; portal: HTMLElement; hud: HUD };
const mounted: Mount[] = [];
let previousStyle: HTMLElement | null;

function mount(): Mount {
  const fixture = document.createElement('div');
  fixture.innerHTML = '<main id="app"><section id="stage"><div id="game-overlay"></div></section><aside id="hud"></aside><section id="lobby"><button type="button">Hot Seat</button></section></main><div id="modal-layer"></div>';
  document.body.append(fixture);
  const app = fixture.querySelector<HTMLElement>('#app')!;
  const root = app.querySelector<HTMLElement>('#hud')!;
  const overlay = app.querySelector<HTMLElement>('#game-overlay')!;
  const portal = fixture.querySelector<HTMLElement>('#modal-layer')!;
  const hud = new HUD(root, overlay, portal, overlay);
  const owned = { fixture, app, portal, hud };
  mounted.push(owned);
  expect(app.isConnected && portal.isConnected).toBe(true);
  return owned;
}

function hostileState(kind: 'single' | 'multi' | 'round'): GameState {
  const state = new GameEngine({ players, maxPlayers: 4, seed: 1, rounds: kind === 'single' ? 1 : 5, teamMode: false }).getState();
  expect(state.tanks.map((tank) => tank.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
  expect(players.map((player) => player.name.length)).toEqual([14, 9, 20, 5]);
  expect(players.every((player) => player.name !== '' && player.name.trim() === player.name)).toBe(true);
  expect(Array.from(players[3]!.name, (character) => character.codePointAt(0))).toEqual([67, 97, 102, 101, 769]);
  const wins = kind === 'single' ? [0, 0, 1, 0] : kind === 'multi' ? [0, 1, 3, 0] : [0, 1, 1, 0];
  Object.assign(state, {
    phase: kind === 'round' ? 'ROUND_OVER' : 'GAME_OVER',
    round: kind === 'single' ? 1 : kind === 'multi' ? 5 : 4,
    totalRounds: kind === 'single' ? 1 : 5,
    winner: kind === 'round' ? null : 'p3', winnerTeam: null,
    // ROUND_OVER stages four fresh living tanks after the third round's draw.
    lastRoundWinnerId: kind === 'round' ? null : 'p3', lastRoundWinnerTeam: null,
    activePlayerId: kind === 'round' ? 'p1' : 'p3',
  });
  state.tanks.forEach((tank, index) => Object.assign(tank, {
    playerName: players[index]!.name, ai: null, roundWins: wins[index]!,
    kills: [1, 1, 1, 0][index]!, totalDamage: [71.6, 26.4, 130.6, 88.2][index]!,
    alive: kind === 'round' || tank.id === 'p3',
    health: kind === 'round' || tank.id === 'p3' ? 100 : 0,
  }));
  return state;
}

function activeDialogs(owned: Mount): HTMLElement[] {
  return Array.from(owned.fixture.querySelectorAll<HTMLElement>('.st-hud__overlay[role="dialog"]'))
    .filter((dialog) => dialog.getAttribute('aria-hidden') === 'false'
      && !dialog.classList.contains('st-hud__overlay--hidden') && !dialog.hidden);
}

function activeReport(owned: Mount, titleId: 'st-victory-title' | 'st-round-over-title', title: string): HTMLElement {
  const dialogs = activeDialogs(owned);
  expect(dialogs).toHaveLength(1);
  const report = dialogs[0]!;
  expect(report.isConnected).toBe(true);
  expect(report.getAttribute('aria-labelledby')).toBe(titleId);
  expect(report.getAttribute('aria-modal')).toBe('true');
  expect(report.closest('[hidden], [aria-hidden="true"], [inert]')).toBeNull();
  expect(report.querySelector(`#${titleId}`)?.textContent).toBe(title);
  return report;
}

function reveal(owned: Mount, state: GameState): HTMLElement {
  owned.hud.update(state);
  owned.hud.notifyTerminalImpactComplete();
  vi.advanceTimersByTime(420);
  return activeReport(owned, 'st-victory-title', 'aaaaaa<svg/onload=1> wins');
}

function inlineHandlers(root: Element): string[] {
  return [root, ...root.querySelectorAll('*')].flatMap((element) =>
    Array.from(element.attributes).filter((attribute) => /^on/i.test(attribute.name))
      .map((attribute) => `${element.tagName}.${attribute.name}=${attribute.value}`));
}

function checkScore(owned: Mount, report: HTMLElement, texts: string[], classes: string[], columns: '3' | '4', count: 15 | 20): HTMLElement {
  const scores = Array.from(owned.fixture.querySelectorAll<HTMLElement>('.st-hud__score'))
    .filter((score) => score.childElementCount > 0);
  expect(scores).toHaveLength(1);
  const score = scores[0]!;
  expect(report.contains(score) && score.isConnected).toBe(true);
  const cells = Array.from(score.children);
  // Soft checks preserve independent text/node/handler failures under the same case.
  expect.soft(cells.map((cell) => cell.textContent), 'complete literal logical grid').toEqual(texts);
  expect.soft(cells.length, 'exact cell count').toBe(count);
  expect.soft(cells.map((cell) => cell.tagName), 'direct span cells').toEqual(Array(count).fill('SPAN'));
  expect.soft(cells.map((cell) => cell.className), 'header/name/numeric/winner classes').toEqual(classes);
  expect.soft(score.style.getPropertyValue('--score-cols'), 'column projection').toBe(columns);
  expect.soft((cells.length - Number(columns)) / Number(columns), 'four logical player rows').toBe(4);
  const names = columns === '3' ? [3, 6, 9, 12] : [4, 8, 12, 16];
  for (const index of names) {
    const cell = cells[index];
    expect.soft(cell?.textContent, `name cell ${index} exact literal text`).toBe(texts[index]);
    expect.soft(cell?.querySelectorAll('svg,script,iframe,img').length, `name cell ${index} injected nodes`).toBe(0);
    expect.soft(cell ? inlineHandlers(cell) : ['missing name cell'], `name cell ${index} inline handlers`).toEqual([]);
  }
  expect.soft(score.querySelectorAll('svg,script,iframe,img').length, 'scoreboard injected nodes').toBe(0);
  expect.soft(inlineHandlers(score), 'scoreboard inline handlers').toEqual([]);
  // This exact attack marker may not escape into either owned host. Normal HUD
  // icon SVGs outside the score remain permitted; this is not script-execution proof.
  for (const [label, host] of [['fixture', owned.app], ['portal', owned.portal]] as const) {
    expect.soft(host.querySelectorAll('svg[onload="1"]').length, `${label} escaped payload nodes`).toBe(0);
  }
  return score;
}

beforeEach(() => {
  previousStyle = document.getElementById('st-hud-style');
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn((media: string) => ({
    matches: false, media, onchange: null, addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
});

afterEach(async () => {
  try {
    await Promise.all(mounted.map(({ hud }) => hud.destroy()));
  } finally {
    mounted.splice(0).forEach(({ fixture }) => fixture.remove());
    if (previousStyle === null) document.getElementById('st-hud-style')?.remove();
    localStorage.clear();
    vi.clearAllTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});

describe('HUD scoreboard security', () => {
  it('single-round GAME_OVER 3 columns', () => {
    const owned = mount();
    const report = reveal(owned, hostileState('single'));
    checkScore(owned, report, singleCells, [...head3, ...winner3, ...row3, ...row3, ...row3], '3', 15);
  });

  it('multi-round GAME_OVER 4 columns', () => {
    const owned = mount();
    const report = reveal(owned, hostileState('multi'));
    checkScore(owned, report, multiCells, [...head4, ...winner4, ...row4, ...row4, ...row4], '4', 20);
  });

  it('reachable multi-round ROUND_OVER 4 columns', () => {
    const owned = mount();
    owned.hud.update(hostileState('round'));
    const report = activeReport(owned, 'st-round-over-title', 'Round 3 complete · 4/5');
    checkScore(owned, report, roundCells, [...head4, ...row4, ...row4, ...row4, ...row4], '4', 20);
  });

  it('same-HUD legal lifecycle replacement', () => {
    const owned = mount();
    const firstReport = reveal(owned, hostileState('single'));
    const firstScore = checkScore(owned, firstReport, singleCells, [...head3, ...winner3, ...row3, ...row3, ...row3], '3', 15);
    owned.hud.hideEndScreens();
    expect(activeDialogs(owned)).toHaveLength(0);
    vi.advanceTimersByTime(420);
    expect(activeDialogs(owned)).toHaveLength(0);

    const fresh = new GameEngine({ players: replacementPlayers, maxPlayers: 4, seed: 2, rounds: 1, teamMode: false }).getState();
    Object.assign(fresh, {
      phase: 'PLAYER_TURN', totalRounds: 1, round: 1, winner: null, winnerTeam: null,
      lastRoundWinnerId: null, lastRoundWinnerTeam: null, activePlayerId: 'p1',
    });
    fresh.tanks.forEach((tank, index) => Object.assign(tank, {
      playerName: replacementPlayers[index]!.name, ai: null,
      roundWins: 0, kills: 0, totalDamage: 0, alive: true, health: 100,
    }));
    owned.hud.update(fresh);
    expect(activeDialogs(owned)).toHaveLength(0);
    const replacementStats = [
      { id: 'p1', playerName: 'Ranger', roundWins: 0, kills: 0, totalDamage: 41.2, alive: false, health: 0 },
      { id: 'p2', playerName: 'Scout', roundWins: 1, kills: 2, totalDamage: 64.8, alive: true, health: 100 },
      { id: 'p3', playerName: 'Delta', roundWins: 0, kills: 0, totalDamage: 19.4, alive: false, health: 0 },
      { id: 'p4', playerName: 'Echo', roundWins: 0, kills: 1, totalDamage: 52.6, alive: false, health: 0 },
    ];
    const terminal: GameState = {
      ...fresh, phase: 'GAME_OVER', totalRounds: 1, round: 1,
      winner: 'p2', winnerTeam: null, lastRoundWinnerId: 'p2', lastRoundWinnerTeam: null,
      activePlayerId: 'p2', tanks: fresh.tanks.map((tank, index) => ({ ...tank, ...replacementStats[index]! })),
    };
    owned.hud.update(terminal);
    owned.hud.notifyTerminalImpactComplete();
    vi.advanceTimersByTime(420);
    const report = activeReport(owned, 'st-victory-title', 'Scout wins');
    expect(report).toBe(firstReport);
    const score = checkScore(owned, report, replacementCells, [...head3, ...winner3, ...row3, ...row3, ...row3], '3', 15);
    expect(score).toBe(firstScore);
    const cells = Array.from(score.children);
    const names = [3, 6, 9, 12].map((index) => cells[index]?.textContent);
    const damage = [5, 8, 11, 14].map((index) => cells[index]?.textContent);
    for (const obsolete of ['<svg/onload=1>', 'A &amp; B', 'aaaaaa<svg/onload=1>', 'Cafe\u0301']) {
      expect.soft(names, `obsolete name ${obsolete}`).not.toContain(obsolete);
    }
    for (const obsolete of ['72', '26', '131', '88']) {
      expect.soft(damage, `obsolete damage ${obsolete}`).not.toContain(obsolete);
    }
    expect.soft(cells.map((cell) => cell.textContent)).not.toContain('Wins');
  });
});
