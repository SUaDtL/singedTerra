// Read the generated projection only after binding it to its native policy source.
// Native knowledge remains the owner; CI does not interpret or rewrite its HTML.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const sourcePath = '.codearbiter/context/security-controls.html';
const receiptPath = 'scripts/checks/fixtures/security-controls-policy.json';

export async function readSecurityPolicy(root) {
  const receipt = JSON.parse(await readFile(join(root, receiptPath), 'utf8'));
  if (receipt.schema !== 'singedterra.security-policy-export/v1'
    || receipt.artifactId !== 'CTX-SECURITY-CONTROLS'
    || receipt.source?.path !== sourcePath
    || !/^[a-f0-9]{64}$/.test(receipt.source?.sha256 ?? '')
    || !/^[a-f0-9]{64}$/.test(receipt.modelSha256 ?? '')
    || !Array.isArray(receipt.records) || receipt.records.length === 0) {
    throw new Error('Invalid native security-policy projection');
  }
  const nativeBytes = await readFile(join(root, sourcePath));
  const actual = createHash('sha256').update(nativeBytes).digest('hex');
  if (actual !== receipt.source.sha256) {
    throw new Error('Stale native security-policy projection: regenerate through export_security_policy.py');
  }
  const ids = new Set();
  for (const record of receipt.records) {
    if (typeof record?.id !== 'string' || !record.id || ids.has(record.id)
      || typeof record.statement !== 'string' || !record.statement.trim()) {
      throw new Error('Invalid or duplicate native security-policy record');
    }
    ids.add(record.id);
  }
  return receipt.records.map((record) => record.statement).join('\n\n');
}
