import { describe, expect, it } from 'vitest';
import { readBattleConsoleContract } from './contractTestSupport';
import {
  battleConsoleChromeSockets,
  battleConsoleSemanticNodes,
  battleConsoleSemanticRegions,
} from './runtimeData';

const semanticOwners = readBattleConsoleContract('topology/semantic-owners.json') as any;
const chromeSockets = readBattleConsoleContract('topology/chrome-sockets.json') as any;
const assemblies = readBattleConsoleContract('reference/assemblies.json') as any;

const semanticRecordFields = [
  'accessibleName', 'checked', 'current', 'disabled', 'expanded', 'focusable', 'live', 'modal',
  'parentKey', 'pressed', 'role', 'rootKey', 'tabIndex', 'tag', 'visibleText',
] as const;

describe('battle-console runtime data projection', () => {
  it('retains exactly the semantic fields consumed by the current semantic interpreter', () => {
    expect(battleConsoleSemanticNodes).toEqual(semanticOwners.nodes.map((node: any) => ({
      stableKey: node.stableKey,
      sourceRecord: Object.fromEntries(semanticRecordFields.map((field) => [field, node.sourceRecord[field]])),
    })));
  });

  it('retains only the geometry needed by semantic atlases and non-interactive Pixi sockets', () => {
    expect(battleConsoleSemanticRegions).toEqual(assemblies.semanticRegions.map((region: any) => ({
      id: region.id,
      rect: region.rect,
    })));
    expect(battleConsoleChromeSockets).toEqual(chromeSockets.sockets.map((socket: any) => ({
      key: socket.key,
      rect: socket.rect,
    })));
  });
});
