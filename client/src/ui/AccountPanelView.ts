import type {
  AccountCredentials,
  AccountMode,
  AccountState,
} from '../client/AccountSession'

export interface AccountPanelViewOptions {
  state: AccountState
  open: boolean
  triggerOnly?: boolean
  mode: AccountMode
  onOpen: () => void
  onClose: () => void
  onModeChange: (mode: AccountMode) => void
  onSubmit: (mode: AccountMode, credentials: AccountCredentials) => void
  onSignOut: () => void
}

function actionButton(text: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = text
  button.addEventListener('click', onClick)
  return button
}

function field(
  labelText: string,
  name: string,
  type: HTMLInputElement['type'],
  autocomplete: string,
): { wrapper: HTMLLabelElement; input: HTMLInputElement } {
  const wrapper = document.createElement('label')
  wrapper.className = 'account-panel__field'
  const label = document.createElement('span')
  label.textContent = labelText
  const input = document.createElement('input')
  input.name = name
  input.type = type
  input.setAttribute('autocomplete', autocomplete)
  input.required = true
  wrapper.append(label, input)
  return { wrapper, input }
}

/**
 * Builds the established account detail/form surface for placement in a modal
 * layer. The masthead trigger remains independently available from
 * buildAccountPanelView.
 */
export function buildAccountPanelOverlayContent(
  options: AccountPanelViewOptions,
): HTMLElement | null {
  const content = buildAccountPanelView({ ...options, open: true })
  if (!content) return null

  content.querySelector('.account-panel__account-trigger')?.remove()
  for (const button of content.querySelectorAll('button')) {
    if (button.textContent === 'Close') button.remove()
  }
  return content
}

export function buildAccountPanelView(
  options: AccountPanelViewOptions,
): HTMLElement | null {
  if (options.state.status === 'unavailable') return null

  const root = document.createElement('section')
  root.className = 'account-panel'
  root.setAttribute('aria-label', 'Player account')

  if (options.state.status === 'loading') {
    const loading = actionButton('Account loading…', () => undefined)
    loading.className = 'account-panel__summary'
    loading.disabled = true
    root.append(loading)
    return root
  }

  if (options.state.status === 'authenticated') {
    root.classList.add('account-panel--authenticated')
    const accountSummary = options.state.profile.summary
    const triggerLabel = accountSummary
      ? `Commander ${options.state.profile.displayName} - Level ${accountSummary.level}`
      : `Commander ${options.state.profile.displayName}`
    const disclosure = actionButton(
      triggerLabel,
      options.open && !options.triggerOnly ? options.onClose : options.onOpen,
    )
    disclosure.className = 'account-panel__account-trigger'
    disclosure.setAttribute('aria-expanded', String(options.open))

    if (!options.open || options.triggerOnly) {
      if (accountSummary) {
        const remainingXp = accountSummary.nextLevelXp - accountSummary.levelXp
        const nextLevel = accountSummary.level + 1
        disclosure.textContent = ''
        disclosure.setAttribute(
          'aria-label',
          `Commander ${options.state.profile.displayName}, Level ${accountSummary.level}, ${remainingXp} XP to Level ${nextLevel}. Player account`,
        )
        const commander = document.createElement('span')
        commander.className = 'account-panel__commander-name'
        commander.textContent = options.state.profile.displayName
        const level = document.createElement('span')
        level.className = 'account-panel__commander-level'
        level.textContent = `Level ${accountSummary.level}`
        const milestone = document.createElement('span')
        milestone.className = 'account-panel__record-milestone'
        milestone.textContent = `${remainingXp} XP to Level ${nextLevel}`
        disclosure.append(commander, level, milestone)

        const record = document.createElement('section')
        record.className = 'account-panel__record'
        record.setAttribute('aria-label', 'Commander dossier')
        const heading = document.createElement('h2')
        heading.textContent = 'COMMANDER DOSSIER'
        const xp = document.createElement('progress')
        xp.className = 'account-panel__record-xp'
        xp.value = accountSummary.levelXp
        xp.max = accountSummary.nextLevelXp
        xp.setAttribute(
          'aria-label',
          `Commander ${options.state.profile.displayName} Level ${accountSummary.level} XP progress`,
        )
        record.append(heading, disclosure, xp)
        root.append(record)
      } else {
        root.append(disclosure)
      }
      return root
    }

    root.append(disclosure)
    root.classList.add('account-panel--open')
    let summary: HTMLElement
    let xp: HTMLElement | null = null
    if (options.state.profile.summary) {
      const accountSummary = options.state.profile.summary
      summary = document.createElement('dl')
      summary.className = 'account-panel__progress'
      const values = [
        ['Matches', accountSummary.matchesPlayed],
        ['Recorded wins', accountSummary.wins],
        ['Level', accountSummary.level],
      ] as const
      for (const [label, value] of values) {
        const group = document.createElement('div')
        group.className = 'account-panel__progress-item'
        const term = document.createElement('dt')
        term.textContent = label
        const count = document.createElement('dd')
        count.textContent = String(value)
        group.append(term, count)
        summary.append(group)
      }

      xp = document.createElement('div')
      xp.className = 'account-panel__xp'
      const xpHeader = document.createElement('div')
      xpHeader.className = 'account-panel__xp-header'
      const xpLabel = document.createElement('span')
      xpLabel.className = 'account-panel__xp-label'
      xpLabel.textContent = 'XP progress'
      const xpValue = document.createElement('span')
      xpValue.className = 'account-panel__xp-value'
      xpValue.textContent = `${accountSummary.levelXp} / ${accountSummary.nextLevelXp} XP`
      xpHeader.append(xpLabel, xpValue)
      const meter = document.createElement('progress')
      meter.className = 'account-panel__xp-meter'
      meter.value = accountSummary.levelXp
      meter.max = accountSummary.nextLevelXp
      meter.setAttribute('aria-label', `Level ${accountSummary.level} XP progress`)
      const remaining = document.createElement('span')
      remaining.className = 'account-panel__xp-remaining'
      remaining.textContent = `${accountSummary.nextLevelXp - accountSummary.levelXp} XP to Level ${accountSummary.level + 1}`
      xp.append(xpHeader, meter, remaining)
    } else {
      summary = document.createElement('span')
      summary.className = 'account-panel__summary-unavailable'
      summary.textContent = 'Progress summary unavailable'
    }
    const signOut = actionButton('Sign out', options.onSignOut)
    signOut.className = 'account-panel__secondary'
    signOut.disabled = options.state.busy
    const close = actionButton('Close', options.onClose)
    close.className = 'account-panel__secondary account-panel__close'
    root.append(summary)
    if (xp) root.append(xp)
    root.append(close, signOut)
    return root
  }

  if (options.state.status === 'authenticated-error') {
    const identity = document.createElement('span')
    identity.className = 'account-panel__identity'
    identity.textContent = 'Account signed in'
    const error = document.createElement('span')
    error.className = 'account-panel__error'
    error.setAttribute('role', 'alert')
    error.textContent = options.state.error
    const signOut = actionButton('Sign out', options.onSignOut)
    signOut.className = 'account-panel__secondary'
    signOut.disabled = options.state.busy
    root.append(identity, error, signOut)
    return root
  }

  if (!options.open || options.triggerOnly) {
    const open = actionButton('Account', options.onOpen)
    open.className = 'account-panel__summary'
    root.append(open)
    return root
  }

  root.classList.add('account-panel--open')

  const header = document.createElement('div')
  header.className = 'account-panel__header'
  const heading = document.createElement('strong')
  heading.textContent = options.mode === 'create' ? 'Create account' : 'Sign in'
  const close = actionButton('Close', options.onClose)
  close.className = 'account-panel__secondary'
  header.append(heading, close)

  const modes = document.createElement('div')
  modes.className = 'account-panel__modes'
  const signInMode = actionButton('Sign in', () => options.onModeChange('sign-in'))
  const createMode = actionButton('Create account', () => options.onModeChange('create'))
  signInMode.classList.toggle('active', options.mode === 'sign-in')
  createMode.classList.toggle('active', options.mode === 'create')
  signInMode.setAttribute('aria-pressed', String(options.mode === 'sign-in'))
  createMode.setAttribute('aria-pressed', String(options.mode === 'create'))
  modes.append(signInMode, createMode)

  const form = document.createElement('form')
  form.className = 'account-panel__form'
  let displayName: HTMLInputElement | undefined
  if (options.mode === 'create') {
    const display = field('Display name', 'displayName', 'text', 'nickname')
    display.input.maxLength = 24
    displayName = display.input
    form.append(display.wrapper)
  }
  const email = field('Email', 'email', 'email', 'email')
  const password = field(
    'Password',
    'password',
    'password',
    options.mode === 'create' ? 'new-password' : 'current-password',
  )
  password.input.minLength = 8
  form.append(email.wrapper, password.wrapper)

  if (options.state.error) {
    const error = document.createElement('div')
    error.className = 'account-panel__error'
    error.setAttribute('role', 'alert')
    error.textContent = options.state.error
    form.append(error)
  }

  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.className = 'account-panel__submit'
  submit.textContent = options.state.busy
    ? 'Working…'
    : options.mode === 'create' ? 'Create account' : 'Sign in'
  submit.disabled = options.state.busy
  form.append(submit)

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const credentials: AccountCredentials = {
      email: email.input.value,
      password: password.input.value,
    }
    if (displayName) credentials.displayName = displayName.value
    password.input.value = ''
    options.onSubmit(options.mode, credentials)
  })

  root.append(header, modes, form)
  return root
}
