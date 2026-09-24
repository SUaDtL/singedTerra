import { describe, expect, it, vi } from 'vitest'
import type { AccountState, AccountSummary } from '../client/AccountSession'
import {
  buildAccountPanelOverlayContent,
  buildAccountPanelView,
  type AccountPanelViewOptions,
} from './AccountPanelView'

const summary: AccountSummary = {
  matchesPlayed: 8, wins: 4, progressionVersion: 1, totalXp: 1200,
  level: 3, levelXp: 200, nextLevelXp: 500,
  verifiedProgression: {
    evidence: 'verified_replay_v2', matchesPlayed: 7, wins: 3,
    progressionVersion: 1, totalXp: 1000, level: 3, levelXp: 0, nextLevelXp: 500,
  },
}

function options(overrides: Partial<AccountPanelViewOptions> = {}): AccountPanelViewOptions {
  return {
    state: { status: 'authenticated', busy: false, error: '',
      profile: { id: 'user-1', displayName: 'Ranger', summary } },
    open: false, mode: 'sign-in', onOpen: vi.fn(), onClose: vi.fn(),
    onModeChange: vi.fn(), onSubmit: vi.fn(), onSignOut: vi.fn(), ...overrides,
  }
}

function authenticated(name: string, progress: AccountSummary | null): Extract<AccountState, { status: 'authenticated' }> {
  return { status: 'authenticated', busy: false, error: '',
    profile: { id: 'user-1', displayName: name, summary: progress } }
}

describe('commander identity in account details', () => {
  it.each([
    { progress: summary, triggerOnly: false },
    { progress: null, triggerOnly: false },
    { progress: summary, triggerOnly: true },
    { progress: null, triggerOnly: true },
  ])('retains identity independently of progression and trigger-only options (%j)', ({ progress, triggerOnly }) => {
    const input = options({ state: authenticated('Ranger', progress), triggerOnly })
    const root = buildAccountPanelOverlayContent(input)!
    expect(root.querySelector('h3.account-panel__identity')?.textContent).toBe('Commander Ranger')
    expect(root.querySelectorAll('.account-panel__identity')).toHaveLength(1)
    expect(root.querySelector('.account-panel__account-trigger')).toBeNull()
    expect(root.querySelectorAll('[id]')).toHaveLength(0)
    expect([...root.querySelectorAll('button')].some((button) => button.textContent === 'Close')).toBe(false)
    const signOut = [...root.querySelectorAll('button')].find((button) => button.textContent === 'Sign out')!
    signOut.click()
    expect(input.onSignOut).toHaveBeenCalledOnce()
    expect(input.onOpen).not.toHaveBeenCalled()
    expect(input.onClose).not.toHaveBeenCalled()
  })

  it('renders an HTML-like name as text, not markup', () => {
    const name = '<img src=x onerror=alert(1)>'
    const root = buildAccountPanelOverlayContent(options({ state: authenticated(name, null) }))!
    expect(root.querySelector('.account-panel__identity')?.textContent).toBe(`Commander ${name}`)
    expect(root.querySelector('img')).toBeNull()
  })

  it('does not carry a prior name into another account or anonymous details', () => {
    const first = buildAccountPanelOverlayContent(options())!
    const second = buildAccountPanelOverlayContent(options({ state: {
      ...authenticated('Other Commander', null),
      profile: { id: 'user-2', displayName: 'Other Commander', summary: null },
    } }))!
    const signedOut = buildAccountPanelOverlayContent(options({
      state: { status: 'anonymous', busy: false, error: '' },
    }))!
    expect(first.querySelector('.account-panel__identity')?.textContent).toBe('Commander Ranger')
    expect(second.querySelector('.account-panel__identity')?.textContent).toBe('Commander Other Commander')
    expect(second.textContent).not.toContain('Ranger')
    expect(signedOut.querySelector('.account-panel__identity')).toBeNull()
    expect(signedOut.textContent).not.toContain('Other Commander')
  })

  it('preserves verified progress and keeps the masthead trigger separate', () => {
    const details = buildAccountPanelOverlayContent(options())!
    const masthead = buildAccountPanelView(options())!
    expect(details.querySelector('.account-panel__xp-value')?.textContent).toBe('0 / 500 XP')
    expect(details.querySelector('.account-panel__xp-meter')?.getAttribute('aria-label')).toBe('Level 3 XP progress')
    expect(masthead.querySelectorAll('.account-panel__account-trigger')).toHaveLength(1)
    expect(masthead.querySelector('h3.account-panel__identity')).toBeNull()
  })
})
