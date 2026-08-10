import { describe, expect, it, vi } from 'vitest'
import { Lobby } from './Lobby'

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const match = [...root.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === text)
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing ${text} button`)
  return match
}

describe('Lobby Advanced Settings overlay', () => {
  it('opens settings above Local Battery and retains a changed raw value after closing', () => {
    const root = document.createElement('div')
    const lobby = new Lobby(root, vi.fn())
    document.body.append(root)
    lobby.show()

    button(root, 'Local Battle').click()
    button(root, 'Advanced settings').click()
    const overlay = root.querySelector<HTMLElement>('.lobby-overlay')
    const dialog = overlay?.querySelector<HTMLElement>('[role="dialog"]')
    const wind = dialog?.querySelector<HTMLInputElement>('input[placeholder="10"]')
    expect(dialog?.getAttribute('aria-label')).toBe('Operations Settings')
    expect(root.querySelector('.lobby-deployment details.lobby-advanced')).toBeNull()
    expect(wind).toBeInstanceOf(HTMLInputElement)

    wind!.value = '7'
    wind!.dispatchEvent(new Event('input'))
    overlay?.querySelector<HTMLButtonElement>('.lobby-overlay__close')?.click()
    expect(document.activeElement).toBe(button(root, 'Advanced settings'))

    button(root, 'Advanced settings').click()
    expect(root.querySelector<HTMLInputElement>('.lobby-overlay input[placeholder="10"]')?.value)
      .toBe('7')
    root.remove()
  })

  it('uses the same Operations Settings layer from Open Operation', () => {
    const root = document.createElement('div')
    const lobby = new Lobby(root, vi.fn())
    document.body.append(root)
    lobby.show()

    button(root, 'Play Online').click()
    button(root, 'Advanced settings').click()
    const dialog = root.querySelector<HTMLElement>('.lobby-overlay [role="dialog"]')
    expect(dialog?.getAttribute('aria-label')).toBe('Operations Settings')
    expect(dialog?.querySelectorAll('.lobby-field')).toHaveLength(10)
    expect(root.querySelector('.lobby-deployment details.lobby-advanced')).toBeNull()
    root.remove()
  })
})
