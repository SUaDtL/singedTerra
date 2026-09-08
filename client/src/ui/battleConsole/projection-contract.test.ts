import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from './contractTestSupport';

// @ts-ignore -- V-02 intentionally keeps the runtime product module absent for expectation RED.
import { projectBattleConsoleLayoutForViewport, projectResponsiveLayout } from './projection';
import type { BattleConsoleLayoutMode } from './projection';
import { battleConsoleModeAssets } from './modeAssets';

const projections = readBattleConsoleContract('topology/projections.json') as any;

describe('AC-22 independent responsive geometry', () => {
  it('AC-01 selects readable compact geometry for a short fine-pointer game', () => {
    expect(projectBattleConsoleLayoutForViewport({ viewportWidth: 844, viewportHeight: 390, devicePixelRatio: 1, coarsePointer: false }).mode).toBe('compact');
  });
  it('AC-01 selects readable compact geometry before desktop type shrinks below its intended size', () => {
    expect(projectBattleConsoleLayoutForViewport({ viewportWidth: 1024, viewportHeight: 768, devicePixelRatio: 1, coarsePointer: false }).mode).toBe('compact');
    expect(projectBattleConsoleLayoutForViewport({ viewportWidth: 1199, viewportHeight: 900, devicePixelRatio: 1, coarsePointer: false }).mode).toBe('compact');
    expect(projectBattleConsoleLayoutForViewport({ viewportWidth: 1200, viewportHeight: 900, devicePixelRatio: 1, coarsePointer: false }).mode).toBe('standard');
  });
  it('distinguishes outer stage scaling from an effective console geometry change', () => {
    const largeStage = projectBattleConsoleLayoutForViewport({
      viewportWidth: 1600,
      viewportHeight: 900,
      devicePixelRatio: 1,
      coarsePointer: false,
    });
    const scaledStage = projectBattleConsoleLayoutForViewport({
      viewportWidth: 1200,
      viewportHeight: 900,
      devicePixelRatio: 1,
      coarsePointer: false,
    });
    const geometryChange = projectBattleConsoleLayoutForViewport({
      viewportWidth: 1600,
      viewportHeight: 600,
      devicePixelRatio: 1,
      coarsePointer: false,
    });

    expect(largeStage).toEqual(scaledStage);
    expect(largeStage.mode).toBe('standard');
    expect(geometryChange.mode).toBe('wide');
    expect(geometryChange).not.toEqual(scaledStage);
  });

  it('matches every locked mode at every DPR without CSS/backing-coordinate drift', () => {
    for (const mode of projections.modeOrder as BattleConsoleLayoutMode[]) {
      for (const dpr of projections.dpr.values) {
        const projected = projectResponsiveLayout(mode, dpr);
        expect(projected.mode).toBe(mode);
        expect(projected.cssGeometryChangesWithDpr).toBe(false);
        expect(projected.landmarkCount).toBe(projections.cardinalities.transformedLandmarks);
        expect(projected.socketCount).toBe(projections.cardinalities.transformedSockets);
      }
    }
  });

  it('publishes 1:1 owner atlases for every responsive mode', () => {
    for (const mode of projections.modeOrder as BattleConsoleLayoutMode[]) {
      const projected = projectResponsiveLayout(mode, 1);
      const assets = battleConsoleModeAssets[mode];
      expect(assets.surface).toEqual({ width: projected.cssWidth, height: projected.cssHeight });
      expect(assets.dynamic.regions).toHaveLength(projections.cardinalities.transformedSockets);
      expect(assets.semantic.regions.length).toBeGreaterThan(0);
      expect(new Set(assets.dynamic.regions.map((region) => region.key)).size)
        .toBe(assets.dynamic.regions.length);
    }
  });
});
