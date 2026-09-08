import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import sharp from 'sharp';

import { buildBattleConsoleAssets } from './build-battle-console.mjs';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const recipePath = resolve(import.meta.dirname, 'battle-console-assets.json');
const referencePath = resolve(repositoryRoot, '.codearbiter/contracts/battle-console/reference/blank-static-chrome.png');
const dynamicReferencePath = resolve(repositoryRoot, '.codearbiter/contracts/battle-console/reference/canonical-pixi-layer.png');
const semanticReferencePath = resolve(repositoryRoot, '.codearbiter/contracts/battle-console/reference/normalized-wide.png');
const responsiveReferencePaths = Object.freeze({
  compact: resolve(repositoryRoot, '.codearbiter/contracts/battle-console/reference/normalized-compact.png'),
  standard: resolve(repositoryRoot, '.codearbiter/contracts/battle-console/reference/normalized-standard.png'),
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

test('builds byte-identical metadata-free runtime chrome in two clean roots', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'singedterra-p03-'));
  const firstRoot = join(parent, 'first');
  const secondRoot = join(parent, 'second');

  try {
    const first = await buildBattleConsoleAssets({ repositoryRoot, recipePath, outputRoot: firstRoot });
    const second = await buildBattleConsoleAssets({ repositoryRoot, recipePath, outputRoot: secondRoot });
    assert.deepEqual(first, second);

    const firstBytes = await readFile(join(firstRoot, 'static-chrome.png'));
    const secondBytes = await readFile(join(secondRoot, 'static-chrome.png'));
    assert.equal(sha256(firstBytes), sha256(secondBytes));
    const firstDynamicBytes = await readFile(join(firstRoot, 'canonical-pixi-layer.png'));
    const secondDynamicBytes = await readFile(join(secondRoot, 'canonical-pixi-layer.png'));
    assert.equal(sha256(firstDynamicBytes), sha256(secondDynamicBytes));
    const firstSemanticBytes = await readFile(join(firstRoot, 'canonical-semantic-atlas.png'));
    const secondSemanticBytes = await readFile(join(secondRoot, 'canonical-semantic-atlas.png'));
    assert.equal(sha256(firstSemanticBytes), sha256(secondSemanticBytes));

    const metadata = await sharp(firstBytes).metadata();
    assert.equal(metadata.width, 1388);
    assert.equal(metadata.height, 212);
    assert.equal(metadata.space, 'srgb');
    assert.equal(metadata.hasAlpha, true);

    const referencePixels = await sharp(referencePath).ensureAlpha().raw().toBuffer();
    const outputPixels = await sharp(firstBytes).ensureAlpha().raw().toBuffer();
    // AC-02 successor: restore the wind well brass erased by the historical text mask.
    const windBrass = await sharp(semanticReferencePath).ensureAlpha().raw().toBuffer();
    for (let y = 122; y < 147; y += 1) {
      const start = (y * 1388 + 946) * 4;
      windBrass.copy(referencePixels, start, start, start + 10 * 4);
    }
    for (const [cx, readoutX, readoutWidth] of [[609, 574, 69], [753, 719, 69], [900, 867, 73]]) {
      for (let y = 43; y < 149; y++) for (let x = cx - 55; x < cx + 55; x++) {
        const offset = (y * 1388 + x) * 4;
        windBrass.copy(referencePixels, offset, offset, offset + 4);
        const dome = y <= 102 ? (x - cx) ** 2 + (y - 102) ** 2 <= 51 ** 2 : y <= 111 && Math.abs(x - cx) <= 51;
        const readout = x >= readoutX && x < readoutX + readoutWidth && y >= 121 && y < 141;
        if (dome) referencePixels.set([16, 23, 25, 255], offset);
        else if (readout) referencePixels.set([21, 20, 22, 255], offset);
      }
    }
    const wornMetal = await sharp(semanticReferencePath)
      .extract({ left: 360, top: 21, width: 110, height: 12 })
      .resize({ width: 110, height: 37, kernel: sharp.kernel.lanczos3 })
      .ensureAlpha().toColourspace('srgb').raw().toBuffer();
    for (let y = 149; y < 196; y++) for (let x = 838; x < 964; x++) {
      const offset = (y * 1388 + x) * 4;
      windBrass.copy(referencePixels, offset, offset, offset + 4);
      const cornerX = Math.max(855 - x, 0, x - 944);
      const cornerY = Math.max(160 - y, 0, y - 182);
      if (x >= 849 && x < 951 && y >= 154 && y < 189 && cornerX * cornerX + cornerY * cornerY <= 36) {
        for (let channel = 0; channel < 3; channel++) referencePixels[offset + channel] = Math.round(wornMetal[((y - 153) * 110 + x - 846) * 4 + channel] * 0.85);
      }
      if (x >= 850 && x < 952 && y >= 189) {
        const sourceOffset = ((y - 46) * 1388 + x) * 4;
        windBrass.copy(referencePixels, offset, sourceOffset, sourceOffset + 4);
      }
    }
    const redFace = await sharp(semanticReferencePath).extract({ left: 1043, top: 132, width: 45, height: 43 })
      .resize({ width: 232, height: 43, fit: 'fill', kernel: sharp.kernel.lanczos3 }).ensureAlpha().toColourspace('srgb').raw().toBuffer();
    for (let y = 115; y < 183; y++) for (let x = 1018; x < 1288; x++) {
      const offset = (y * 1388 + x) * 4;
      windBrass.copy(referencePixels, offset, offset, offset + 4);
      const corner = Math.max(140 - y, 0, y - 166);
      if (y >= 132 && y < 175 && x >= 1039 + corner && x < 1271 - corner) {
        const source = ((y - 132) * 232 + x - 1039) * 4;
        redFace.copy(referencePixels, offset, source, source + 4);
        if (x >= 1097 && x < 1139 && y >= 133 && y < 172 && (x - 1118) ** 2 + (y - 152.5) ** 2 <= 361 && windBrass[offset + 1] > 35 && windBrass[offset + 1] > windBrass[offset] * 0.43) {
          windBrass.copy(referencePixels, offset, offset, offset + 4);
        }
      }
    }
    for (let y = 120; y < 123; y++) {
      const source = (119 * 1388 + 91) * 4;
      referencePixels.copy(referencePixels, (y * 1388 + 91) * 4, source, source + 112 * 4);
    }
    for (let y = 83; y < 114; y++) for (let x = 220; x < 305; x++) {
      const offset = (y * 1388 + x) * 4;
      windBrass.copy(referencePixels, offset, offset, offset + 4);
      const dx = Math.max(234 - x, 0, x - 289);
      const dy = Math.max(98 - y, 0, y - 98);
      if (x >= 224 && x < 300 && y >= 88 && y < 109 && dx * dx + dy * dy <= 100) {
        referencePixels.set([25, 18, 16, 255], offset);
      }
    }
    assert.ok(outputPixels.equals(referencePixels), 'full dial glass and readout interiors are clean, original brass is preserved');
    for (const [x, y] of [[849, 154], [950, 154], [849, 188], [950, 188]]) {
      const offset = (y * 1388 + x) * 4;
      assert.ok(outputPixels.subarray(offset, offset + 4).equals(windBrass.subarray(offset, offset + 4)), `wind window corner cap preserved at (${x},${y})`);
    }

    for (let y = 83; y < 114; y++) for (let x = 220; x < 305; x++) {
      const offset = (y * 1388 + x) * 4;
      if (windBrass[offset] > 50 && windBrass[offset] > windBrass[offset + 1] * 1.8) {
        assert.ok(outputPixels.subarray(offset, offset + 4).equals(windBrass.subarray(offset, offset + 4)), `original red HP rim preserved at (${x},${y})`);
      }
    }

    const dynamicReferencePixels = await sharp(dynamicReferencePath).ensureAlpha().raw().toBuffer();
    const dynamicOutputPixels = await sharp(firstDynamicBytes).ensureAlpha().raw().toBuffer();
    assert.deepEqual(dynamicOutputPixels, dynamicReferencePixels);
    const semanticReferencePixels = await sharp(semanticReferencePath).ensureAlpha().raw().toBuffer();
    const semanticOutputPixels = await sharp(firstSemanticBytes).ensureAlpha().raw().toBuffer();
    assert.deepEqual(semanticOutputPixels, semanticReferencePixels);
    assert.deepEqual(first.assets.map((asset) => asset.role), [
      'state-free-static-chrome',
      'canonical-dynamic-pixi-atlas',
      'canonical-preact-semantic-atlas',
      'state-free-static-chrome-standard',
      'canonical-dynamic-pixi-atlas-standard',
      'canonical-preact-semantic-atlas-standard',
      'state-free-static-chrome-compact',
      'canonical-dynamic-pixi-atlas-compact',
      'canonical-preact-semantic-atlas-compact',
    ]);

    for (const mode of ['standard', 'compact']) {
      const staticBytes = await readFile(join(firstRoot, `static-chrome-${mode}.png`));
      const dynamicBytes = await readFile(join(firstRoot, `canonical-pixi-layer-${mode}.png`));
      const semanticBytes = await readFile(join(firstRoot, `canonical-semantic-atlas-${mode}.png`));
      const staticMetadata = await sharp(staticBytes).metadata();
      const staticPixels = await sharp(staticBytes).ensureAlpha().raw().toBuffer();
      const repairedScaledPixels = await sharp(firstBytes)
        .resize({ fit: 'inside', kernel: sharp.kernel.lanczos3, withoutEnlargement: true, width: staticMetadata.width })
        .ensureAlpha().toColourspace('srgb').raw().toBuffer();
      const repairScale = staticMetadata.width / 1388;
      for (const [left, top, width, height] of [[554, 43, 110, 106], [698, 43, 110, 106], [845, 43, 110, 106], [838, 149, 126, 47], [1018, 115, 270, 68], [91, 120, 112, 3], [220, 83, 85, 31]]) {
        const target = { x: Math.round(left * repairScale), y: Math.round(top * repairScale), width: Math.round(width * repairScale), height: Math.round(height * repairScale) };
        for (let y = target.y; y < target.y + target.height; y++) {
          const start = (y * staticMetadata.width + target.x) * 4;
          const end = start + target.width * 4;
          assert.ok(staticPixels.subarray(start, end).equals(repairedScaledPixels.subarray(start, end)), `${mode} repaired instrument pixels must derive from cleaned wide source at row ${y}`);
        }
      }

      const dynamicAsset = first.assets.find(
        (candidate) => candidate.role === `canonical-dynamic-pixi-atlas-${mode}`,
      );
      const semanticAsset = first.assets.find(
        (candidate) => candidate.role === `canonical-preact-semantic-atlas-${mode}`,
      );
      const fuelFill = dynamicAsset.regions.find((region) => region.key === 'fuel-live-fill');
      const fuelValue = semanticAsset.regions.find((region) => region.key === 'fuel-value');
      const dynamicPixels = await sharp(dynamicBytes).ensureAlpha().raw().toBuffer();
      const semanticFreePixels = await sharp(dynamicReferencePath)
        .resize({
          fit: 'inside',
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: true,
          width: staticMetadata.width,
        })
        .ensureAlpha()
        .toColourspace('srgb')
        .raw()
        .toBuffer();
      const overlap = {
        left: Math.max(fuelFill.targetRect.x, fuelValue.targetRect.x),
        top: Math.max(fuelFill.targetRect.y, fuelValue.targetRect.y),
        right: Math.min(
          fuelFill.targetRect.x + fuelFill.targetRect.width,
          fuelValue.targetRect.x + fuelValue.targetRect.width,
        ),
        bottom: Math.min(
          fuelFill.targetRect.y + fuelFill.targetRect.height,
          fuelValue.targetRect.y + fuelValue.targetRect.height,
        ),
      };
      assert.ok(overlap.right > overlap.left && overlap.bottom > overlap.top);
      for (let y = overlap.top; y < overlap.bottom; y += 1) {
        for (let x = overlap.left; x < overlap.right; x += 1) {
          const atlasX = fuelFill.atlasRect.x + x - fuelFill.targetRect.x;
          const atlasY = fuelFill.atlasRect.y + y - fuelFill.targetRect.y;
          const actualOffset = ((atlasY * dynamicAsset.width) + atlasX) * 4;
          const expectedOffset = ((y * staticMetadata.width) + x) * 4;
          assert.deepEqual(
            dynamicPixels.subarray(actualOffset, actualOffset + 4),
            semanticFreePixels.subarray(expectedOffset, expectedOffset + 4),
            `${mode} dynamic fuel layer reintroduces canonical semantic ink at (${x},${y})`,
          );
        }
      }
      const overlayInputs = [];
      for (const [role, atlasBytes] of [
        [`canonical-dynamic-pixi-atlas-${mode}`, dynamicBytes],
        [`canonical-preact-semantic-atlas-${mode}`, semanticBytes],
      ]) {
        const asset = first.assets.find((candidate) => candidate.role === role);
        for (const region of asset.regions) {
          overlayInputs.push({
            input: await sharp(atlasBytes).extract({
              left: region.atlasRect.x,
              top: region.atlasRect.y,
              width: region.atlasRect.width,
              height: region.atlasRect.height,
            }).png().toBuffer(),
            left: region.targetRect.x,
            top: region.targetRect.y,
          });
        }
      }
      const reconstructed = await sharp(staticBytes)
        .composite(overlayInputs)
        .removeAlpha()
        .toColourspace('srgb')
        .raw()
        .toBuffer();
      const approved = await sharp(responsiveReferencePaths[mode])
        .removeAlpha()
        .toColourspace('srgb')
        .raw()
        .toBuffer();
      // AC-02/05 successor: repaired complete instrument faces intentionally replace frozen ink.
      // Everywhere else the historical layer reconstruction remains byte-exact.
      const ratio = staticMetadata.width / 1388;
      for (let y = 0; y < staticMetadata.height; y++) for (let x = 0; x < staticMetadata.width; x++) {
        const inRepair = [[554, 43, 110, 106], [698, 43, 110, 106], [845, 43, 110, 106], [838, 149, 126, 47], [1018, 115, 270, 68], [91, 120, 112, 3], [220, 83, 85, 31]]
          .some(([left, top, width, height]) => x >= Math.round(left * ratio) && x < Math.round(left * ratio) + Math.round(width * ratio)
            && y >= Math.round(top * ratio) && y < Math.round(top * ratio) + Math.round(height * ratio));
        if (inRepair) continue;
        const offset = (y * staticMetadata.width + x) * 3;
        assert.ok(reconstructed.subarray(offset, offset + 3).equals(approved.subarray(offset, offset + 3)), `${mode} non-repaired pixel (${x},${y}) drifted`);
      }
    }
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('refuses to build into a non-empty or already-created output root', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'singedterra-p03-root-'));
  try {
    await buildBattleConsoleAssets({ repositoryRoot, recipePath, outputRoot: join(parent, 'assets') });
    await assert.rejects(
      buildBattleConsoleAssets({ repositoryRoot, recipePath, outputRoot: join(parent, 'assets') }),
      /output root must be absent/,
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
