import { describe, expect, it, vi } from 'vitest'
import type { AccountState, AccountSummary } from '../client/AccountSession'
import {
  buildAccountPanelOverlayContent,
  buildAccountPanelView,
  type AccountPanelViewOptions,
} from './AccountPanelView'

const validSummary: AccountSummary = {
  matchesPlayed: 8,
  wins: 4,
  progressionVersion: 1,
  totalXp: 1200,
  level: 3,
  levelXp: 200,
  nextLevelXp: 500,
  verifiedProgression: {
    evidence: 'verified_replay_v1',
    matchesPlayed: 7,
    wins: 3,
    progressionVersion: 1,
    totalXp: 1000,
    level: 3,
    levelXp: 0,
    nextLevelXp: 500,
  },
}

const casualSummary: AccountSummary = {
  matchesPlayed: 8,
  wins: 4,
  progressionVersion: 1,
  totalXp: 1200,
  level: 3,
  levelXp: 200,
  nextLevelXp: 500,
  verifiedProgression: {
    evidence: 'verified_replay_v1',
    matchesPlayed: 0,
    wins: 0,
    progressionVersion: 1,
    totalXp: 0,
    level: 1,
    levelXp: 0,
    nextLevelXp: 500,
  },
}

const divergentSummary: AccountSummary = {
  matchesPlayed: 50,
  wins: 45,
  progressionVersion: 1,
  totalXp: 9500,
  level: 20,
  levelXp: 0,
  nextLevelXp: 500,
  verifiedProgression: {
    evidence: 'verified_replay_v1',
    matchesPlayed: 4,
    wins: 1,
    progressionVersion: 1,
    totalXp: 500,
    level: 2,
    levelXp: 0,
    nextLevelXp: 500,
  },
}

function options(overrides: Partial<AccountPanelViewOptions> = {}): AccountPanelViewOptions {
  return {
    state: { status: 'anonymous', busy: false, error: '' },
    open: false,
    mode: 'sign-in',
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onModeChange: vi.fn(),
    onSubmit: vi.fn(),
    onSignOut: vi.fn(),
    ...overrides,
  }
}

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const match = [...root.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === text)
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing ${text} button`)
  return match
}

function progressPairs(root: HTMLElement): Array<[string, string]> {
  const list = root.querySelector('dl.account-panel__progress')
  if (!(list instanceof HTMLDListElement)) throw new Error('Missing progress list')
  return [...list.children].map((group) => {
    const [term, value] = [...group.children]
    if (!(term instanceof HTMLElement) || term.tagName !== 'DT') {
      throw new Error('Progress item must begin with a definition term')
    }
    if (!(value instanceof HTMLElement) || value.tagName !== 'DD') {
      throw new Error('Progress item must end with a definition value')
    }
    return [term.textContent ?? '', value.textContent ?? '']
  })
}

describe('buildAccountPanelView', () => {
  it('omits the account surface when Supabase is unavailable', () => {
    const state: AccountState = { status: 'unavailable', busy: false, error: '' }
    expect(buildAccountPanelView(options({ state }))).toBeNull()
  })

  it('renders a compact anonymous affordance and routes opening', () => {
    const onOpen = vi.fn()
    const root = buildAccountPanelView(options({ onOpen }))
    if (!root) throw new Error('Expected account affordance')

    expect(root.className).toBe('account-panel')
    button(root, 'Account').click()
    expect(onOpen).toHaveBeenCalledOnce()
    expect(root.querySelector('form')).toBeNull()
  })

  it('renders labelled sign-in controls with safe autocomplete and clears the password on submit', () => {
    const onSubmit = vi.fn()
    const root = buildAccountPanelOverlayContent(options({ open: true, onSubmit }))
    if (!root) throw new Error('Expected account panel')
    const form = root.querySelector('form')
    const email = root.querySelector<HTMLInputElement>('input[type="email"]')
    const password = root.querySelector<HTMLInputElement>('input[type="password"]')
    if (!(form instanceof HTMLFormElement) || !email || !password) throw new Error('Missing account form')

    expect(root.getAttribute('aria-label')).toBe('Player account')
    expect(email.autocomplete).toBe('email')
    expect(password.autocomplete).toBe('current-password')
    email.value = 'ranger@example.test'
    password.value = 'not-a-real-secret'
    form.requestSubmit()

    expect(onSubmit).toHaveBeenCalledWith('sign-in', {
      email: 'ranger@example.test',
      password: 'not-a-real-secret',
    })
    expect(password.value).toBe('')
  })

  it('keeps overlay content free of the masthead trigger and duplicate close action', () => {
    const state: AccountState = {
      status: 'authenticated',
      busy: false,
      error: '',
      profile: { id: 'user-1', displayName: 'Ranger', summary: validSummary },
    }
    const root = buildAccountPanelOverlayContent(options({ open: true, state }))
    if (!root) throw new Error('Expected account panel')

    expect(root.querySelector('.account-panel__account-trigger')).toBeNull()
    expect([...root.querySelectorAll('button')].filter((candidate) => candidate.textContent === 'Close')).toHaveLength(0)
  })

  it('renders create-account display name and routes mode changes', () => {
    const onModeChange = vi.fn()
    const root = buildAccountPanelOverlayContent(options({
      open: true,
      mode: 'create',
      onModeChange,
    }))
    if (!root) throw new Error('Expected account panel')

    const displayName = root.querySelector<HTMLInputElement>('input[name="displayName"]')
    const password = root.querySelector<HTMLInputElement>('input[type="password"]')
    expect(displayName?.maxLength).toBe(24)
    expect(displayName?.autocomplete).toBe('nickname')
    expect(password?.autocomplete).toBe('new-password')
    button(root, 'Sign in').click()
    expect(onModeChange).toHaveBeenCalledWith('sign-in')
  })

  it('disables busy submission and renders errors as text', () => {
    const state: AccountState = {
      status: 'anonymous',
      busy: true,
      error: '<img src=x onerror=alert(1)>',
    }
    const root = buildAccountPanelOverlayContent(options({ open: true, state }))
    if (!root) throw new Error('Expected account panel')

    expect(button(root, 'Working…').disabled).toBe(true)
    expect(root.querySelector('.account-panel__error')?.textContent)
      .toBe('<img src=x onerror=alert(1)>')
    expect(root.querySelector('img')).toBeNull()
  })

  it('keeps the full commander dossier and next milestone visible while authenticated details are collapsed', () => {
    const onOpen = vi.fn()
    const state: AccountState = {
      status: 'authenticated',
      busy: false,
      error: '',
      profile: { id: 'user-1', displayName: 'Ranger', summary: validSummary },
    }
    const root = buildAccountPanelView(options({ state, onOpen }))
    if (!root) throw new Error('Expected authenticated account panel')

    const record = root.querySelector<HTMLElement>('section.account-panel__record')
    const trigger = record?.querySelector<HTMLButtonElement>('.account-panel__account-trigger')
    const meter = record?.querySelector<HTMLProgressElement>('progress')
    if (!record || !trigger) throw new Error('Expected collapsed commander dossier disclosure')
    expect(trigger.classList.contains('account-panel__account-trigger')).toBe(true)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-label'))
      .toBe('Commander Ranger, R-03 Bombardier, Level 3, 500 XP to Level 4, next rank Artillerist at Level 5. Player account')
    expect(record?.getAttribute('aria-label')).toBe('Commander dossier')
    expect(record?.querySelector('h2')?.textContent).toBe('COMMANDER DOSSIER')
    expect(trigger?.querySelector('.account-panel__commander-name')?.textContent).toBe('Ranger')
    expect(trigger?.querySelector('.account-panel__commander-rank')?.textContent)
      .toBe('R-03 / Bombardier')
    const insignia = trigger?.querySelector('.account-panel__commander-insignia')
    expect(insignia?.textContent).toBe('◆◆')
    expect(insignia?.getAttribute('role')).toBe('img')
    expect(insignia?.getAttribute('aria-label')).toBe('Bombardier rank insignia: double diamond')
    expect(trigger?.querySelector('.account-panel__commander-level')?.textContent).toBe('Level 3')
    expect(trigger?.querySelector('.account-panel__record-milestone')?.textContent)
      .toBe('500 XP to Level 4')
    expect(trigger?.querySelector('.account-panel__career-next')?.textContent)
      .toBe('NEXT RANK / ARTILLERIST / LEVEL 5')
    expect(meter?.value).toBe(0)
    expect(meter?.max).toBe(500)
    expect(meter?.getAttribute('aria-label')).toBe('Commander Ranger Level 3 XP progress')
    expect(root.classList.contains('account-panel--open')).toBe(false)
    expect(root.querySelector('.account-panel__progress')).toBeNull()
    expect([...root.querySelectorAll('button')].some((candidate) => candidate.textContent === 'Sign out')).toBe(false)
    expect(root.querySelector('form')).toBeNull()
    trigger?.click()
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('keeps the same dossier semantics when the masthead requests trigger-only while the dialog is open', () => {
    const state: AccountState = {
      status: 'authenticated',
      busy: false,
      error: '',
      profile: { id: 'user-1', displayName: 'Ranger', summary: validSummary },
    }
    const root = buildAccountPanelView(options({ state, open: true, triggerOnly: true }))
    if (!root) throw new Error('Expected trigger-only commander dossier')

    const record = root.querySelector<HTMLElement>('.account-panel__record')
    const trigger = record?.querySelector<HTMLButtonElement>('.account-panel__account-trigger')
    if (!record || !trigger) throw new Error('Expected trigger-only dossier disclosure')
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(trigger.getAttribute('aria-label'))
      .toBe('Commander Ranger, R-03 Bombardier, Level 3, 500 XP to Level 4, next rank Artillerist at Level 5. Player account')
    expect(trigger.querySelector('.account-panel__commander-name')?.textContent).toBe('Ranger')
    expect(trigger.querySelector('.account-panel__commander-rank')?.textContent)
      .toBe('R-03 / Bombardier')
    expect(trigger.querySelector('.account-panel__commander-level')?.textContent).toBe('Level 3')
    expect(trigger.querySelector('.account-panel__record-milestone')?.textContent)
      .toBe('500 XP to Level 4')
    expect(trigger.querySelector('.account-panel__career-next')?.textContent)
      .toBe('NEXT RANK / ARTILLERIST / LEVEL 5')
    expect(root.querySelector('.account-panel__progress')).toBeNull()
    expect([...root.querySelectorAll('button')].some((candidate) => candidate.textContent === 'Sign out'))
      .toBe(false)
  })

  it('renders the exact verified zero baseline instead of casual account progression', () => {
    const state: AccountState = {
      status: 'authenticated',
      busy: false,
      error: '',
      profile: { id: 'user-1', displayName: 'Ranger', summary: casualSummary },
    }
    const collapsed = buildAccountPanelView(options({ state }))
    const expanded = buildAccountPanelOverlayContent(options({ state, open: true }))
    if (!collapsed || !expanded) throw new Error('Expected both account surfaces')

    expect(collapsed.querySelector('.account-panel__commander-rank')?.textContent).toBe('R-01 / Cadet')
    expect(collapsed.querySelector('.account-panel__commander-insignia')?.textContent).toBe('◇')
    expect(collapsed.textContent).toContain('Level 1')
    expect(collapsed.textContent).not.toContain('Level 3')
    expect(expanded.querySelector('.account-panel__career-current')?.textContent).toBe('R-01 / Cadet')
    expect(progressPairs(expanded)).toEqual([
      ['Matches', '0'],
      ['Recorded wins', '0'],
      ['Level', '1'],
    ])
  })

  it('builds every rank-facing metric from verified progression when casual history diverges', () => {
    const state: AccountState = {
      status: 'authenticated',
      busy: false,
      error: '',
      profile: { id: 'user-1', displayName: 'Ranger', summary: divergentSummary },
    }
    const collapsed = buildAccountPanelView(options({ state }))
    const expanded = buildAccountPanelOverlayContent(options({ state, open: true }))
    if (!collapsed || !expanded) throw new Error('Expected both account surfaces')

    const trigger = collapsed.querySelector('.account-panel__account-trigger')
    expect(trigger?.getAttribute('aria-label'))
      .toBe('Commander Ranger, R-02 Gunner, Level 2, 500 XP to Level 3, next rank Bombardier at Level 3. Player account')
    expect(trigger?.textContent).toContain('Level 2')
    expect(trigger?.textContent).not.toContain('Level 20')
    expect(progressPairs(expanded)).toEqual([
      ['Matches', '4'],
      ['Recorded wins', '1'],
      ['Level', '2'],
    ])
    expect(expanded.querySelector('.account-panel__xp-value')?.textContent).toBe('0 / 500 XP')
    expect(expanded.querySelector('.account-panel__xp-remaining')?.textContent).toBe('500 XP to Level 3')
    expect(expanded.textContent).not.toContain('20')
  })

  it('renders semantic XP progress and exact remaining XP while preserving authenticated sign-out', () => {
    const onSignOut = vi.fn()
    const state: AccountState = {
      status: 'authenticated',
      busy: false,
      error: '',
      profile: {
        id: 'user-1',
        displayName: 'Ranger',
        summary: validSummary,
      },
    }
    const root = buildAccountPanelOverlayContent(options({ state, onSignOut, open: true }))
    if (!root) throw new Error('Expected authenticated account panel')

    expect(root.classList.contains('account-panel--authenticated')).toBe(true)
    expect(root.classList.contains('account-panel--open')).toBe(true)
    expect(root.querySelector('.account-panel__account-trigger')).toBeNull()
    expect(root.querySelector('dl.account-panel__progress')).not.toBeNull()
    expect(progressPairs(root)).toEqual([
      ['Matches', '7'],
      ['Recorded wins', '3'],
      ['Level', '3'],
    ])
    const career = root.querySelector<HTMLElement>('.account-panel__career')
    expect(career?.querySelector('.account-panel__career-current')?.textContent)
      .toBe('R-03 / Bombardier')
    expect(career?.querySelector('.account-panel__career-insignia')?.textContent).toBe('◆◆')
    expect(career?.querySelector('.account-panel__career-insignia')?.getAttribute('aria-label'))
      .toBe('Bombardier rank insignia: double diamond')
    expect(career?.querySelector('.account-panel__career-next')?.textContent)
      .toBe('Next rank: Artillerist at Level 5')
    const xp = root.querySelector('.account-panel__xp')
    const meter = xp?.querySelector('progress')
    expect(xp?.querySelector('.account-panel__xp-value')?.textContent).toBe('0 / 500 XP')
    expect(xp?.querySelector('.account-panel__xp-remaining')?.textContent).toBe('500 XP to Level 4')
    expect(meter).toBeInstanceOf(HTMLProgressElement)
    expect(meter?.value).toBe(0)
    expect(meter?.max).toBe(500)
    expect(meter?.getAttribute('aria-label')).toBe('Level 3 XP progress')
    expect(root.querySelector('form')).toBeNull()
    button(root, 'Sign out').click()
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it.each([
    ['a level boundary', {
      ...casualSummary,
      matchesPlayed: 4,
      wins: 1,
      totalXp: 500,
      level: 2,
      levelXp: 0,
      verifiedProgression: {
        evidence: 'verified_replay_v1',
        matchesPlayed: 4,
        wins: 1,
        progressionVersion: 1,
        totalXp: 500,
        level: 2,
        levelXp: 0,
        nextLevelXp: 500,
      },
    }, '500 XP to Level 3'],
    ['the nearest reachable step below a level boundary', {
      ...casualSummary,
      matchesPlayed: 2,
      wins: 2,
      totalXp: 400,
      level: 1,
      levelXp: 400,
      verifiedProgression: {
        evidence: 'verified_replay_v1',
        matchesPlayed: 2,
        wins: 2,
        progressionVersion: 1,
        totalXp: 400,
        level: 1,
        levelXp: 400,
        nextLevelXp: 500,
      },
    }, '100 XP to Level 2'],
  ] as const)('renders exact remaining XP at %s', (_label, summary, remaining) => {
    const state: AccountState = {
      status: 'authenticated',
      busy: false,
      error: '',
      profile: { id: 'user-1', displayName: 'Ranger', summary },
    }
    const root = buildAccountPanelOverlayContent(options({ state, open: true }))
    if (!root) throw new Error('Expected authenticated account panel')

    const meter = root.querySelector<HTMLProgressElement>('.account-panel__xp progress')
    expect(meter?.value).toBe(summary.verifiedProgression.levelXp)
    expect(meter?.max).toBe(summary.verifiedProgression.nextLevelXp)
    expect(root.querySelector('.account-panel__xp-remaining')?.textContent).toBe(remaining)
  })

  it('keeps definition pairs local and both account subtrees id-free when panels coexist', () => {
    const state: AccountState = {
      status: 'authenticated',
      busy: false,
      error: '',
      profile: {
        id: 'user-1',
        displayName: 'Ranger',
        summary: validSummary,
      },
    }
    const first = buildAccountPanelOverlayContent(options({ state, open: true }))
    const second = buildAccountPanelOverlayContent(options({
      state: {
        ...state,
        profile: {
          ...state.profile,
          summary: null,
        },
      },
      open: true,
    }))
    if (!first || !second) throw new Error('Expected authenticated account panels')
    document.body.append(first, second)

    try {
      expect(first.querySelectorAll('[id]')).toHaveLength(0)
      expect(second.querySelectorAll('[id]')).toHaveLength(0)
      expect(progressPairs(first)).toEqual([
        ['Matches', '7'],
        ['Recorded wins', '3'],
        ['Level', '3'],
      ])
      expect(second.querySelector('.account-panel__summary-unavailable')?.textContent)
        .toBe('Progress summary unavailable')
      expect(second.querySelector('[role="alert"]')).toBeNull()
    } finally {
      first.remove()
      second.remove()
    }
  })

  it('shows a restrained unavailable summary without losing the authenticated controls', () => {
    const onSignOut = vi.fn()
    const state: AccountState = {
      status: 'authenticated',
      busy: false,
      error: '',
      profile: { id: 'user-1', displayName: 'Ranger', summary: null },
    }
    const root = buildAccountPanelOverlayContent(options({ state, onSignOut, open: true }))
    if (!root) throw new Error('Expected authenticated account panel')

    expect(root.querySelector('.account-panel__summary-unavailable')?.textContent)
      .toBe('Progress summary unavailable')
    expect(root.querySelector('[role="alert"]')).toBeNull()
    expect(root.querySelector('form')).toBeNull()
    button(root, 'Sign out').click()
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('keeps sign-out available when an authenticated profile cannot be loaded', () => {
    const onSignOut = vi.fn()
    const state: AccountState = {
      status: 'authenticated-error',
      busy: false,
      error: 'Account request failed. Try again.',
      userId: 'user-1',
    }
    const root = buildAccountPanelView(options({ state, onSignOut }))
    if (!root) throw new Error('Expected authenticated error panel')

    expect(root.querySelector('form')).toBeNull()
    expect(root.querySelector('[role="alert"]')?.textContent)
      .toBe('Account request failed. Try again.')
    button(root, 'Sign out').click()
    expect(onSignOut).toHaveBeenCalledOnce()
  })
})
