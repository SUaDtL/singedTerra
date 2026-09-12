import {
  BATTLE_CONSOLE_LOGICAL_SURFACE,
  projectResponsiveLayout,
  projectResponsiveRect,
  type BattleConsoleLayoutMode,
  type BattleConsoleRect,
} from './projection';
import { battleConsoleChromeSockets, battleConsoleSemanticRegions } from './runtimeData';

const OWNER_BLEED_PX = 3;
const ATLAS_GAP_PX = 1;

export interface BattleConsoleOwnerRegion {
  readonly key: string;
  readonly targetRect: BattleConsoleRect;
  readonly atlasRect: BattleConsoleRect;
}

export interface BattleConsoleOwnerAtlas {
  readonly width: number;
  readonly height: number;
  readonly regions: readonly BattleConsoleOwnerRegion[];
}

export interface BattleConsoleModeAssetLayout {
  readonly surface: Readonly<{ width: number; height: number }>;
  readonly dynamic: BattleConsoleOwnerAtlas;
  readonly semantic: BattleConsoleOwnerAtlas;
}

function expandProjectedRect(rect: BattleConsoleRect, mode: BattleConsoleLayoutMode): BattleConsoleRect {
  if (mode === 'wide') return Object.freeze({ ...rect });
  const projected = projectResponsiveRect(rect, mode);
  const surface = projectResponsiveLayout(mode, 1);
  const x = Math.max(0, projected.x - OWNER_BLEED_PX);
  const y = Math.max(0, projected.y - OWNER_BLEED_PX);
  const right = Math.min(surface.cssWidth, projected.x + projected.width + OWNER_BLEED_PX);
  const bottom = Math.min(surface.cssHeight, projected.y + projected.height + OWNER_BLEED_PX);
  return Object.freeze({ x, y, width: right - x, height: bottom - y });
}

function pack(
  records: readonly Readonly<{ key: string; rect: BattleConsoleRect }>[],
  mode: BattleConsoleLayoutMode,
): BattleConsoleOwnerAtlas {
  if (mode === 'wide') {
    return Object.freeze({
      width: BATTLE_CONSOLE_LOGICAL_SURFACE.width,
      height: BATTLE_CONSOLE_LOGICAL_SURFACE.height,
      regions: Object.freeze(records.map((record) => Object.freeze({
        key: record.key,
        targetRect: Object.freeze({ ...record.rect }),
        atlasRect: Object.freeze({ ...record.rect }),
      }))),
    });
  }
  let atlasX = 0;
  let atlasHeight = 0;
  const regions = records.map((record) => {
    const targetRect = expandProjectedRect(record.rect, mode);
    const atlasRect = Object.freeze({ x: atlasX, y: 0, width: targetRect.width, height: targetRect.height });
    atlasX += targetRect.width + ATLAS_GAP_PX;
    atlasHeight = Math.max(atlasHeight, targetRect.height);
    return Object.freeze({ key: record.key, targetRect, atlasRect });
  });
  return Object.freeze({
    width: Math.max(1, atlasX - ATLAS_GAP_PX),
    height: Math.max(1, atlasHeight),
    regions: Object.freeze(regions),
  });
}

const dynamicRecords = battleConsoleChromeSockets.map((socket) => ({ key: socket.key, rect: socket.rect }));
const semanticRecords = battleConsoleSemanticRegions.map((region) => ({ key: region.id, rect: region.rect }));

export const battleConsoleModeAssets = Object.freeze(Object.fromEntries(
  (['compact', 'standard', 'wide'] as const).map((mode) => {
    const projection = projectResponsiveLayout(mode, 1);
    return [mode, Object.freeze({
      surface: Object.freeze({ width: projection.cssWidth, height: projection.cssHeight }),
      dynamic: pack(dynamicRecords, mode),
      semantic: pack(semanticRecords, mode),
    })];
  }),
) as Readonly<Record<BattleConsoleLayoutMode, BattleConsoleModeAssetLayout>>);

export function battleConsoleModeAssetFile(
  kind: 'canonical-pixi-layer' | 'canonical-semantic-atlas' | 'static-chrome',
  mode: BattleConsoleLayoutMode,
): string {
  return mode === 'wide' ? `${kind}.png` : `${kind}-${mode}.png`;
}

export function battleConsoleModeAssetUrl(
  baseUrl: string,
  kind: 'canonical-pixi-layer' | 'canonical-semantic-atlas' | 'static-chrome',
  mode: BattleConsoleLayoutMode,
): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}art/battle-console-integrated/${battleConsoleModeAssetFile(kind, mode)}`;
}
