import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const invocationRoot = process.cwd();
const repositoryRoot = existsSync(resolve(invocationRoot, '.codearbiter'))
  ? invocationRoot
  : resolve(invocationRoot, '..');

export function readBattleConsoleContract(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(repositoryRoot, '.codearbiter/contracts/battle-console', relativePath), 'utf8'));
}
