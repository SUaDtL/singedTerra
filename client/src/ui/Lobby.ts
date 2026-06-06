/** Play mode chosen in the lobby. */
export type GameMode = 'hotseat' | 'network';

/** A single player entry chosen in the lobby (name + unique color). */
export interface LobbyPlayer {
  name: string;
  color: string;
}

/**
 * Optional advanced engine settings chosen in the lobby. Each field is omitted
 * (undefined) when the user leaves it at default/blank, so the engine's own
 * defaults apply. Consumed by main.ts and forwarded to GameEngine.
 */
export interface LobbySettings {
  /** Wind cap, 0..10 (engine default 10). */
  maxWind?: number;
  /** Gravity in px/tick, ~0.05..0.40 (engine default 0.15). */
  gravity?: number;
  /** Terrain seed; blank => engine's reproducible default. */
  seed?: number;
}

/** Configuration produced by the lobby once the player(s) are ready. */
export interface LobbyConfig {
  mode: GameMode;
  /** Chosen players (2-4) with unique colors. Consumed by main.ts. */
  players: LobbyPlayer[];
  /** Convenience list of names, kept for compatibility. */
  playerNames: string[];
  /** Room code for network mode (4-char alphanumeric), if applicable. */
  roomCode?: string;
  /** Optional advanced engine settings; only set fields are present. */
  settings?: LobbySettings;
}

/** Fixed color palette; each player must pick a unique entry. */
const PALETTE: ReadonlyArray<{ name: string; value: string }> = [
  { name: 'Red', value: '#e84d4d' },
  { name: 'Blue', value: '#4d8ce8' },
  { name: 'Green', value: '#4de87a' },
  { name: 'Yellow', value: '#e8c84d' },
];

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const STYLE_ID = 'lobby-style';

// Advanced-settings bounds + engine defaults (shown as placeholders so the user
// sees the default without us actually sending it — blank/default => omitted).
const WIND_MIN = 0;
const WIND_MAX = 10;
const WIND_DEFAULT = 10;
const GRAVITY_MIN = 0.05;
const GRAVITY_MAX = 0.4;
const GRAVITY_STEP = 0.01;
const GRAVITY_DEFAULT = 0.15;

/** Raw (string) working state for the advanced-settings inputs. */
interface SettingsState {
  maxWind: string;
  gravity: string;
  seed: string;
}

/** A working row of player config state in the setup UI. */
interface PlayerRowState {
  name: string;
  color: string;
}

/**
 * Lobby is the pre-game DOM overlay (SPEC §3): pick the number of players,
 * enter names, and choose a unique color per player from a fixed palette.
 * Calls onReady with the resulting hot-seat config when the player starts.
 */
export class Lobby {
  private readonly root: HTMLElement;
  private readonly onReady: (config: LobbyConfig) => void;

  /** Working state for the player rows (defaults Player 1..N + palette order). */
  private players: PlayerRowState[] = [];

  /** Raw working state for the advanced-settings inputs (blank = use default). */
  private settings: SettingsState = { maxWind: '', gravity: '', seed: '' };

  /** Whether the advanced-settings <details> is open (persist across renders). */
  private settingsOpen = false;

  constructor(root: HTMLElement, onReady: (config: LobbyConfig) => void) {
    this.root = root;
    this.onReady = onReady;
    this.players = [defaultRow(0), defaultRow(1)];
  }

  /**
   * Render the hot-seat setup overlay: choose 2-4 players, name each, and pick
   * a unique color. A Start button validates and hands a config to onReady.
   */
  show(): void {
    this.injectStyle();
    this.render();
    this.root.hidden = false;
  }

  /** Hide the lobby overlay (e.g. once the game starts). */
  hide(): void {
    this.root.replaceChildren();
    this.root.hidden = true;
  }

  /** Inject the lobby's scoped <style> once (do NOT edit index.html). */
  private injectStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #lobby .lobby-card {
        max-width: 460px;
        margin: 0 auto;
        padding: 24px 28px;
        background: rgba(18, 22, 30, 0.92);
        border: 1px solid #2c3442;
        border-radius: 10px;
        color: #e6e9ef;
        font-family: system-ui, sans-serif;
      }
      #lobby h1 { margin: 0 0 4px; font-size: 28px; letter-spacing: 0.5px; }
      #lobby .lobby-sub { margin: 0 0 18px; color: #9aa3b2; font-size: 13px; }
      #lobby .lobby-field { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
      #lobby .lobby-field > label { width: 92px; color: #9aa3b2; font-size: 13px; }
      #lobby select, #lobby input[type="text"] {
        background: #11151c; color: #e6e9ef; border: 1px solid #2c3442;
        border-radius: 6px; padding: 6px 8px; font-size: 14px;
      }
      #lobby .lobby-rows { display: flex; flex-direction: column; gap: 10px; margin: 8px 0 18px; }
      #lobby .lobby-row { display: flex; align-items: center; gap: 10px; }
      #lobby .lobby-row .lobby-name { flex: 1; }
      #lobby .lobby-row input[type="text"] { width: 100%; box-sizing: border-box; }
      #lobby .lobby-swatches { display: flex; gap: 6px; }
      #lobby .lobby-swatch {
        width: 24px; height: 24px; border-radius: 50%; cursor: pointer;
        border: 2px solid transparent; padding: 0; background-clip: padding-box;
      }
      #lobby .lobby-swatch.selected { border-color: #ffffff; }
      #lobby .lobby-swatch.taken { opacity: 0.3; cursor: not-allowed; }
      #lobby .lobby-error { color: #e84d4d; font-size: 13px; min-height: 18px; margin-bottom: 10px; }
      #lobby .lobby-start {
        width: 100%; padding: 10px; font-size: 15px; font-weight: 600; cursor: pointer;
        background: #4d8ce8; color: #fff; border: none; border-radius: 6px;
      }
      #lobby .lobby-start:disabled { background: #3a4250; cursor: not-allowed; }
      #lobby .lobby-advanced { margin: 0 0 16px; border-top: 1px solid #2c3442; padding-top: 12px; }
      #lobby .lobby-advanced > summary {
        cursor: pointer; color: #9aa3b2; font-size: 13px; list-style: none;
        user-select: none; margin-bottom: 4px;
      }
      #lobby .lobby-advanced > summary::-webkit-details-marker { display: none; }
      #lobby .lobby-advanced > summary::before { content: '▸ '; }
      #lobby .lobby-advanced[open] > summary::before { content: '▾ '; }
      #lobby .lobby-advanced .lobby-field > label { width: 110px; }
      #lobby .lobby-advanced input[type="number"] {
        background: #11151c; color: #e6e9ef; border: 1px solid #2c3442;
        border-radius: 6px; padding: 6px 8px; font-size: 14px; width: 110px;
      }
      #lobby .lobby-advanced .lobby-hint { color: #6b7280; font-size: 12px; margin-left: 8px; }
    `;
    document.head.append(style);
  }

  /** Re-render the lobby card from current working state. */
  private render(): void {
    this.root.replaceChildren();

    const card = document.createElement('div');
    card.className = 'lobby-card';

    const title = document.createElement('h1');
    title.textContent = 'singedTerra';
    const sub = document.createElement('p');
    sub.className = 'lobby-sub';
    sub.textContent = 'Hot-seat setup — choose 2-4 players, name them, pick a color.';
    card.append(title, sub);

    // Player count selector.
    const countField = document.createElement('div');
    countField.className = 'lobby-field';
    const countLabel = document.createElement('label');
    countLabel.textContent = 'Players';
    const countSelect = document.createElement('select');
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n += 1) {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = String(n);
      if (n === this.players.length) opt.selected = true;
      countSelect.append(opt);
    }
    countSelect.addEventListener('change', () => {
      this.setPlayerCount(Number(countSelect.value));
    });
    countField.append(countLabel, countSelect);
    card.append(countField);

    // Per-player rows.
    const rows = document.createElement('div');
    rows.className = 'lobby-rows';
    this.players.forEach((_, i) => rows.append(this.renderRow(i)));
    card.append(rows);

    // Advanced (engine) settings.
    card.append(this.renderAdvanced());

    // Validation error message.
    const error = document.createElement('div');
    error.className = 'lobby-error';
    error.textContent = this.validationError() ?? '';
    card.append(error);

    // Start button.
    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'lobby-start';
    start.textContent = 'Start Game';
    start.disabled = this.validationError() !== null;
    start.addEventListener('click', () => {
      if (this.validationError() !== null) return;
      const players = this.players.map((p) => ({ name: p.name.trim(), color: p.color }));
      const settings = this.parseSettings();
      this.onReady({
        mode: 'hotseat',
        players,
        playerNames: players.map((p) => p.name),
        ...(settings ? { settings } : {}),
      });
    });
    card.append(start);

    this.root.append(card);
  }

  /** Render one player's row (name input + color swatches). */
  private renderRow(index: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'lobby-row';

    const name = document.createElement('input');
    name.type = 'text';
    name.className = 'lobby-name';
    name.value = this.players[index].name;
    name.maxLength = 16;
    name.placeholder = `Player ${index + 1}`;
    name.addEventListener('input', () => {
      this.players[index].name = name.value;
      this.refreshStartState();
    });

    const swatches = document.createElement('div');
    swatches.className = 'lobby-swatches';
    for (const color of PALETTE) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'lobby-swatch';
      swatch.style.background = color.value;
      swatch.title = color.name;
      const takenByOther = this.players.some(
        (p, i) => i !== index && p.color === color.value,
      );
      if (this.players[index].color === color.value) swatch.classList.add('selected');
      if (takenByOther) swatch.classList.add('taken');
      swatch.addEventListener('click', () => {
        if (takenByOther) return;
        this.players[index].color = color.value;
        this.render();
      });
      swatches.append(swatch);
    }

    row.append(name, swatches);
    return row;
  }

  /**
   * Render the collapsible "Advanced settings" section: wind cap, gravity, and
   * seed. Each input stays blank (placeholder shows the engine default) unless
   * the user types a value; blank fields are omitted from the emitted config so
   * the engine default applies.
   */
  private renderAdvanced(): HTMLElement {
    const details = document.createElement('details');
    details.className = 'lobby-advanced';
    details.open = this.settingsOpen;
    details.addEventListener('toggle', () => {
      this.settingsOpen = details.open;
    });

    const summary = document.createElement('summary');
    summary.textContent = 'Advanced settings';
    details.append(summary);

    details.append(
      this.numberField('Wind cap', 'maxWind', {
        min: WIND_MIN,
        max: WIND_MAX,
        step: 1,
        placeholder: String(WIND_DEFAULT),
        hint: `${WIND_MIN}–${WIND_MAX}`,
      }),
      this.numberField('Gravity', 'gravity', {
        min: GRAVITY_MIN,
        max: GRAVITY_MAX,
        step: GRAVITY_STEP,
        placeholder: String(GRAVITY_DEFAULT),
        hint: `${GRAVITY_MIN}–${GRAVITY_MAX}`,
      }),
      this.numberField('Seed', 'seed', {
        step: 1,
        placeholder: 'default',
        hint: 'integer, blank = default',
      }),
    );

    return details;
  }

  /** Build one labelled number input bound to a SettingsState key. */
  private numberField(
    label: string,
    key: keyof SettingsState,
    opts: { min?: number; max?: number; step?: number; placeholder: string; hint: string },
  ): HTMLElement {
    const field = document.createElement('div');
    field.className = 'lobby-field';

    const lab = document.createElement('label');
    lab.textContent = label;

    const input = document.createElement('input');
    input.type = 'number';
    if (opts.min !== undefined) input.min = String(opts.min);
    if (opts.max !== undefined) input.max = String(opts.max);
    if (opts.step !== undefined) input.step = String(opts.step);
    input.placeholder = opts.placeholder;
    input.value = this.settings[key];
    input.addEventListener('input', () => {
      this.settings[key] = input.value;
    });

    const hint = document.createElement('span');
    hint.className = 'lobby-hint';
    hint.textContent = opts.hint;

    field.append(lab, input, hint);
    return field;
  }

  /**
   * Parse the raw settings inputs into a LobbySettings, omitting blank/invalid
   * fields (so engine defaults hold). Returns undefined if nothing is set.
   */
  private parseSettings(): LobbySettings | undefined {
    const out: LobbySettings = {};

    const maxWind = parseNumber(this.settings.maxWind);
    if (maxWind !== undefined) {
      out.maxWind = clamp(maxWind, WIND_MIN, WIND_MAX);
    }

    const gravity = parseNumber(this.settings.gravity);
    if (gravity !== undefined) {
      out.gravity = clamp(gravity, GRAVITY_MIN, GRAVITY_MAX);
    }

    const seed = parseNumber(this.settings.seed);
    if (seed !== undefined) {
      out.seed = Math.trunc(seed);
    }

    return Object.keys(out).length > 0 ? out : undefined;
  }

  /** Grow/shrink the working player list, assigning unique default colors. */
  private setPlayerCount(count: number): void {
    const next = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, count));
    if (next > this.players.length) {
      for (let i = this.players.length; i < next; i += 1) {
        this.players.push({
          name: this.players[i]?.name ?? `Player ${i + 1}`,
          color: this.firstFreeColor(),
        });
      }
    } else {
      this.players.length = next;
    }
    this.render();
  }

  /** First palette color not already used by an existing row. */
  private firstFreeColor(): string {
    const used = new Set(this.players.map((p) => p.color));
    const free = PALETTE.find((c) => !used.has(c.value));
    return (free ?? PALETTE[0]).value;
  }

  /** Lightweight refresh of the Start button + error without full re-render. */
  private refreshStartState(): void {
    const error = this.root.querySelector<HTMLElement>('.lobby-error');
    const start = this.root.querySelector<HTMLButtonElement>('.lobby-start');
    const msg = this.validationError();
    if (error) error.textContent = msg ?? '';
    if (start) start.disabled = msg !== null;
  }

  /** Return a validation error message, or null if the config is valid. */
  private validationError(): string | null {
    if (this.players.length < MIN_PLAYERS || this.players.length > MAX_PLAYERS) {
      return `Choose ${MIN_PLAYERS}-${MAX_PLAYERS} players.`;
    }
    if (this.players.some((p) => p.name.trim().length === 0)) {
      return 'Every player needs a name.';
    }
    const colors = this.players.map((p) => p.color);
    if (new Set(colors).size !== colors.length) {
      return 'Each player must pick a unique color.';
    }
    return null;
  }
}

/** Default row for slot `i`: "Player i+1" + the i-th palette color. */
function defaultRow(i: number): PlayerRowState {
  return {
    name: `Player ${i + 1}`,
    color: PALETTE[i % PALETTE.length].value,
  };
}

/** Parse a trimmed numeric string; undefined for blank or non-finite input. */
function parseNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/** Clamp `n` to the inclusive [lo, hi] range. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
