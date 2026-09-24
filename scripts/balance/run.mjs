/** WB-01–WB-03 CLI. Usage: npm run balance:weapons -- --out=/tmp/balance.json */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBalance } from './weaponBalance.mjs';
import { runShieldExchanges } from './shieldExchange.mjs';
import { runOpeningShieldStudy } from './openingShield.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const usage = 'Usage: npm run balance:weapons -- [--study=single-salvo|shield-exchange|opening-shield] [--scenario=ID] [--weapon=ID] [--out=FILE]';
try {
  const args = {};
  for (const argument of process.argv.slice(2)) {
    if (argument === '--help') { console.log(usage); process.exit(0); }
    const match = /^--(study|scenario|weapon|out)=(.+)$/.exec(argument);
    if (!match || args[match[1]]) throw new Error(`Invalid or repeated option: ${argument}`);
    args[match[1]] = match[2];
  }
  if (args.study && !['single-salvo', 'shield-exchange', 'opening-shield'].includes(args.study)) throw new Error(`Unknown study: ${args.study}`);
  if (args.out && existsSync(resolve(args.out))) throw new Error('Output already exists; choose a new report path');
  const inputs = [];
  const collect = (dir) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) collect(path);
      else if (/\.(ts|mjs)$/.test(path)) inputs.push(path);
    }
  };
  collect('shared/src');
  collect('scripts/balance');
  inputs.sort();
  const hash = () => createHash('sha256'); // Build/source provenance only; never reward evidence.
  const fingerprint = () => hash().update(inputs.map((path) => (
    `${path}\0${hash().update(readFileSync(join(root, path))).digest('hex')}\n`
  )).join('')).digest('hex');
  const sourceSha256 = fingerprint();
  const study = args.study === 'opening-shield' ? runOpeningShieldStudy
    : args.study === 'shield-exchange' ? runShieldExchanges : runBalance;
  const report = study({
    ...(args.scenario ? { scenarioIds: [args.scenario] } : {}),
    ...(args.weapon ? { weaponIds: [args.weapon] } : {}),
    onProgress: (scenario, weapon) => console.error(`${scenario}: ${weapon}`),
  });
  if (fingerprint() !== sourceSha256) throw new Error('Source changed during measurement; refusing a mixed report');
  report.provenance = { sourceSha256, inputFiles: inputs, node: process.version,
    platform: process.platform, architecture: process.arch };
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) writeFileSync(resolve(args.out), output, { flag: 'wx' });
  else process.stdout.write(output);
  console.error(`Completed ${report.rows?.length ?? report.pairs.length} comparisons; no live balance values changed.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  console.error(usage);
  process.exitCode = 1;
}
