import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadAndValidateManifest } from './backendRelease.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`
  :value && typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  :JSON.stringify(value);
class SafeReleaseError extends Error {}
const fail=message=>{throw new SafeReleaseError(message);};
const object=value=>value && typeof value==='object' && !Array.isArray(value);
const validRef=value=>typeof value==='string' && /^[a-z]{20}$/.test(value);
const cliEnvironment=credentials=>Object.fromEntries(Object.entries(process.env).filter(([key])=>
  !/^(?:REVIEWED_CONFIG_PROPOSAL|GIT_.*|NODE_.*)$/i.test(key) && (!/^SUPABASE_/i.test(key) ||
    (credentials && ['SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD'].includes(key)))));

export function prepareProposal(proposal,binding) {
  if(!object(binding) || !/^[a-f0-9]{40}$/.test(binding.sourceSha??'') ||
    !/^[a-f0-9]{64}$/.test(binding.manifestSha256??'') || !/^[a-f0-9]{64}$/.test(binding.configSha256??'') ||
    binding.cliVersion!=='3.0.0' || !validRef(binding.projectRef))fail('Invalid reviewed config binding');
  if(!object(proposal) || proposal.schema_version!==1 || typeof proposal.config_schema!=='string' || !object(proposal.target) ||
    !object(proposal.scope) || !object(proposal.counts))fail('Invalid config diff schema');
  if(proposal.target.kind!=='linked' || proposal.target.project_ref!==binding.projectRef || proposal.target.branch!==undefined ||
    proposal.target.environment!=='production' || proposal.target.local_scope!=='base' ||
    Object.keys(proposal.target).some(key=>!['kind','project_ref','environment','local_scope','project_name','parent_project_ref'].includes(key)))
    fail('Config diff target is not the reviewed production project');
  const requiredScope=['api','auth','database','pooler','realtime','storage'];
  if(!Array.isArray(proposal.scope.present) || proposal.scope.present.length!==requiredScope.length ||
    requiredScope.some(key=>!proposal.scope.present.includes(key)) || !Array.isArray(proposal.scope.missing) ||
    proposal.scope.missing.length || !Array.isArray(proposal.masked) || proposal.masked.length ||
    !Array.isArray(proposal.unmanaged) || proposal.unmanaged.length)fail('Incomplete config diff: missing, masked or unmanaged fields');
  if(!Array.isArray(proposal.changes) || proposal.changes.length>10000 ||
    proposal.changes.some(change=>!object(change) || !Array.isArray(change.path) || !change.path.length ||
      change.path.some(part=>typeof part!=='string'||!part.length) || !['update','local_only','remote_only'].includes(change.class) ||
      typeof change.declared!=='boolean' || !Object.hasOwn(change,'local') || !Object.hasOwn(change,'remote')))fail('Invalid config diff changes');
  for(const key of ['update','local_only','remote_only'])if(proposal.counts[key]!==proposal.changes.filter(change=>change.class===key).length)fail('Config diff count mismatch');
  if(proposal.counts.total!==proposal.changes.length)fail('Config diff count mismatch');
  if(proposal.target.parent_project_ref!==undefined && proposal.target.parent_project_ref!==binding.projectRef)fail('Config diff target parent mismatch');
  const stableProposal={...proposal,target:{kind:proposal.target.kind,project_ref:proposal.target.project_ref,
    environment:proposal.target.environment,local_scope:proposal.target.local_scope}};
  delete stableProposal.message;
  const result=canonical({format:'singedterra-reviewed-config-v1',binding,proposal:stableProposal});
  if(Buffer.byteLength(result,'utf8')>32000)fail('Config review proposal exceeds the protected secret limit');
  return result;
}

export function verifyProposal(proposal,binding,expected) {
  if(typeof expected!=='string' || !expected.length || Buffer.byteLength(expected,'utf8')>32000)fail('Missing or oversized reviewed config proposal');
  let parsed;try{parsed=JSON.parse(expected);}catch{fail('Invalid reviewed config proposal');}
  const actual=prepareProposal(proposal,binding);
  if(actual!==canonical(parsed))fail('Config diff does not match the reviewed proposal');
  return true;
}

export function executeReviewedRelease({mode,binding,reviewedProposal,run,revalidate=()=>{},functionNames=[]}) {
  if(!['preflight','migrations','config','functions'].includes(mode))fail('Invalid reviewed release mode');
  const remote=`--remote=${binding.projectRef}`;
  if(mode==='functions') {
    if(!validRef(binding.projectRef) || !functionNames.length ||
      functionNames.some(name=>!/^[a-z][a-z0-9_]*$/.test(name)))fail('Invalid reviewed functions release');
    revalidate();
    try {run(['functions','deploy',...functionNames,'--use-api','--yes',remote]);}
    catch {fail('Backend mutation started but failed; its outcome may be partial or unknown');}
    return;
  }
  let raw,proposal;
  try {raw=run(['config','diff','--output-format','json',remote]);} catch {fail('Unable to obtain reviewed config diff');}
  if(!Buffer.isBuffer(raw) || !raw.length || raw.length>2_000_000)fail('Invalid config diff size');
  try {proposal=JSON.parse(raw.toString('utf8'));} catch {fail('Invalid config diff JSON');}
  verifyProposal(proposal,binding,reviewedProposal);
  if(mode!=='preflight')revalidate();
  try {
    if(mode==='migrations')run(['db','push','--yes',remote]);
    if(mode==='config')run(['config','push','--yes',remote]);
  } catch {fail('Backend mutation started but failed; its outcome may be partial or unknown');}
  return true;
}

function context() {
  const projectRef=process.env.SUPABASE_PROJECT_REF;
  if(!validRef(projectRef))fail('A valid explicit SUPABASE_PROJECT_REF is required');
  const git=(args,options={})=>execFileSync('git',['-c','core.fsmonitor=false',...args],{cwd:root,env:cliEnvironment(false),...options});
  const sourceSha=git(['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const boundFiles=['package.json','package-lock.json','scripts/ci/backendRelease.mjs','scripts/ci/reviewedConfigDiff.mjs','supabase/backend-release-manifest.json','supabase/config.toml'];
  for(const path of boundFiles) {
    git(['cat-file','-e',`HEAD:${path}`],{stdio:'ignore'});
    const stat=lstatSync(join(root,path));
    if(stat.isSymbolicLink() || !stat.isFile())fail('A reviewed release input is not a regular file');
  }
  git(['diff','--quiet','--no-ext-diff','--no-textconv','HEAD','--',...boundFiles],{stdio:'ignore'});
  for(const directory of [root,join(root,'supabase')]) {
    if(readdirSync(directory).some(name=>/^\.env(?:\..+)?$/i.test(name) && name!=='.env.example'))fail('Project environment files must be absent during a reviewed release');
  }
  try {lstatSync(join(root,'supabase','config.json'));fail('Alternate config.json is not admitted');}
  catch(error){if(error instanceof SafeReleaseError)throw error;if(error?.code!=='ENOENT')fail('Unable to check alternate config');}
  const release=loadAndValidateManifest(root);
  const cliVersion=release.manifest.supabaseCliVersion;
  const cli=join(root,'node_modules/supabase/dist/supabase.js');
  const actualVersion=execFileSync(process.execPath,[cli,'--version'],{cwd:root,env:cliEnvironment(false),encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  if(actualVersion!==cliVersion)fail('Installed Supabase CLI does not match the release manifest');
  return {binding:{sourceSha,manifestSha256:release.manifestSha256,configSha256:release.manifest.config.sha256,cliVersion,projectRef},cli,
    functionNames:release.manifest.functions.map(item=>item.name)};
}

function main() {
  const mode=process.argv[2],{binding,cli,functionNames}=context();
  const environment=cliEnvironment(true);
  const run=args=>{try{return execFileSync(process.execPath,[cli,...args,'--workdir',root],{cwd:root,env:environment,stdio:['ignore','pipe','pipe'],maxBuffer:2_000_000,timeout:120_000});}
    catch{fail('Supabase CLI command failed');}};
  if(mode==='preview') {
    if(!process.stdout.isTTY || process.env.CI)fail('Review the proposal only in a private interactive terminal');
    let proposal;
    try {proposal=JSON.parse(run(['config','diff','--output-format','json',`--remote=${binding.projectRef}`]).toString('utf8'));}
    catch {fail('Unable to obtain the config review proposal');}
    const reviewedProposal=prepareProposal(proposal,binding);
    process.stdout.write(`Review privately:\n${JSON.stringify({binding,proposal},null,2)}\n\nAfter review, store this exact single-line proposal as the protected secret:\n${reviewedProposal}\n`);
    return;
  }
  const revalidate=()=>{
    const current=context();
    if(canonical(current.binding)!==canonical(binding) || canonical(current.functionNames)!==canonical(functionNames))
      fail('Reviewed release inputs changed before mutation');
  };
  executeReviewedRelease({mode,binding,reviewedProposal:process.env.REVIEWED_CONFIG_PROPOSAL,run,functionNames,revalidate});
  process.stdout.write(mode==='functions'?'Validated function deployment completed.\n':'Reviewed config preflight passed.\n');
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href)try{main();}catch(error){
  process.stderr.write(`Backend release: ${error instanceof SafeReleaseError?error.message:'local verification failed'}\n`);process.exitCode=1;
}
