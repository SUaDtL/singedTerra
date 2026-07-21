export const COMPACT_TOUCH_QUERY = '(pointer: coarse) and (max-height: 700px)';

export function resolveInitialArsenalCollapsed(
  storedValue: string | null,
  compactTouch: boolean,
): boolean {
  if (storedValue === '1') return true;
  if (storedValue === '0') return false;
  return compactTouch;
}
