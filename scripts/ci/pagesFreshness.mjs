import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const FULL_SHA = /^[0-9a-f]{40}$/;
const RUN_ID = /^[1-9][0-9]*$/;
const MAX_DEPLOY_META_BYTES = 4096;
const short = (value) => FULL_SHA.test(value ?? '') ? value.slice(0, 12) : '<invalid>';

function assertSha(value, label) {
  if (!FULL_SHA.test(value ?? '')) throw new Error(`Invalid ${label} SHA.`);
}

function assertRunId(value) {
  if (!RUN_ID.test(value ?? '')) throw new Error('Invalid Pages run ID.');
}

export function assertCurrentMain(candidateSha, currentMainSha) {
  assertSha(candidateSha, 'source');
  assertSha(currentMainSha, 'main');
  if (candidateSha !== currentMainSha) {
    throw new Error(
      `Refusing stale Pages deploy: run ${short(candidateSha)} != main ${short(currentMainSha)}.`,
    );
  }
}

export function serializeDeployMeta(sha, runId) {
  assertSha(sha, 'deployment');
  assertRunId(runId);
  return `${JSON.stringify({ sha, runId })}\n`;
}

export function assertDeployMeta(rawJson, expectedSha, expectedRunId) {
  assertSha(expectedSha, 'expected deployment');
  assertRunId(expectedRunId);
  if (typeof rawJson !== 'string' || Buffer.byteLength(rawJson, 'utf8') > MAX_DEPLOY_META_BYTES) {
    throw new Error('Invalid Pages deployment metadata size.');
  }
  let meta;
  try {
    meta = JSON.parse(rawJson);
  } catch {
    throw new Error('Invalid Pages deployment metadata.');
  }
  if (!meta || Array.isArray(meta) || typeof meta !== 'object') {
    throw new Error('Invalid Pages deployment metadata.');
  }
  const keys = Object.keys(meta).sort();
  if (keys.length !== 2 || keys[0] !== 'runId' || keys[1] !== 'sha') {
    throw new Error('Invalid Pages deployment metadata shape.');
  }
  if (typeof meta.sha !== 'string' || typeof meta.runId !== 'string') {
    throw new Error('Invalid Pages deployment metadata types.');
  }
  assertCurrentMain(meta.sha, expectedSha);
  assertRunId(meta.runId);
  if (meta.runId !== expectedRunId) throw new Error('Served Pages run ID does not match.');
}

async function main([mode, ...args]) {
  if (mode === 'check') return assertCurrentMain(args[0], args[1]);
  if (mode === 'write') {
    if (!args[0]) throw new Error('Missing Pages metadata output path.');
    return writeFileSync(args[0], serializeDeployMeta(args[1], args[2]), 'utf8');
  }
  if (mode === 'verify') {
    let raw = '';
    let bytesRead = 0;
    for await (const chunk of process.stdin) {
      bytesRead += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, 'utf8');
      if (bytesRead > MAX_DEPLOY_META_BYTES) {
        throw new Error('Invalid Pages deployment metadata size.');
      }
      raw += chunk;
    }
    return assertDeployMeta(raw, args[0], args[1]);
  }
  throw new Error('Unknown Pages freshness command.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Pages freshness check failed.');
    process.exitCode = 1;
  });
}
