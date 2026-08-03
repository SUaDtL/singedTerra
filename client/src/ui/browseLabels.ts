// Pure display-label mappers for the public room-browser rows. NO DOM imports — kept
// dependency-free so a node/tsx harness (scripts/checks/browselabels.mjs) can import and
// unit-test it directly. The DOM wiring that consumes these lives in Lobby.renderBrowse.

/** Arms tier 0–4 → short row label. 0 = "Basic", 4 = "Full arsenal", else "Arms Lv {n}".
 *  Out-of-range input is clamped into 0–4 first so a malformed value never renders raw. */
export function armsLabel(level: number): string {
  const n = Math.min(4, Math.max(0, level));
  if (n === 0) return 'Basic';
  if (n === 4) return 'Full arsenal';
  return `Arms Lv ${n}`;
}

/** Best-of-N → row label. 1 = "Single", else "Best of {n}". */
export function roundsLabel(n: number): string {
  return n === 1 ? 'Single' : `Best of ${n}`;
}

/** CPU-seat count → row label. 0 = "" (omitted), else "{c} CPU". */
export function botLabel(count: number): string {
  return count <= 0 ? '' : `${count} CPU`;
}

/** Interest-rate rule label; disabled/invalid values stay out of the row. */
export function interestLabel(rate: number): string {
  if (!Number.isFinite(rate)) return '';
  const normalized = Math.min(0.5, Math.max(0, rate));
  return normalized > 0 ? `Interest +${Math.round(normalized * 100)}%` : '';
}

/** Sudden-death rule label; zero/negative means the rule is disabled. */
export function suddenDeathLabel(turn: number): string {
  if (!Number.isFinite(turn)) return '';
  const normalized = Math.min(50, Math.max(0, Math.trunc(turn)));
  return normalized > 0 ? `Sudden death T${normalized}` : '';
}
