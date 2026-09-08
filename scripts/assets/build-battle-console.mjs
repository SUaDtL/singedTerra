import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const DEFAULT_RECIPE = 'scripts/assets/battle-console-assets.json';
const EXPECTED_SCHEMA = 'singedterra-battle-console-assets/v1';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function repositoryPath(root, value, label) {
  if (typeof value !== 'string' || value.length === 0 || isAbsolute(value) || value.includes('\\')) {
    throw new TypeError(`${label} must be a non-empty repository-relative POSIX path`);
  }
  const absolute = resolve(root, ...value.split('/'));
  const rel = relative(root, absolute);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new RangeError(`${label} escapes the repository`);
  }
  return absolute;
}

async function requireAbsent(path) {
  try {
    await stat(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`output root must be absent before build: ${path}`);
}

function parseRecipe(bytes) {
  const recipe = JSON.parse(bytes.toString('utf8'));
  if (recipe.schema !== EXPECTED_SCHEMA) throw new Error(`unsupported asset recipe schema: ${recipe.schema}`);
  if (
    recipe.output?.file !== 'static-chrome.png'
    || recipe.output?.dynamicFile !== 'canonical-pixi-layer.png'
    || recipe.output?.semanticFile !== 'canonical-semantic-atlas.png'
    || recipe.output?.responsivePattern !== '{kind}-{mode}.png'
    || recipe.output?.manifest !== 'manifest.json'
  ) {
    throw new Error('asset recipe output names differ from the closed runtime contract');
  }
  if (
    recipe.output.format !== 'png'
    || recipe.output.colorSpace !== 'srgb'
    || recipe.output.alpha !== 'straight-rgba'
    || recipe.output.compressionLevel !== 9
    || recipe.output.adaptiveFiltering !== false
    || recipe.output.palette !== false
    || recipe.output.progressive !== false
  ) {
    throw new Error('asset recipe encoding differs from the deterministic fixture');
  }
  if (
    recipe.responsive?.kernel !== 'lanczos3'
    || recipe.responsive?.ownerBleedPx !== 3
    || recipe.responsive?.atlasGapPx !== 1
    || Object.keys(recipe.responsive?.modes ?? {}).join('\0') !== 'standard\0compact'
  ) {
    throw new Error('responsive asset recipe differs from the approved projection contract');
  }
  return recipe;
}

function roundHalfAwayFromZero(value) {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

function projectOwnerRect(rect, mode, bleed) {
  const project = (value) => roundHalfAwayFromZero((value * mode.numerator) / mode.denominator);
  const x = Math.max(0, project(rect.x) - bleed);
  const y = Math.max(0, project(rect.y) - bleed);
  const right = Math.min(mode.width, project(rect.x) + project(rect.width) + bleed);
  const bottom = Math.min(mode.height, project(rect.y) + project(rect.height) + bleed);
  return { x, y, width: right - x, height: bottom - y };
}

function packOwnerRegions(records, mode, bleed, gap, keyOf) {
  let atlasX = 0;
  let atlasHeight = 0;
  const regions = records.map((record) => {
    const targetRect = projectOwnerRect(record.rect, mode, bleed);
    const atlasRect = { x: atlasX, y: 0, width: targetRect.width, height: targetRect.height };
    atlasX += targetRect.width + gap;
    atlasHeight = Math.max(atlasHeight, targetRect.height);
    return { key: keyOf(record), targetRect, atlasRect };
  });
  return {
    width: Math.max(1, atlasX - gap),
    height: Math.max(1, atlasHeight),
    regions,
  };
}

function contains(rect, x, y) {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.width && y < rect.y + rect.height;
}

function copyRect(source, sourceWidth, target, targetWidth, sourceRect, targetRect) {
  for (let y = 0; y < sourceRect.height; y += 1) {
    const sourceStart = ((sourceRect.y + y) * sourceWidth + sourceRect.x) * 4;
    const targetStart = ((targetRect.y + y) * targetWidth + targetRect.x) * 4;
    source.copy(target, targetStart, sourceStart, sourceStart + sourceRect.width * 4);
  }
}

function copyRectWithSemanticBackground(
  approved,
  semanticFree,
  sourceWidth,
  target,
  targetWidth,
  sourceRect,
  targetRect,
  semanticRects,
) {
  for (let y = 0; y < sourceRect.height; y += 1) {
    for (let x = 0; x < sourceRect.width; x += 1) {
      const sourceX = sourceRect.x + x;
      const sourceY = sourceRect.y + y;
      const source = semanticRects.some((rect) => contains(rect, sourceX, sourceY))
        ? semanticFree
        : approved;
      const sourceOffset = ((sourceY * sourceWidth) + sourceX) * 4;
      const targetOffset = (((targetRect.y + y) * targetWidth) + targetRect.x + x) * 4;
      source.copy(target, targetOffset, sourceOffset, sourceOffset + 4);
    }
  }
}

async function encodeRaw(raw, width, height, outputPath, output) {
  await sharp(raw, { raw: { width, height, channels: 4 } })
    .toColourspace('srgb')
    .png({
      compressionLevel: output.compressionLevel,
      adaptiveFiltering: output.adaptiveFiltering,
      palette: output.palette,
      progressive: output.progressive,
    })
    .toFile(outputPath);
  return readFile(outputPath);
}

export async function buildBattleConsoleAssets({
  repositoryRoot = process.cwd(),
  recipePath = resolve(repositoryRoot, DEFAULT_RECIPE),
  outputRoot,
} = {}) {
  const root = resolve(repositoryRoot);
  const recipeBytes = await readFile(recipePath);
  const recipe = parseRecipe(recipeBytes);

  const fixturePath = repositoryPath(root, recipe.fixture.path, 'fixture.path');
  const sourcePath = repositoryPath(root, recipe.source.path, 'source.path');
  const dynamicSourcePath = repositoryPath(root, recipe.dynamicSource.path, 'dynamicSource.path');
  const semanticSourcePath = repositoryPath(root, recipe.semanticSource.path, 'semanticSource.path');
  const assembliesPath = repositoryPath(root, recipe.responsive.assemblies.path, 'responsive.assemblies.path');
  const chromeSocketsPath = repositoryPath(root, recipe.responsive.chromeSockets.path, 'responsive.chromeSockets.path');
  const declaredOutputRoot = repositoryPath(root, recipe.output.root, 'output.root');
  const targetRoot = outputRoot ? resolve(outputRoot) : declaredOutputRoot;

  const fixtureBytes = await readFile(fixturePath);
  if (sha256(fixtureBytes) !== recipe.fixture.sha256) throw new Error('asset-build fixture bytes drifted');
  const fixture = JSON.parse(fixtureBytes.toString('utf8'));
  if (fixture.candidateInputsAllowed !== false || fixture.output?.twoCleanBuildsMustBeByteIdentical !== true) {
    throw new Error('asset-build fixture no longer closes candidate inputs and deterministic output');
  }

  const sourceBytes = await readFile(sourcePath);
  if (sha256(sourceBytes) !== recipe.source.sha256) throw new Error('blank static chrome source bytes drifted');
  const dynamicSourceBytes = await readFile(dynamicSourcePath);
  if (sha256(dynamicSourceBytes) !== recipe.dynamicSource.sha256) {
    throw new Error('canonical dynamic Pixi source bytes drifted');
  }
  const semanticSourceBytes = await readFile(semanticSourcePath);
  if (sha256(semanticSourceBytes) !== recipe.semanticSource.sha256) {
    throw new Error('canonical semantic source bytes drifted');
  }
  const assembliesBytes = await readFile(assembliesPath);
  if (sha256(assembliesBytes) !== recipe.responsive.assemblies.sha256) {
    throw new Error('semantic region authority bytes drifted');
  }
  const chromeSocketsBytes = await readFile(chromeSocketsPath);
  if (sha256(chromeSocketsBytes) !== recipe.responsive.chromeSockets.sha256) {
    throw new Error('dynamic socket authority bytes drifted');
  }
  const assemblies = JSON.parse(assembliesBytes.toString('utf8'));
  const chromeSockets = JSON.parse(chromeSocketsBytes.toString('utf8'));

  const decoded = await sharp(sourceBytes)
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (decoded.info.width !== recipe.source.width || decoded.info.height !== recipe.source.height || decoded.info.channels !== 4) {
    throw new Error('blank static chrome dimensions or alpha channel differ from the recipe');
  }
  const dynamicDecoded = await sharp(dynamicSourceBytes)
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    dynamicDecoded.info.width !== recipe.dynamicSource.width
    || dynamicDecoded.info.height !== recipe.dynamicSource.height
    || dynamicDecoded.info.channels !== 4
  ) {
    throw new Error('canonical dynamic Pixi dimensions or alpha channel differ from the recipe');
  }
  const semanticDecoded = await sharp(semanticSourceBytes)
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    semanticDecoded.info.width !== recipe.semanticSource.width
    || semanticDecoded.info.height !== recipe.semanticSource.height
    || semanticDecoded.info.channels !== 4
  ) {
    throw new Error('canonical semantic dimensions or alpha channel differ from the recipe');
  }

  // Product-completion successor: recover decorative brass, never text, from the original art.
  for (const rect of recipe.staticRestorations ?? []) {
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isInteger)
      || rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0
      || rect.x + rect.width > decoded.info.width || rect.y + rect.height > decoded.info.height) {
      throw new RangeError('static restoration crop escapes the source art');
    }
    copyRect(semanticDecoded.data, decoded.info.width, decoded.data, decoded.info.width, rect, rect);
  }

  // Restore the complete instrument surround, then clear the entire glass and readout faces.
  // Live Pixi ink paints onto these curved faces; no rectangular socket masks remain visible.
  for (const dial of recipe.dialRepairs ?? []) {
    const rect = dial.sourceRect;
    copyRect(semanticDecoded.data, decoded.info.width, decoded.data, decoded.info.width, rect, rect);
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      for (let x = rect.x; x < rect.x + rect.width; x++) {
        const dome = y <= dial.centerY
          ? (x - dial.centerX) ** 2 + (y - dial.centerY) ** 2 <= dial.radius ** 2
          : y <= dial.bottom && Math.abs(x - dial.centerX) <= dial.radius;
        const offset = (y * decoded.info.width + x) * 4;
        if (dome) decoded.data.set([16, 23, 25, 255], offset);
        else if (contains(dial.readout, x, y)) decoded.data.set([21, 20, 22, 255], offset);
      }
    }
  }

  for (const infill of recipe.materialInfills ?? []) {
    // Preserve the actual instrument-column perimeter, not a replacement plaque or erased blob.
    const { rect, interior, sample } = infill;
    copyRect(semanticDecoded.data, decoded.info.width, decoded.data, decoded.info.width, rect, rect);
    const material = await sharp(semanticSourceBytes)
      .extract({ left: sample.x, top: sample.y, width: sample.width, height: sample.height })
      .resize({ width: interior.width, height: interior.height, kernel: sharp.kernel.lanczos3 })
      .ensureAlpha().toColourspace('srgb').raw().toBuffer();
    for (let y = 0; y < interior.height; y++) for (let x = 0; x < interior.width; x++) {
      const px = interior.x + x;
      const py = interior.y + y;
      const clip = infill.clip;
      const dx = Math.max(clip.x + clip.radius - px, 0, px - (clip.x + clip.width - clip.radius - 1));
      const dy = Math.max(clip.y + clip.radius - py, 0, py - (clip.y + clip.height - clip.radius - 1));
      if (!contains(clip, px, py) || dx * dx + dy * dy > clip.radius * clip.radius) continue;
      const offset = ((interior.y + y) * decoded.info.width + interior.x + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        decoded.data[offset + channel] = Math.round(material[(y * interior.width + x) * 4 + channel] * infill.brightness);
      }
    }
    copyRect(semanticDecoded.data, decoded.info.width, decoded.data, decoded.info.width,
      infill.bottomTrimSource, infill.bottomTrimTarget);
  }

  if (recipe.fireFaceRepair) {
    const { rect, face, sample, reticle } = recipe.fireFaceRepair;
    copyRect(semanticDecoded.data, decoded.info.width, decoded.data, decoded.info.width, rect, rect);
    const redFace = await sharp(semanticSourceBytes)
      .extract({ left: sample.x, top: sample.y, width: sample.width, height: sample.height })
      .resize({ width: face.width, height: face.height, fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .ensureAlpha().toColourspace('srgb').raw().toBuffer();
    for (let y = face.y; y < face.y + face.height; y++) {
      const corner = Math.max(face.y + 8 - y, 0, y - (face.y + face.height - 9));
      for (let x = face.x + corner; x < face.x + face.width - corner; x++) {
        const offset = (y * decoded.info.width + x) * 4;
        const source = ((y - face.y) * face.width + x - face.x) * 4;
        redFace.copy(decoded.data, offset, source, source + 4);
        if (contains(reticle, x, y)
          && (x - (reticle.x + reticle.width / 2)) ** 2 + (y - (reticle.y + reticle.height / 2)) ** 2 <= 361
          && semanticDecoded.data[offset + 1] > 35
          && semanticDecoded.data[offset + 1] > semanticDecoded.data[offset] * 0.43) {
          semanticDecoded.data.copy(decoded.data, offset, offset, offset + 4);
        }
      }
    }
  }

  for (const extension of recipe.blankExtensions ?? []) {
    const { rect, sample } = extension;
    for (let y = rect.y; y < rect.y + rect.height; y++) {
      copyRect(decoded.data, decoded.info.width, decoded.data, decoded.info.width, sample,
        { x: rect.x, y, width: rect.width, height: sample.height });
    }
  }

  for (const repair of recipe.roundedWellRepairs ?? []) {
    const { rect, interior, radius, sample } = repair;
    copyRect(semanticDecoded.data, decoded.info.width, decoded.data, decoded.info.width, rect, rect);
    const sampledOffset = (sample.y * decoded.info.width + sample.x) * 4;
    for (let y = interior.y; y < interior.y + interior.height; y++) {
      for (let x = interior.x; x < interior.x + interior.width; x++) {
        const dx = Math.max(interior.x + radius - x, 0, x - (interior.x + interior.width - radius - 1));
        const dy = Math.max(interior.y + radius - y, 0, y - (interior.y + interior.height - radius - 1));
        if (dx * dx + dy * dy <= radius * radius) {
          semanticDecoded.data.copy(decoded.data, (y * decoded.info.width + x) * 4, sampledOffset, sampledOffset + 4);
        }
      }
    }
  }

  await requireAbsent(targetRoot);
  await mkdir(targetRoot, { recursive: true });

  const outputPath = resolve(targetRoot, recipe.output.file);
  await sharp(decoded.data, {
    raw: {
      width: decoded.info.width,
      height: decoded.info.height,
      channels: 4,
    },
  })
    .toColourspace('srgb')
    .png({
      compressionLevel: recipe.output.compressionLevel,
      adaptiveFiltering: recipe.output.adaptiveFiltering,
      palette: recipe.output.palette,
      progressive: recipe.output.progressive,
    })
    .toFile(outputPath);

  const dynamicOutputPath = resolve(targetRoot, recipe.output.dynamicFile);
  await sharp(dynamicDecoded.data, {
    raw: {
      width: dynamicDecoded.info.width,
      height: dynamicDecoded.info.height,
      channels: 4,
    },
  })
    .toColourspace('srgb')
    .png({
      compressionLevel: recipe.output.compressionLevel,
      adaptiveFiltering: recipe.output.adaptiveFiltering,
      palette: recipe.output.palette,
      progressive: recipe.output.progressive,
    })
    .toFile(dynamicOutputPath);

  const semanticOutputPath = resolve(targetRoot, recipe.output.semanticFile);
  await sharp(semanticDecoded.data, {
    raw: {
      width: semanticDecoded.info.width,
      height: semanticDecoded.info.height,
      channels: 4,
    },
  })
    .toColourspace('srgb')
    .png({
      compressionLevel: recipe.output.compressionLevel,
      adaptiveFiltering: recipe.output.adaptiveFiltering,
      palette: recipe.output.palette,
      progressive: recipe.output.progressive,
    })
    .toFile(semanticOutputPath);

  const outputBytes = await readFile(outputPath);
  const dynamicOutputBytes = await readFile(dynamicOutputPath);
  const semanticOutputBytes = await readFile(semanticOutputPath);
  const responsiveAssets = [];
  for (const [modeName, mode] of Object.entries(recipe.responsive.modes)) {
    const approvedPath = repositoryPath(root, mode.source, `responsive.modes.${modeName}.source`);
    const approvedBytes = await readFile(approvedPath);
    if (sha256(approvedBytes) !== mode.sha256) throw new Error(`${modeName} responsive golden bytes drifted`);
    const approved = await sharp(approvedBytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    if (approved.info.width !== mode.width || approved.info.height !== mode.height || approved.info.channels !== 4) {
      throw new Error(`${modeName} responsive golden geometry drifted`);
    }
    const scaledStatic = await sharp(decoded.data, { raw: { width: decoded.info.width, height: decoded.info.height, channels: 4 } })
      .resize({ fit: 'inside', kernel: sharp.kernel.lanczos3, withoutEnlargement: true, width: mode.width })
      .ensureAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (scaledStatic.info.width !== mode.width || scaledStatic.info.height !== mode.height) {
      throw new Error(`${modeName} responsive static geometry drifted`);
    }
    const scaledDynamic = await sharp(dynamicSourceBytes)
      .resize({ fit: 'inside', kernel: sharp.kernel.lanczos3, withoutEnlargement: true, width: mode.width })
      .ensureAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (scaledDynamic.info.width !== mode.width || scaledDynamic.info.height !== mode.height) {
      throw new Error(`${modeName} responsive dynamic geometry drifted`);
    }

    const dynamicPack = packOwnerRegions(
      chromeSockets.sockets,
      mode,
      recipe.responsive.ownerBleedPx,
      recipe.responsive.atlasGapPx,
      (record) => record.key,
    );
    const semanticPack = packOwnerRegions(
      assemblies.semanticRegions,
      mode,
      recipe.responsive.ownerBleedPx,
      recipe.responsive.atlasGapPx,
      (record) => record.id,
    );
    const ownerRects = [
      ...[...dynamicPack.regions, ...semanticPack.regions].map((region) => region.targetRect),
      ...(recipe.dialRepairs ?? []).map((dial) => projectOwnerRect(dial.sourceRect, mode, 0)),
      ...(recipe.materialInfills ?? []).map((infill) => projectOwnerRect(infill.rect, mode, 0)),
      ...(recipe.fireFaceRepair ? [projectOwnerRect(recipe.fireFaceRepair.rect, mode, 0)] : []),
      ...(recipe.blankExtensions ?? []).map((extension) => projectOwnerRect(extension.rect, mode, 0)),
      ...(recipe.roundedWellRepairs ?? []).map((repair) => projectOwnerRect(repair.rect, mode, 0)),
    ];
    const staticRaw = Buffer.from(scaledStatic.data);
    for (let y = 0; y < mode.height; y += 1) {
      for (let x = 0; x < mode.width; x += 1) {
        if (ownerRects.some((rect) => contains(rect, x, y))) continue;
        const offset = (y * mode.width + x) * 4;
        approved.data.copy(staticRaw, offset, offset, offset + 4);
      }
    }
    const dynamicRaw = Buffer.alloc(dynamicPack.width * dynamicPack.height * 4);
    for (const region of dynamicPack.regions) {
      copyRectWithSemanticBackground(
        approved.data,
        scaledDynamic.data,
        mode.width,
        dynamicRaw,
        dynamicPack.width,
        region.targetRect,
        region.atlasRect,
        semanticPack.regions.map((semanticRegion) => semanticRegion.targetRect),
      );
    }
    const semanticRaw = Buffer.alloc(semanticPack.width * semanticPack.height * 4);
    for (const region of semanticPack.regions) {
      copyRect(approved.data, mode.width, semanticRaw, semanticPack.width, region.targetRect, region.atlasRect);
    }

    const modeOutputs = [
      {
        kind: 'static-chrome',
        raw: staticRaw,
        width: mode.width,
        height: mode.height,
        role: `state-free-static-chrome-${modeName}`,
      },
      {
        kind: 'canonical-pixi-layer',
        raw: dynamicRaw,
        width: dynamicPack.width,
        height: dynamicPack.height,
        regions: dynamicPack.regions,
        role: `canonical-dynamic-pixi-atlas-${modeName}`,
      },
      {
        kind: 'canonical-semantic-atlas',
        raw: semanticRaw,
        width: semanticPack.width,
        height: semanticPack.height,
        regions: semanticPack.regions,
        role: `canonical-preact-semantic-atlas-${modeName}`,
      },
    ];
    for (const asset of modeOutputs) {
      const file = recipe.output.responsivePattern
        .replace('{kind}', asset.kind)
        .replace('{mode}', modeName);
      const bytes = await encodeRaw(asset.raw, asset.width, asset.height, resolve(targetRoot, file), recipe.output);
      responsiveAssets.push({
        path: file,
        sha256: sha256(bytes),
        bytes: bytes.length,
        width: asset.width,
        height: asset.height,
        colorSpace: recipe.output.colorSpace,
        alpha: recipe.output.alpha,
        mode: modeName,
        role: asset.role,
        ...(asset.regions ? { regions: asset.regions } : {}),
      });
    }
  }
  const manifest = {
    schema: 'singedterra-battle-console-runtime-assets/v1',
    recipe: {
      path: DEFAULT_RECIPE,
      sha256: sha256(recipeBytes),
    },
    source: {
      path: recipe.source.path,
      sha256: recipe.source.sha256,
    },
    dynamicSource: {
      path: recipe.dynamicSource.path,
      sha256: recipe.dynamicSource.sha256,
    },
    semanticSource: {
      path: recipe.semanticSource.path,
      sha256: recipe.semanticSource.sha256,
    },
    staticRestorations: recipe.staticRestorations ?? [],
    dialRepairs: recipe.dialRepairs ?? [],
    materialInfills: recipe.materialInfills ?? [],
    fireFaceRepair: recipe.fireFaceRepair ?? null,
    blankExtensions: recipe.blankExtensions ?? [],
    roundedWellRepairs: recipe.roundedWellRepairs ?? [],
    assets: [
      {
        path: recipe.output.file,
        sha256: sha256(outputBytes),
        bytes: outputBytes.length,
        width: decoded.info.width,
        height: decoded.info.height,
        colorSpace: recipe.output.colorSpace,
        alpha: recipe.output.alpha,
        role: 'state-free-static-chrome',
      },
      {
        path: recipe.output.dynamicFile,
        sha256: sha256(dynamicOutputBytes),
        bytes: dynamicOutputBytes.length,
        width: dynamicDecoded.info.width,
        height: dynamicDecoded.info.height,
        colorSpace: recipe.output.colorSpace,
        alpha: recipe.output.alpha,
        role: 'canonical-dynamic-pixi-atlas',
      },
      {
        path: recipe.output.semanticFile,
        sha256: sha256(semanticOutputBytes),
        bytes: semanticOutputBytes.length,
        width: semanticDecoded.info.width,
        height: semanticDecoded.info.height,
        colorSpace: recipe.output.colorSpace,
        alpha: recipe.output.alpha,
        role: 'canonical-preact-semantic-atlas',
      },
      ...responsiveAssets,
    ],
  };
  await writeFile(resolve(targetRoot, recipe.output.manifest), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function parseArguments(args) {
  let recipePath = null;
  let outputRoot = null;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--recipe' && args[index + 1]) recipePath = args[++index];
    else if (argument === '--out' && args[index + 1]) outputRoot = args[++index];
    else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  return { recipePath, outputRoot };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const repositoryRoot = process.cwd();
  const manifest = await buildBattleConsoleAssets({
    repositoryRoot,
    recipePath: args.recipePath ? resolve(repositoryRoot, args.recipePath) : resolve(repositoryRoot, DEFAULT_RECIPE),
    outputRoot: args.outputRoot ? resolve(repositoryRoot, args.outputRoot) : undefined,
  });
  process.stdout.write(`${JSON.stringify({ status: 'PASS', manifest })}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
