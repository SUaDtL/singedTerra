import type { VerifiedChallengeSessionState } from '../client/VerifiedChallengeSession'
import type { VerifiedChallengeClientResult } from '../client/VerifiedChallengeClient'

export interface HUDVerifiedChallengePresentation {
  readonly session: VerifiedChallengeSessionState
  readonly result: VerifiedChallengeClientResult | null
}

export interface VerifiedChallengeViewProjection {
  readonly open: boolean
  readonly status: string
  readonly eyebrow: string
  readonly title: string
  readonly message: string
  readonly medal: string
  readonly reward: string
  readonly retry: Readonly<{ seconds: number | null; key: string }> | null
}

export interface VerifiedChallengeViewOptions {
  readonly host: HTMLElement
  readonly statusHost: HTMLElement
  readonly onRetry: () => void
  readonly onReturn: () => void
  readonly focusFallback: () => HTMLElement | null
}

function transcriptLength(state: VerifiedChallengeSessionState): number {
  if (state.status === 'completed') return state.receipt.transcript.length
  if (state.status === 'active' || state.status === 'completion-pending' || state.status === 'retryable'
    || state.status === 'expired' || state.status === 'abandoned' || state.status === 'invalid'
    || state.status === 'verification_unavailable') return state.transcript.length
  return 0
}

function sessionId(state: VerifiedChallengeSessionState): string {
  return 'descriptor' in state ? state.descriptor.sessionId : 'unadmitted'
}

function localResultCopy(result: VerifiedChallengeClientResult | null): {
  title: string
  message: string
} {
  if (!result) return { title: 'Crosswind Qualification', message: 'Qualification status is being recovered.' }
  if (result.terminal === 'objective_cleared') return {
    title: 'Objective cleared locally',
    message: 'CPU damage was recorded. A server receipt is required to confirm any reward.',
  }
  if (result.terminal === 'objective_not_cleared') return {
    title: 'Qualification not cleared locally',
    message: 'Three human salvos settled without clearing the damage objective. A server receipt will confirm the attempt.',
  }
  if (result.terminal === 'terminal_without_clear') return {
    title: 'Qualification ended locally',
    message: 'The battle ended before the damage objective cleared. A server receipt will confirm the attempt.',
  }
  return {
    title: 'Verification unavailable',
    message: 'The retained verifier stopped safely before it could produce a reward decision.',
  }
}

export function projectVerifiedChallengeView(
  value: HUDVerifiedChallengePresentation,
): VerifiedChallengeViewProjection {
  const { session, result } = value
  const shots = transcriptLength(session)
  const status = `Crosswind Qualification · ${shots} / 3 salvos · Damage the CPU with one Baby Missile salvo.`
  const local = localResultCopy(result)

  if (session.status === 'completed') {
    const receipt = session.receipt
    if (receipt.disposition === 'awarded') return {
      open: true, status: 'Crosswind Qualification · Verified first clear · Medal earned · +200 XP.',
      eyebrow: 'SERVER VERIFIED', title: 'Crosswind Qualification verified',
      message: 'First clear awarded. The receipt added the permanent medal and 200 verified career XP.',
      medal: 'Crosswind Qualification medal', reward: '+200 verified career XP', retry: null,
    }
    if (receipt.disposition === 'already_owned') return {
      open: true, status: 'Crosswind Qualification · Verified repeat clear · +0 XP.',
      eyebrow: 'SERVER VERIFIED', title: 'Crosswind Qualification verified',
      message: 'Repeat clear verified. The first-clear reward was already awarded to this account.',
      medal: 'Medal already owned', reward: '+0 XP', retry: null,
    }
    return {
      open: true, status: 'Crosswind Qualification · Verified attempt · No award.',
      eyebrow: 'SERVER VERIFIED', title: 'Qualification not cleared',
      message: 'The attempt was verified, but the objective was not cleared.',
      medal: 'No medal awarded', reward: '+0 XP', retry: null,
    }
  }

  if (session.status === 'expired' || session.status === 'verification_unavailable'
    || session.status === 'invalid' || session.status === 'abandoned') {
    const title = session.status === 'expired' ? 'Qualification expired'
      : session.status === 'verification_unavailable' ? 'Verification unavailable'
        : session.status === 'invalid' ? 'Qualification unavailable' : 'Qualification abandoned'
    const message = session.status === 'expired'
      ? 'The 30-minute admitted session ended before a verified receipt was committed.'
      : session.status === 'verification_unavailable'
        ? 'The server could not complete verification within this session.'
        : session.status === 'invalid'
          ? 'The admitted session can no longer be recovered.'
          : 'This admitted session was closed without a verified reward.'
    return { open: true, status: `Crosswind Qualification · ${title}.`, eyebrow: 'NO VERIFIED RECEIPT',
      title, message, medal: '', reward: 'No verified reward is confirmed.', retry: null }
  }

  if (session.status === 'retryable') return {
    open: true, status: 'Crosswind Qualification · Verification paused.',
    eyebrow: 'VERIFICATION PAUSED', title: 'Verification needs another attempt',
    message: `${local.message} Reward status is unconfirmed until the server receipt is recovered.`,
    medal: '', reward: 'Reward status unconfirmed.',
    retry: { seconds: session.retryAfterSeconds,
      key: `${session.descriptor.sessionId}:${session.reason}:${session.retryAfterSeconds ?? 'now'}` },
  }

  if (session.status === 'completion-pending') return {
    open: true, status: 'Crosswind Qualification · Verification pending.', eyebrow: 'VERIFYING',
    title: local.title, message: `Verification pending. ${local.message} Awaiting a verified receipt.`,
    medal: '', reward: 'Reward status unconfirmed.', retry: null,
  }

  if (result) return {
    open: true, status: `Crosswind Qualification · ${local.title}.`, eyebrow: 'LOCAL RESULT',
    title: local.title, message: local.message, medal: '',
    reward: 'Reward status unconfirmed.', retry: null,
  }

  if (session.status === 'starting') return { open: false, status: 'Crosswind Qualification · Starting admitted session.',
    eyebrow: '', title: '', message: '', medal: '', reward: '', retry: null }
  if (session.status === 'start-unavailable') return { open: false,
    status: 'Crosswind Qualification · Start unavailable.', eyebrow: '', title: '', message: '', medal: '', reward: '', retry: null }
  if (session.status === 'idle') return { open: false, status: '', eyebrow: '', title: '', message: '', medal: '', reward: '', retry: null }
  return { open: false, status, eyebrow: '', title: '', message: '', medal: '', reward: '', retry: null }
}

export class VerifiedChallengeView {
  readonly root: HTMLElement
  readonly statusRoot: HTMLElement
  private readonly eyebrow: HTMLElement
  private readonly title: HTMLElement
  private readonly message: HTMLElement
  private readonly medal: HTMLElement
  private readonly reward: HTMLElement
  private readonly retryCopy: HTMLElement
  private readonly retryButton: HTMLButtonElement
  private readonly returnButton: HTMLButtonElement
  private retryTimer: ReturnType<typeof setInterval> | null = null
  private retryKey: string | null = null
  private retryDeadline = 0
  private previousFocus: HTMLElement | null = null
  private open = false

  constructor(private readonly options: VerifiedChallengeViewOptions) {
    this.statusRoot = document.createElement('section')
    this.statusRoot.className = 'st-hud__verified-challenge-status st-ui-section st-ui-section--verified'
    this.statusRoot.dataset['ui'] = 'verified-challenge-status'
    this.statusRoot.setAttribute('role', 'status')
    this.statusRoot.setAttribute('aria-live', 'polite')
    this.statusRoot.hidden = true

    const statusTitle = document.createElement('strong')
    statusTitle.textContent = 'Crosswind Qualification'
    const statusCopy = document.createElement('span')
    statusCopy.dataset['challengeStatusCopy'] = ''
    this.statusRoot.append(statusTitle, statusCopy)
    options.statusHost.prepend(this.statusRoot)

    this.root = document.createElement('section')
    this.root.className = 'st-hud__verified-challenge-report'
    this.root.dataset['ui'] = 'verified-challenge-report'
    this.root.setAttribute('role', 'dialog')
    this.root.setAttribute('aria-modal', 'true')
    this.root.setAttribute('aria-labelledby', 'st-verified-challenge-title')
    this.root.setAttribute('aria-hidden', 'true')
    this.root.hidden = true

    const panel = document.createElement('div')
    panel.className = 'st-hud__verified-challenge-panel'
    this.eyebrow = document.createElement('p')
    this.eyebrow.className = 'st-hud__verified-challenge-eyebrow'
    this.title = document.createElement('h2')
    this.title.id = 'st-verified-challenge-title'
    this.message = document.createElement('p')
    this.message.className = 'st-hud__verified-challenge-message'
    this.medal = document.createElement('div')
    this.medal.className = 'st-hud__verified-challenge-medal'
    this.reward = document.createElement('div')
    this.reward.className = 'st-hud__verified-challenge-reward'
    this.retryCopy = document.createElement('p')
    this.retryCopy.className = 'st-hud__verified-challenge-retry-copy'
    this.retryCopy.setAttribute('role', 'status')
    this.retryCopy.setAttribute('aria-live', 'polite')
    const actions = document.createElement('div')
    actions.className = 'st-hud__verified-challenge-actions'
    this.retryButton = document.createElement('button')
    this.retryButton.type = 'button'
    this.retryButton.textContent = 'Retry verification'
    this.retryButton.addEventListener('click', () => {
      if (this.open && !this.retryButton.hidden && !this.retryButton.disabled) options.onRetry()
    })
    this.returnButton = document.createElement('button')
    this.returnButton.type = 'button'
    this.returnButton.textContent = 'Return to preparation'
    this.returnButton.addEventListener('click', () => { if (this.open) options.onReturn() })
    actions.append(this.retryButton, this.returnButton)
    panel.append(this.eyebrow, this.title, this.message, this.medal, this.reward, this.retryCopy, actions)
    this.root.append(panel)
    this.root.addEventListener('keydown', this.onKeyDown)
    options.host.append(this.root)
  }

  update(value: HUDVerifiedChallengePresentation | null): void {
    if (value === null) {
      this.statusRoot.hidden = true
      this.statusRoot.querySelector<HTMLElement>('[data-challenge-status-copy]')!.textContent = ''
      this.hide()
      return
    }
    const projection = projectVerifiedChallengeView(value)
    const statusCopy = this.statusRoot.querySelector<HTMLElement>('[data-challenge-status-copy]')!
    statusCopy.textContent = projection.status.replace(/^Crosswind Qualification · ?/, '')
    this.statusRoot.hidden = projection.status === ''
    if (!projection.open) {
      this.hide()
      return
    }

    this.eyebrow.textContent = projection.eyebrow
    this.title.textContent = projection.title
    this.message.textContent = projection.message
    this.medal.textContent = projection.medal
    this.medal.hidden = projection.medal === ''
    this.reward.textContent = projection.reward
    this.reward.hidden = projection.reward === ''
    this.configureRetry(projection.retry)
    this.show()
  }

  destroy(): void {
    this.clearRetryTimer()
    this.setIsolation(false)
    this.root.removeEventListener('keydown', this.onKeyDown)
    this.root.remove()
    this.statusRoot.remove()
  }

  private show(): void {
    if (this.open) return
    const active = document.activeElement
    this.previousFocus = active instanceof HTMLElement && active !== document.body ? active : null
    this.open = true
    this.root.hidden = false
    this.root.setAttribute('aria-hidden', 'false')
    this.setIsolation(true)
    const target = !this.retryButton.hidden && !this.retryButton.disabled ? this.retryButton : this.returnButton
    target.focus({ preventScroll: true })
  }

  private hide(): void {
    this.clearRetryTimer()
    this.retryKey = null
    if (!this.open) return
    const ownedFocus = this.root.contains(document.activeElement)
    this.open = false
    this.root.hidden = true
    this.root.setAttribute('aria-hidden', 'true')
    this.setIsolation(false)
    if (ownedFocus) {
      const target = this.previousFocus?.isConnected ? this.previousFocus : this.options.focusFallback()
      target?.focus({ preventScroll: true })
    }
    this.previousFocus = null
  }

  private configureRetry(retry: VerifiedChallengeViewProjection['retry']): void {
    if (!retry) {
      this.clearRetryTimer()
      this.retryKey = null
      this.retryButton.hidden = true
      this.retryButton.disabled = true
      this.retryCopy.hidden = true
      this.retryCopy.textContent = ''
      return
    }
    this.retryButton.hidden = false
    this.retryCopy.hidden = false
    if (retry.seconds === null) {
      this.clearRetryTimer()
      this.retryKey = retry.key
      this.retryDeadline = 0
      this.syncRetryCountdown()
      return
    }
    if (this.retryKey !== retry.key) {
      this.retryKey = retry.key
      this.retryDeadline = Date.now() + retry.seconds * 1_000
    }
    this.syncRetryCountdown()
    if (this.retryTimer === null && this.retryDeadline > Date.now()) {
      this.retryTimer = setInterval(() => this.syncRetryCountdown(), 250)
    }
  }

  private syncRetryCountdown(): void {
    const remaining = this.retryDeadline === 0 ? 0 : Math.max(0, Math.ceil((this.retryDeadline - Date.now()) / 1_000))
    this.retryButton.disabled = remaining > 0
    if (remaining === 0) {
      this.retryCopy.textContent = 'Retry available now.'
      this.clearRetryTimer()
      return
    }
    const minutes = Math.floor(remaining / 60)
    const seconds = remaining % 60
    this.retryCopy.textContent = `Retry available in ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.`
  }

  private clearRetryTimer(): void {
    if (this.retryTimer === null) return
    clearInterval(this.retryTimer)
    this.retryTimer = null
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.open) return
    if (event.key === 'Escape') {
      event.preventDefault()
      this.options.onReturn()
      return
    }
    if (event.key !== 'Tab') return
    const buttons = [this.retryButton, this.returnButton].filter((button) => !button.hidden && !button.disabled)
    if (buttons.length === 0) return
    event.preventDefault()
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.shiftKey
      ? (current <= 0 ? buttons.length - 1 : current - 1)
      : (current < 0 || current === buttons.length - 1 ? 0 : current + 1)
    buttons[next]!.focus({ preventScroll: true })
  }

  private setIsolation(active: boolean): void {
    const appSiblings = this.options.host.parentElement
      ? [...this.options.host.parentElement.children].filter((element): element is HTMLElement =>
        element instanceof HTMLElement && element !== this.options.host)
      : []
    const modalSiblings = [...this.options.host.children].filter((element): element is HTMLElement =>
      element instanceof HTMLElement && element !== this.root)
    for (const surface of [...appSiblings, ...modalSiblings]) {
      if (active) {
        if (surface.dataset['challengePreviousInert'] !== undefined) continue
        surface.dataset['challengePreviousInert'] = surface.inert ? 'true' : 'false'
        surface.dataset['challengePreviousAriaHidden'] = surface.getAttribute('aria-hidden') ?? '__absent__'
        surface.inert = true
        surface.setAttribute('aria-hidden', 'true')
        continue
      }
      const previousInert = surface.dataset['challengePreviousInert']
      if (previousInert === undefined) continue
      surface.inert = previousInert === 'true'
      const previousAria = surface.dataset['challengePreviousAriaHidden']
      if (previousAria === '__absent__' || previousAria === undefined) surface.removeAttribute('aria-hidden')
      else surface.setAttribute('aria-hidden', previousAria)
      delete surface.dataset['challengePreviousInert']
      delete surface.dataset['challengePreviousAriaHidden']
    }
  }
}
