import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { verifyLastStandPayload } from './verify-last-stand.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function fixture() {
  const repo = mkdtempSync(join(tmpdir(), 'last-stand-source-'));
  const root = join(repo, 'client/public/last-stand');
  mkdirSync(join(root, 'Build'), { recursive: true });
  const html = '<a id="last-stand-return" href="../#campaigns/last-stand">Return to Campaigns</a><a id="retry">Retry</a>';
  writeFileSync(join(root, 'index.html'), html);
  const files = {};
  for (const suffix of ['loader.js', 'framework.js', 'data', 'wasm']) {
    const name = `Build/game.${suffix}`; writeFileSync(join(root, name), suffix); files[name] = sha(suffix);
  }
  for (const name of ['Unity/Assets/model.cs', 'Unity/ProjectSettings/settings.asset',
    'Unity/Packages/manifest.json', 'Unity/Packages/com.unity.render-pipelines.universal/package.json',
    'Unity/Packages/com.unity.render-pipelines.universal/Shader.shader', 'Tools/build_web.py','Tools/unity_shader_log.py','Tools/unity_build_resources.py','Tools/make_web_entry.py','Tools/web-index-template.html']) {
    const path = join(repo, 'campaign-unity', name); mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, name.endsWith('package.json') ? '{"version":"17.3.0"}' : 'source\n');
  }
  const sourceFiles = {};
  function inventory(dir) {
    for (const entry of readdirSync(dir, {withFileTypes:true})) {
      const path=join(dir,entry.name);
      if(entry.isDirectory()) inventory(path);
      else sourceFiles[path.slice(join(repo,'campaign-unity').length+1).replaceAll('\\','/')] = {mode:'lf-text',sha256:sha(readFileSync(path,'utf8').replaceAll('\r\n','\n'))};
    }
  }
  inventory(join(repo,'campaign-unity'));
  const ordered = Object.fromEntries(Object.entries(sourceFiles).sort(([a],[b])=>a<b?-1:1));
  const closure = {roots:['Unity/Assets','Unity/ProjectSettings','Unity/Packages'],explicitFiles:['Tools/build_web.py','Tools/unity_shader_log.py','Tools/unity_build_resources.py'],files:Object.fromEntries(Object.entries(ordered).filter(([name])=>!['Tools/make_web_entry.py','Tools/web-index-template.html'].includes(name))),sha256:sha(JSON.stringify(ordered))};
  closure.sha256=sha(JSON.stringify(closure.files));
  const wrapperFiles=Object.fromEntries(Object.entries(ordered).filter(([name])=>['Tools/make_web_entry.py','Tools/web-index-template.html'].includes(name)));
  const toolchain={editorVersion:'6000.3.27f2',urpVersion:'17.3.0',files:{'Unity.exe':{mode:'raw',sha256:sha('editor')}}};
  toolchain.sha256=sha(JSON.stringify(toolchain.files));
  const receipt={schema:'singedterra-last-stand-export/v2',status:'pass',complete:true,build:'Web-fixture',
    scene:'Assets/Scenes/LastStandPrototype.unity',sourceBeforeSha256:closure.sha256,sourceAfterSha256:closure.sha256,
    sourceFiles:closure.files,wrapperFiles,toolchain,artifacts:{...files,'index.html':sha(html)},wrapperSha256:sha(html)};
  const docs=join(repo,'campaign-unity/docs/last-stand-web'); mkdirSync(docs,{recursive:true});
  const receiptText=JSON.stringify(receipt); writeFileSync(join(docs,'receipt-sanitized.json'),receiptText);
  const vendorFiles=Object.fromEntries(Object.entries(ordered).filter(([name])=>name.startsWith('Unity/Packages/com.unity.render-pipelines.universal/')));
  const lock={schema:'singedterra-last-stand-source/v2',complete:true,closure,wrapperFiles,toolchain,
    receiptSha256:sha(receiptText),vendor:{path:'Unity/Packages/com.unity.render-pipelines.universal',version:'17.3.0',sha256:sha(JSON.stringify(vendorFiles))}};
  const lockText=JSON.stringify(lock); writeFileSync(join(docs,'source-lock.json'),lockText);
  writeFileSync(join(root, 'asset-manifest.json'), JSON.stringify({schema:'singedterra-last-stand-web/v1',
    source:{build:'Web-fixture',receipt:'campaign-unity/docs/last-stand-web/receipt-sanitized.json',receiptSha256:sha(receiptText),
      sourceLockSha256:sha(lockText),sourceInventorySha256:closure.sha256,originalIndexSha256:sha(html)},
    wrapperSha256:sha(html),files}));
  return {repo, root, files};
}
test('verified Last Stand payload accepts its exact assets', () => {
  const { root, repo } = fixture();
  try { assert.equal(verifyLastStandPayload(root, repo).files, 4); }
  finally { rmSync(repo, { recursive: true, force: true }); }
});

test('verified Last Stand payload rejects missing and corrupted runtime bytes', () => {
  const { root, repo } = fixture();
  try {
    writeFileSync(join(root, 'Build/game.wasm'), 'tampered');
    assert.throws(() => verifyLastStandPayload(root, repo), /digest/i);
    rmSync(join(root, 'Build/game.wasm'));
    assert.throws(() => verifyLastStandPayload(root, repo), /missing/i);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('verified Last Stand payload rejects a changed return route', () => {
  const { root, repo } = fixture();
  try {
    writeFileSync(join(root, 'index.html'), '<a href="../">Return</a>');
    assert.throws(() => verifyLastStandPayload(root, repo), /wrapper|return/i);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('verified Last Stand payload rejects a manifest without a fresh complete receipt', () => {
  const { root, repo } = fixture();
  try {
    rmSync(join(repo,'campaign-unity/docs/last-stand-web/receipt-sanitized.json'));
    assert.throws(() => verifyLastStandPayload(root, repo), /receipt|source/i);
  }
  finally { rmSync(repo, { recursive: true, force: true }); }
});
