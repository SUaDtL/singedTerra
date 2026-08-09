import { describe, expect, it, vi } from 'vitest'
import type { AccountState, AccountSummary } from '../client/AccountSession'
import { buildAccountPanelView, type AccountPanelViewOptions } from './AccountPanelView'

const validSummary: AccountSummary = {
  matchesPlayed: 8,
  wins: 4,
  progressionVersion: 1,
  totalXp: 1200,
  level: 3,
  levelXp: 200,
  nextLevelXp: 500,
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
    const root = buildAccountPanelView(options({ open: true, onSubmit }))
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

  it('renders create-account display name and routes mode changes', () => {
    const onModeChange = vi.fn()
    const root = buildAccountPanelView(options({
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
    const root = buildAccountPanelView(options({ open: true, state }))
    if (!root) throw new Error('Expected account panel')

    expect(button(root, 'Working…').disabled).toBe(true)
    expect(root.querySelector('.account-panel__error')?.textContent)
      .toBe('<img src=x onerror=alert(1)>')
    expect(root.querySelector('img')).toBeNull()
  })

  it('collapses authenticated details behind a self-identifying trigger by default', () => {
    const onOpen = vi.fn()
    const state: AccountState = {
      status: 'authenticated',
      busy: false,
      error: '',
      profile: { id: 'user-1', displayName: 'Ranger', summary: validSummary },
    }
    const root = buildAccountPanelView(options({ state, onOpen }))
    if (!root) throw new Error('Expected authenticated account panel')

    const trigger = button(root, 'Commander Ranger - Level 3')
    expect(trigger.classList.contains('account-panel__account-trigger')).toBe(true)
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(root.classList.contains('account-panel--open')).toBe(false)
    expect(root.querySelector('.account-panel__progress')).toBeNull()
    expect([...root.querySelectorAll('button')].some((candidate) => candidate.textContent === 'Sign out')).toBe(false)
    expect(root.querySelector('form')).toBeNull()
    trigger.click()
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('renders semantic XP progress and exact remaining XP while preserving authenticated controls', () => {
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
    const onClose = vi.fn()
    const root = buildAccountPanelView(options({ state, onSignOut, onClose, open: true }))
    if (!root) throw new Error('Expected authenticated account panel')

    expect(root.classList.contains('account-panel--authenticated')).toBe(true)
    expect(root.classList.contains('account-panel--open')).toBe(true)
    expect(button(root, 'Commander Ranger - Level 3').getAttribute('aria-expanded')).toBe('true')
    expect(root.querySelector('dl.account-panel__progress')).not.toBeNull()
    expect(progressPairs(root)).toEqual([
      ['Matches', '8'],
      ['Recorded wins', '4'],
      ['Level', '3'],
    ])
    const xp = root.querySelector('.account-panel__xp')
    const meter = xp?.querySelector('progress')
    expect(xp?.querySelector('.account-panel__xp-value')?.textContent).toBe('200 / 500 XP')
    expect(xp?.querySelector('.account-panel__xp-remaining')?.textContent).toBe('300 XP to Level 4')
    expect(meter).toBeInstanceOf(HTMLProgressElement)
    expect(meter?.value).toBe(200)
    expect(meter?.max).toBe(500)
    expect(meter?.getAttribute('aria-label')).toBe('Level 3 XP progress')
    expect(root.querySelector('form')).toBeNull()
    button(root, 'Close').click()
    expect(onClose).toHaveBeenCalledOnce()
    button(root, 'Sign out').click()
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it.each([
    ['a level boundary', {
      ...validSummary,
      matchesPlayed: 4,
      wins: 1,
      totalXp: 500,
      level: 2,
      levelXp: 0,
    }, '500 XP to Level 3'],
    ['the nearest reachable step below a level boundary', {
      ...validSummary,
      matchesPlayed: 2,
      wins: 2,
      totalXp: 400,
      level: 1,
      levelXp: 400,
    }, '100 XP to Level 2'],
  ] as const)('renders exact remaining XP at %s', (_label, summary, remaining) => {
    const state: AccountState = {
      status: 'authenticated',
      busy: false,
      error: '',
      profile: { id: 'user-1', displayName: 'Ranger', summary },
    }
    const root = buildAccountPanelView(options({ state, open: true }))
    if (!root) throw new Error('Expected authenticated account panel')

    const meter = root.querySelector<HTMLProgressElement>('.account-panel__xp progress')
    expect(meter?.value).toBe(summary.levelXp)
    expect(meter?.max).toBe(summary.nextLevelXp)
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
    const first = buildAccountPanelView(options({ state, open: true }))
    const second = buildAccountPanelView(options({
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
        ['Matches', '8'],
        ['Recorded wins', '4'],
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
    const root = buildAccountPanelView(options({ state, onSignOut, open: true }))
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
