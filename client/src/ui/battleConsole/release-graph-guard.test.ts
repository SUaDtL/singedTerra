import { describe, expect, it } from 'vitest';
import { createReleaseArchiveGuard } from '../../../vite.config';

describe('battle-console production graph guard', () => {
  it('rejects a production chunk that reaches an archived battle-console contract', () => {
    const guard = createReleaseArchiveGuard();
    expect(() => guard.assertChunkModules([
      'client/src/ui/battleConsole/BattleConsoleRoot.tsx',
      '.codearbiter/contracts/battle-console/state/dynamic-appearance.json',
    ])).toThrow('battle-console archive reached the production graph');
  });

  it('allows the explicit runtime projection and test fixture isolation does not create a release exception', () => {
    const guard = createReleaseArchiveGuard();
    expect(() => guard.assertChunkModules([
      'client/src/ui/battleConsole/runtimeData.ts',
      'client/src/ui/battleConsole/BattleConsoleRoot.tsx',
    ])).not.toThrow();
  });
});
