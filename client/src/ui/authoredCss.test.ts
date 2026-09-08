import { describe, expect, it } from 'vitest'
import hudCss from './HUD.css?raw'
import lobbyCss from './Lobby.css?raw'

describe('authored CSS runtime text', () => {
  it('preserves the single CSS escape required by authored pseudo-elements', () => {
    expect(lobbyCss).toContain("content: '\\25B8 '")
    expect(lobbyCss).toContain("content: '\\25BE '")
    expect(hudCss).toContain("content: '\\25B6'")
    expect(hudCss).toContain("content: '\\2699'")
    expect(hudCss).toContain("content: '\\21BB'")

    expect(lobbyCss).not.toContain("content: '\\\\25B8")
    expect(hudCss).not.toContain("content: '\\\\25B6")
  })
})
