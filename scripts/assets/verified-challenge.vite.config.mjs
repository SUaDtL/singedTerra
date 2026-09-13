/** Isolated retained build: never load the browser config/public assets/env. */
export const RETAINED_ENTRY_ID = '\0singedterra:cq1-entry'
export const RETAINED_ENTRY = `
import { VerifiedChallengeController, replayVerifiedChallengeWithWork } from './shared/src/net/verifiedChallengeController.ts';
import { VERIFIED_CHALLENGE_CQ1 } from './shared/src/net/verifiedChallenge.ts';
import { VERIFIED_CHALLENGE_WORK_LIMITS } from './shared/src/net/verifiedChallengeWorkLimits.ts';
export const artifactApiVersion = 1;
export const editionId = 'cq1';
export const catalog = VERIFIED_CHALLENGE_CQ1;
export const workLimits = VERIFIED_CHALLENGE_WORK_LIMITS;
export function replayWithWork(transcript) { return replayVerifiedChallengeWithWork(transcript, 'cq1'); }
function freezeSnapshot(value) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) return value;
  for (const child of Object.values(value)) freezeSnapshot(child);
  return Object.freeze(value);
}
export function createController() {
  const controller = VerifiedChallengeController.create('cq1');
  return Object.freeze({
    get complete() { return controller.complete; },
    get awaitingHuman() { return controller.awaitingHuman; },
    get transcript() { return controller.transcript; },
    get events() { return controller.events; },
    get work() { return controller.work; },
    getState() {
      if (controller.complete && controller.result().terminal === 'work_limit') return null;
      // Detached snapshot: even typed-array writes cannot mutate the simulation.
      return freezeSnapshot(structuredClone(controller.engine.getState()));
    },
    applyHumanAction(action) {
      if (!action || typeof action !== 'object' || Array.isArray(action)) return false;
      const keys = Object.keys(action).sort().join(',');
      if (action.type === 'fire' ? keys !== 'type'
        : action.type === 'set_angle' ? keys !== 'angle,type'
        : action.type === 'set_power' ? keys !== 'power,type' : true) return false;
      return controller.applyHumanAction(action);
    },
    tick() { controller.tick(); },
    result() { return controller.result(); },
  });
}
`

export function retainedViteConfig(root, plugin) {
  return {
    root, configFile: false, envFile: false, publicDir: false,
    logLevel: 'silent', plugins: [plugin],
    build: {
      target: 'es2022', write: false, emptyOutDir: false, copyPublicDir: false,
      minify: false, sourcemap: false, reportCompressedSize: false,
      lib: { entry: RETAINED_ENTRY_ID, formats: ['es'], fileName: () => 'cq1.mjs' },
      rolldownOptions: { output: { codeSplitting: false } },
    },
  }
}
