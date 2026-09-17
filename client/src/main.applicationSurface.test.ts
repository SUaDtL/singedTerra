import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8');

function functionBody(name: string, nextName: string): string {
  const start = source.indexOf(`async function ${name}`);
  const end = source.indexOf(`async function ${nextName}`, start + 1);
  if (start < 0 || end < 0) throw new Error(`Missing ${name}/${nextName} source boundary`);
  return source.slice(start, end);
}

describe('main application-surface ownership', () => {
  it('routes session acquisition through the generation-bound application launch lifecycle', () => {
    expect(source).toContain('new ApplicationSurfaceController({ battle: battleRoot, pregame: lobbyRoot }')
    expect(source).toContain('new ApplicationLaunchLifecycle')
    expect(functionBody('startGame', 'startCampaignTransition')).toContain('applicationLaunch.launch({')
  })

  it('does not destroy or re-render preparation from the acquisition callbacks', () => {
    const startGame = functionBody('startGame', 'startCampaignTransition')
    const prepareStart = startGame.indexOf('prepareAcquisition:')
    const acquireStart = startGame.indexOf('acquireClient:', prepareStart)
    const failureStart = startGame.indexOf('onAcquisitionFailure:', acquireStart)
    const constructionStart = startGame.indexOf('constructRenderer:', failureStart)
    expect(prepareStart).toBeGreaterThan(-1)
    expect(acquireStart).toBeGreaterThan(prepareStart)
    expect(failureStart).toBeGreaterThan(acquireStart)
    expect(constructionStart).toBeGreaterThan(failureStart)
    expect(startGame.slice(prepareStart, constructionStart)).not.toContain('lobby.hide()')
    expect(startGame.slice(prepareStart, constructionStart)).not.toContain('lobby.show()')
    expect(startGame.slice(prepareStart, constructionStart)).not.toContain('showNetworkRecovery')
  })

  it('returns quit and campaign return paths through the same pregame transition helper', () => {
    expect(source).toContain('function returnToPregame(')
    expect(source).toMatch(/hud\.onQuit\([\s\S]*?returnToPregame\(/)
    expect(source).toMatch(/hud\.onVerifiedChallengeReturn\?\.\([\s\S]*?returnToPregame\(/)
  })
})
