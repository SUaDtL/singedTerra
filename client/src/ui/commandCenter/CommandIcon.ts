import type { CommandSemanticIcon } from './contracts';
import defaultSpriteHref from './assets/icons/sprite.svg?no-inline';

export type CommandIconName = CommandSemanticIcon | 'modes' | 'close';

export interface CommandIconOptions {
  readonly spriteHref?: string | null;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const SYMBOLS_BY_ICON = Object.freeze({
  campaigns: ['campaign'],
  skirmishes: ['duel'],
  multiplayer: ['local', 'online'],
  modes: ['menu'],
  close: ['close'],
} satisfies Readonly<Record<CommandIconName, readonly string[]>>);

export function createCommandIcon(
  name: CommandIconName | string,
  options: CommandIconOptions = {},
): SVGSVGElement | null {
  const symbols = SYMBOLS_BY_ICON[name as CommandIconName];
  const spriteHref = options.spriteHref === undefined ? defaultSpriteHref : options.spriteHref;
  if (!symbols || !spriteHref) return null;

  const icon = document.createElementNS(SVG_NAMESPACE, 'svg');
  icon.classList.add('command-center__icon');
  icon.dataset.commandIcon = name;
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  icon.setAttribute('viewBox', `0 0 ${symbols.length === 1 ? 32 : 68} 32`);

  symbols.forEach((symbol, index) => {
    const use = document.createElementNS(SVG_NAMESPACE, 'use');
    use.setAttribute('href', `${spriteHref}#stc-${symbol}`);
    if (symbols.length > 1) {
      use.setAttribute('x', String(index * 36));
      use.setAttribute('width', '32');
      use.setAttribute('height', '32');
    }
    icon.append(use);
  });
  return icon;
}
