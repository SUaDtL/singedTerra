import { describe, expect, it, vi } from 'vitest'
import { buildLobbyOverlayView } from './LobbyOverlayView'

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const match = [...root.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === text)
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing ${text} button`)
  return match
}

describe('buildLobbyOverlayView', () => {
  it('builds a labelled modal surface whose backdrop, close action, and Escape all close it', () => {
    const onClose = vi.fn()
    const body = document.createElement('div')
    body.textContent = 'Set battlefield conditions.'
    const overlay = buildLobbyOverlayView({
      label: 'Operations Settings',
      kicker: 'BATTLEFIELD PROTOCOL',
      variant: 'operations',
      body,
      onClose,
    })

    expect(overlay.classList.contains('lobby-overlay--operations')).toBe(true)
    expect(overlay.dataset.overlayPresentation).toBe('stage-modal')
    const dialog = overlay.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog?.getAttribute('aria-label')).toBe('Operations Settings')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.textContent).toContain('BATTLEFIELD PROTOCOL')
    expect(dialog?.textContent).toContain('Set battlefield conditions.')

    overlay.querySelector<HTMLButtonElement>('.lobby-overlay__backdrop')!.click()
    button(overlay, 'Close').click()
    dialog?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('contains Tab and Shift+Tab within enabled modal controls', () => {
    const body = document.createElement('div')
    const first = document.createElement('button')
    first.textContent = 'First option'
    const middle = document.createElement('button')
    middle.textContent = 'Middle option'
    const hidden = document.createElement('input')
    hidden.hidden = true
    const programmaticOnly = document.createElement('button')
    programmaticOnly.tabIndex = -1
    body.append(hidden, programmaticOnly, first, middle)
    const overlay = buildLobbyOverlayView({
      label: 'Player Record',
      variant: 'account',
      body,
      onClose: vi.fn(),
    })
    expect(overlay.classList.contains('lobby-overlay--account')).toBe(true)
    document.body.append(overlay)
    const dialog = overlay.querySelector<HTMLElement>('[role="dialog"]')!
    const close = button(overlay, 'Close')

    close.focus()
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(first)

    first.focus()
    dialog.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: true, bubbles: true,
    }))
    expect(document.activeElement).toBe(close)
    overlay.remove()
  })

  it('takes focus from its opener and recaptures Tab sent from outside the dialog', async () => {
    const opener = document.createElement('button')
    opener.textContent = 'Open account'
    const alreadyInert = document.createElement('div')
    alreadyInert.inert = true
    const body = document.createElement('div')
    const field = document.createElement('input')
    body.append(field)
    document.body.append(opener, alreadyInert)
    opener.focus()

    const onClose = vi.fn()
    const overlay = buildLobbyOverlayView({
      label: 'Player Record',
      variant: 'account',
      body,
      onClose,
    })
    document.body.append(overlay)
    const dialog = overlay.querySelector<HTMLElement>('[role="dialog"]')!
    const close = button(overlay, 'Close')

    await Promise.resolve()
    expect(document.activeElement).toBe(close)
    expect(opener.inert).toBe(true)
    expect(alreadyInert.inert).toBe(true)

    opener.focus()
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(document.activeElement).toBe(close)
    close.click()
    expect(onClose).toHaveBeenCalledOnce()
    expect(opener.inert).not.toBe(true)
    expect(alreadyInert.inert).toBe(true)
    overlay.remove()
    opener.remove()
    alreadyInert.remove()
  })
})
