import {pathToFileURL} from 'node:url';
import {LAST_STAND_VIEWPORTS} from '../../e2e/helpers/lastStandMatrix.mjs';

export function browserMatrix() {
  return {include:[
    ...Array.from({length:4},(_,i)=>({lane:`core-${i+1}`,suite:'core',shard:i+1,journey_shard:''})),
    {lane:'product',suite:'product',shard:0,journey_shard:''},
    {lane:'last-stand-tier',suite:'tier',shard:0,journey_shard:''},
    ...LAST_STAND_VIEWPORTS.map((_,i)=>({lane:`last-stand-${i+1}`,suite:'campaigns',shard:0,
      journey_shard:`${i+1}/${LAST_STAND_VIEWPORTS.length}`,journey_section:'lifecycle'})),
    {lane:'last-stand-11',suite:'campaigns',shard:0,journey_shard:'',journey_section:'recovery'},
    {lane:'last-stand-12',suite:'campaigns',shard:0,journey_shard:'',journey_section:'entry'},
  ]};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)
  process.stdout.write(`browser_matrix=${JSON.stringify(browserMatrix())}\n`);
