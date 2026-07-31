import {
  Bomb,
  ChevronDown,
  Coins,
  Crosshair,
  Gauge,
  Menu,
  MoveHorizontal,
  RefreshCw,
  ScanLine,
  createElement,
} from 'lucide';

/**
 * The combat-shell icon seam. Keep this map explicit: importing Lucide's
 * all-icons registry would ship the complete catalog instead of these bounded
 * command and shell symbols.
 */
const HUD_ICONS = {
  aim: { icon: ScanLine, symbol: 'targeting' },
  power: { icon: Gauge, symbol: 'velocity' },
  move: { icon: MoveHorizontal, symbol: 'mobility' },
  weapon: { icon: RefreshCw, symbol: 'cycle' },
  menu: { icon: Menu, symbol: 'menu' },
  store: { icon: Coins, symbol: 'credits' },
  arsenal: { icon: Bomb, symbol: 'ordnance' },
  disclosure: { icon: ChevronDown, symbol: 'disclosure' },
  fire: { icon: Crosshair, symbol: 'target' },
} as const;

export type HudIconName = keyof typeof HUD_ICONS;
export type HudGlyphName = Exclude<HudIconName, 'disclosure'>;

/** Build a decorative, non-focusable icon that reinforces adjacent visible text. */
export function makeHudIcon(name: HudIconName, size = 16): SVGElement {
  const definition = HUD_ICONS[name];
  return createElement(definition.icon, {
    class: 'st-ui-icon',
    width: size,
    height: size,
    'stroke-width': 1.8,
    'aria-hidden': 'true',
    focusable: 'false',
    'data-icon': name,
    'data-symbol': definition.symbol,
  });
}

/**
 * Frame primary command symbols through one visual seam. The wrapper is
 * decorative; the adjacent visible text and owning button retain semantics.
 */
export function makeHudGlyph(name: HudGlyphName, size = 16): HTMLSpanElement {
  const glyph = document.createElement('span');
  glyph.className = 'st-ui-glyph';
  glyph.dataset['glyph'] = name;
  glyph.setAttribute('aria-hidden', 'true');
  glyph.append(makeHudIcon(name, size));
  return glyph;
}
