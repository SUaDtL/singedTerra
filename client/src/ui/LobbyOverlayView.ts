export interface LobbyOverlayViewOptions {
  label: string
  kicker?: string
  variant: 'account' | 'operations'
  body: HTMLElement
  onClose: () => void
}

function closeButton(onClose: () => void): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'lobby-overlay__close'
  button.textContent = 'Close'
  button.addEventListener('click', onClose)
  return button
}

function focusableControls(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
  )].filter((control) => !control.hidden && control.tabIndex >= 0)
}

export function buildLobbyOverlayView(options: LobbyOverlayViewOptions): HTMLElement {
  const overlay = document.createElement('div')
  overlay.className = `lobby-overlay lobby-overlay--${options.variant}`
  overlay.dataset.overlayPresentation = 'stage-modal'
  const priorInert = new Map<HTMLElement, boolean>()
  const releaseBackground = () => {
    for (const [sibling, wasInert] of priorInert) sibling.inert = wasInert
    priorInert.clear()
  }
  const requestClose = () => {
    releaseBackground()
    options.onClose()
  }

  const backdrop = document.createElement('button')
  backdrop.type = 'button'
  backdrop.className = 'lobby-overlay__backdrop'
  backdrop.setAttribute('aria-label', `Close ${options.label}`)
  backdrop.addEventListener('click', requestClose)

  const dialog = document.createElement('section')
  dialog.className = 'lobby-overlay__surface'
  dialog.setAttribute('role', 'dialog')
  dialog.setAttribute('aria-modal', 'true')
  dialog.setAttribute('aria-label', options.label)

  const header = document.createElement('header')
  header.className = 'lobby-overlay__header'
  const headingGroup = document.createElement('div')
  if (options.kicker) {
    const kicker = document.createElement('span')
    kicker.className = 'lobby-overlay__kicker'
    kicker.textContent = options.kicker
    headingGroup.append(kicker)
  }
  const heading = document.createElement('h2')
  heading.className = 'lobby-overlay__title'
  heading.textContent = options.label
  headingGroup.append(heading)
  header.append(headingGroup, closeButton(requestClose))

  const body = document.createElement('div')
  body.className = 'lobby-overlay__body'
  body.append(options.body)
  dialog.append(header, body)
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      requestClose()
      return
    }
    if (event.key !== 'Tab') return
    const controls = focusableControls(dialog)
    const current = controls.indexOf(document.activeElement as HTMLElement)
    if (controls.length === 0) return
    event.preventDefault()
    if (current < 0) {
      controls[event.shiftKey ? controls.length - 1 : 0]?.focus()
      return
    }
    const offset = event.shiftKey ? -1 : 1
    controls[(current + offset + controls.length) % controls.length]?.focus()
  })

  overlay.append(backdrop, dialog)
  queueMicrotask(() => {
    const parent = overlay.parentElement
    if (!overlay.isConnected || !parent) return
    for (const sibling of [...parent.children]) {
      if (!(sibling instanceof HTMLElement) || sibling === overlay) continue
      priorInert.set(sibling, sibling.inert)
      sibling.inert = true
    }
    if (!dialog.contains(document.activeElement)) focusableControls(dialog)[0]?.focus()
  })
  return overlay
}
