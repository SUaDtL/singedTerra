// Pure coercion of the SE-parity economy options from a create_room request into the values stored
// on the room row. Extracted from index.ts so it is unit-testable without a live Supabase
// (mirrors submit_action/validate.ts). ADDITIVE + back-compat: an absent or non-numeric field is
// omitted entirely (so the engine default holds on every client), values are clamped to range, and
// it NEVER throws or 400s — a bad economy value can't fail room creation.

export interface EconomyOptions {
  interestRate?: number;
  suddenDeathTurn?: number;
  armsLevel?: number;
}

const clampNum = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export function coerceEconomyOptions(
  options:
    | { interestRate?: unknown; suddenDeathTurn?: unknown; armsLevel?: unknown; [key: string]: unknown }
    | null
    | undefined,
): EconomyOptions {
  const out: EconomyOptions = {};
  if (!options || typeof options !== 'object') return out;

  const ir = options.interestRate;
  if (typeof ir === 'number' && Number.isFinite(ir)) {
    out.interestRate = clampNum(ir, 0, 0.5);
  }

  const sd = options.suddenDeathTurn;
  if (typeof sd === 'number' && Number.isFinite(sd)) {
    out.suddenDeathTurn = clampNum(Math.trunc(sd), 0, 50);
  }

  const al = options.armsLevel;
  if (typeof al === 'number' && Number.isFinite(al)) {
    out.armsLevel = clampNum(Math.trunc(al), 0, 4);
  }

  return out;
}
