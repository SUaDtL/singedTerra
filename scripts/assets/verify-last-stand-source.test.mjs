import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { verifyLastStandPayload } from './verify-last-stand.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture(windowsOrder = false) {
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
  const ordered = Object.fromEntries(Object.entries(sourceFiles).sort(([a],[b])=>windowsOrder ? (a.toLowerCase()<b.toLowerCase()?-1:1) : (a<b?-1:1)));
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
for (const [label, name] of [['source', 'Unity/Assets/model.cs'], ['tool', 'Tools/build_web.py'], ['resource owner', 'Tools/unity_build_resources.py'],
  ['vendor', 'Unity/Packages/com.unity.render-pipelines.universal/Shader.shader'],
  ['unexpected package', 'Unity/Packages/new.json']]) {
  test(`fresh export admission rejects ${label} drift`, () => {
    const { repo, root } = fixture();
    try {
      writeFileSync(join(repo, 'campaign-unity', name), 'changed');
      assert.throws(() => verifyLastStandPayload(root, repo), /source|receipt|inventory|closure/i);
    } finally { rmSync(repo, {recursive:true,force:true}); }
  });
}

test('verified complete pin admits absent ignored vendor without claiming inspection', () => {
  const {repo, root}=fixture();
  try {
    rmSync(join(repo,'campaign-unity/Unity/Packages/com.unity.render-pipelines.universal'),{recursive:true});
    assert.equal(verifyLastStandPayload(root,repo).files,4);
  } finally {rmSync(repo,{recursive:true,force:true});}
});
for (const [name, change] of [
  ['missing resource owner', (repo)=>rmSync(join(repo,'campaign-unity/Tools/unity_build_resources.py'))],
  ['missing pin', (repo)=>rmSync(join(repo,'campaign-unity/docs/last-stand-web/source-lock.json'))],
  ['changed pin', (repo)=>writeFileSync(join(repo,'campaign-unity/docs/last-stand-web/source-lock.json'),'{}')],
  ['partial vendor', (repo)=>rmSync(join(repo,'campaign-unity/Unity/Packages/com.unity.render-pipelines.universal/Shader.shader'))],
  ['wrapper source', (repo)=>writeFileSync(join(repo,'campaign-unity/Tools/make_web_entry.py'),'changed')],
]) {
  test(`fresh export admission rejects ${name}`, () => {
    const {repo,root}=fixture();
    try {change(repo);assert.throws(()=>verifyLastStandPayload(root,repo),/source|receipt|closure|inventory|wrapper|ENOENT/i);}
    finally {rmSync(repo,{recursive:true,force:true});}
  });
}

test('admits recorded Windows mixed-case inventory ordering', () => {
  const {repo, root} = fixture(true);
  try { assert.doesNotThrow(() => verifyLastStandPayload(root, repo)); }
  finally { rmSync(repo, {recursive:true, force:true}); }
});

test('current wrapper binding admits refresh without rewriting export pins', () => {
  const {repo,root}=fixture();
  try {
    const manifestPath=join(root,'asset-manifest.json');
    const manifest=JSON.parse(readFileSync(manifestPath));
    const receipt=JSON.parse(readFileSync(join(repo,'campaign-unity/docs/last-stand-web/receipt-sanitized.json')));
    const wrapperPath=join(repo,'campaign-unity/Tools/make_web_entry.py');
    writeFileSync(wrapperPath,'changed wrapper input');
    manifest.wrapperFiles={...receipt.wrapperFiles,'Tools/make_web_entry.py':{mode:'lf-text',sha256:sha('changed wrapper input')}};
    const html='<a id="last-stand-return" href="../#campaigns/last-stand">Return to Campaigns</a><a id="retry">Retry</a> refreshed';
    writeFileSync(join(root,'index.html'),html);manifest.wrapperSha256=sha(html);
    writeFileSync(manifestPath,JSON.stringify(manifest));
    assert.doesNotThrow(()=>verifyLastStandPayload(root,repo));
    writeFileSync(wrapperPath,'unbound drift');
    assert.throws(()=>verifyLastStandPayload(root,repo),/wrapper source/);
  } finally {rmSync(repo,{recursive:true,force:true});}
});
