import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assertHistoricalShopRuntime,runLastStandShopJourney} from '../../e2e/helpers/lastStandJourney.mjs';

const historicalFixture=()=>({schema:'singedterra-last-stand-export/v2',status:'pass',complete:true,
  sourceFiles:{'Unity/Assets/Scripts/EncounterModel.cs':{sha256:'fixture-only'}}});

test('archived Shop contract admits only an explicit pre-wave source inventory',()=>{
  assert.doesNotThrow(()=>assertHistoricalShopRuntime(historicalFixture()));
  for(const mutate of [r=>r.schema='unknown',r=>r.status='failed',r=>r.complete=false,
    r=>delete r.sourceFiles,r=>r.sourceFiles={},r=>r.sourceFiles=[]]) {
    const receipt=historicalFixture();mutate(receipt);assert.throws(()=>assertHistoricalShopRuntime(receipt));
  }
  const wave=historicalFixture();wave.sourceFiles['Unity/Assets/Scripts/LastStandWaveCatalog.cs']={sha256:'fixture-only'};
  assert.throws(()=>assertHistoricalShopRuntime(wave),/cannot qualify current wave gameplay.*last-stand-first-session/s);
});

test('actual archived Shop entry refuses the current package before browser or evidence writes',async()=>{
  const receipt=JSON.parse(readFileSync(new URL('../../campaign-unity/docs/last-stand-web/receipt-sanitized.json',import.meta.url)));
  assert.ok(receipt.sourceFiles['Unity/Assets/Scripts/LastStandWaveCatalog.cs'],'Test is bound to a current wave package');
  let launches=0;
  const chromium={launch(){launches++;throw new Error('Browser must not launch');}};
  for(const fitting of ['launcher','repair'])await assert.rejects(
    runLastStandShopJourney({baseURL:'http://127.0.0.1:1/',chromium,fitting}),
    /Historical v3\/manual-Claim Shop journey cannot qualify current wave gameplay/);
  assert.equal(launches,0);
});
