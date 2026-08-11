import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  DiagnosticCheckResult,
  ProductionDiagnosticsState,
  RegisteredDiagnosticId,
} from '../client/ProductionDiagnostics'
import { productionDiagnosticsReceiptForState } from '../client/ProductionDiagnostics'
import {
  buildProductionDiagnosticsView,
  type ProductionDiagnosticsViewOptions,
} from './ProductionDiagnosticsView'

const CHECK_ID: RegisteredDiagnosticId = 'verified-replay-runtime'
const CHECK_LABEL = 'Verified replay runtime'

const SAFE_DETAILS = {
  ok: true,
  probeVersion: 1,
  engineVersion: 1,
  rulesetVersion: 3,
  fixtures: {
    maximumLifecycle: {
      phase: 'GAME_OVER',
      winner: 'p2',
      winnerTeam: 2,
      turn: 13,
      actionCount: 15,
      tickCount: 448,
      maxTurnTickCount: 34,
    },
    maximumTurn: {
      phase: 'GAME_OVER',
      winner: 'p1',
      winnerTeam: null,
      turn: 3,
      actionCount: 4,
      tickCount: 293,
      maxTurnTickCount: 198,
    },
  },
} as const

const PASS_STATE: Extract<DiagnosticCheckResult, { status: 'PASS' }> = {
  id: CHECK_ID,
  label: CHECK_LABEL,
  status: 'PASS',
  code: 'ok',
  details: SAFE_DETAILS,
}

const FAIL_STATE: Extract<DiagnosticCheckResult, { status: 'FAIL' }> = {
  id: CHECK_ID,
  label: CHECK_LABEL,
  status: 'FAIL',
  code: 'request_failed',
}

const DIAGNOSTICS_STYLE_SOURCE = readFileSync(join(process.cwd(), 'src', 'style.css'), 'utf8')
const LOBBY_STYLE_SOURCE = readFileSync(join(process.cwd(), 'src', 'ui', 'Lobby.ts'), 'utf8')

type ProductionDiagnosticsReceipt = NonNullable<ReturnType<typeof productionDiagnosticsReceiptForState>>

function connectedFocusTarget(label = 'Return from diagnostics'): HTMLButtonElement {
  const target = document.createElement('button')
  target.type = 'button'
  target.textContent = label
  document.body.append(target)
  return target
}

function options(
  overrides: Partial<ProductionDiagnosticsViewOptions> = {},
): ProductionDiagnosticsViewOptions {
  const resolveReturnFocus = overrides.resolveReturnFocus ?? (() => connectedFocusTarget())
  return {
    state: { status: 'IDLE' },
    copyStatus: 'idle',
    resolveReturnFocus,
    onRun: vi.fn(),
    onCopyReceipt: vi.fn(),
    onOpenAccount: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

function compileTimeOnlyTypeAssertions(base: ProductionDiagnosticsViewOptions): void {
  if (false) {
    const { resolveReturnFocus: _resolveReturnFocus, ...withoutReturnFocusTarget } = base
    // @ts-expect-error URL and click activation must provide an explicit connected return target
    buildProductionDiagnosticsView(withoutReturnFocusTarget)
    buildProductionDiagnosticsView({
      ...base,
      // @ts-expect-error diagnostics cannot accept an operator-supplied endpoint
      endpoint: 'arbitrary_function',
    })
    buildProductionDiagnosticsView({
      ...base,
      // @ts-expect-error diagnostics cannot accept an operator-supplied request body
      body: { userId: 'operator-controlled' },
    })
    buildProductionDiagnosticsView({
      ...base,
      // @ts-expect-error diagnostics cannot accept operator-supplied request headers
      headers: { Authorization: 'Bearer operator-controlled' },
    })
  }
}

void compileTimeOnlyTypeAssertions

function button(root: HTMLElement, text: string): HTMLButtonElement {
  const match = [...root.querySelectorAll('button')]
    .find((candidate) => candidate.textContent === text)
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing ${text} button`)
  return match
}

function diagnostics(root: HTMLElement): HTMLElement {
  const content = root.querySelector<HTMLElement>('.production-diagnostics')
  if (!content) throw new Error('Missing production diagnostics content')
  return content
}

function dialog(root: HTMLElement): HTMLElement {
  const surface = root.querySelector<HTMLElement>('[role="dialog"]')
  if (!surface) throw new Error('Missing diagnostics dialog')
  return surface
}

function expectExactReceipt(
  root: HTMLElement,
  expected: ProductionDiagnosticsReceipt,
): HTMLElement {
  const receipt = diagnostics(root).querySelector<HTMLElement>('.production-diagnostics__receipt')
  if (!receipt) throw new Error('Missing receipt')
  const data = [...receipt.children].find((child): child is HTMLElement => (
    child instanceof HTMLElement
    && child.classList.contains('production-diagnostics__receipt-data')
  ))
  if (!data) throw new Error('Missing dedicated receipt data node')

  const expectedJson = JSON.stringify(expected, null, 2)
  expect(['PRE', 'CODE', 'DATA']).toContain(data.tagName)
  expect([...receipt.children]).toEqual([data])
  expect(data.textContent).toBe(expectedJson)
  expect(receipt.textContent).toBe(expectedJson)
  return receipt
}

function append(root: HTMLElement): void {
  document.body.append(root)
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('buildProductionDiagnosticsView', () => {
  it('defines a fixed, non-generic operator contract and suppresses duplicate pre-render Run clicks', () => {
    let runAtCallback: HTMLButtonElement | null = null
    let disabledAtCallback = false
    const onRun = vi.fn(() => {
      disabledAtCallback = runAtCallback?.disabled ?? false
    })
    const root = buildProductionDiagnosticsView(options({ onRun }))
    const content = diagnostics(root)
    const text = content.textContent ?? ''
    const statusRegion = content.querySelector<HTMLElement>('.production-diagnostics__status')

    expect(root.classList.contains('lobby-overlay--operations')).toBe(true)
    expect(root.dataset.overlayPresentation).toBe('stage-modal')
    expect(content.dataset.diagnosticsState).toBe('IDLE')
    expect(statusRegion?.getAttribute('role')).toBe('status')
    expect(statusRegion?.getAttribute('aria-live')).toBe('polite')
    expect(text).toContain('Verified replay runtime')
    expect(text).toContain('verified_replay_probe')
    expect(content.querySelector('form')).toBeNull()
    expect(content.querySelector('input, textarea, select, [contenteditable="true"]')).toBeNull()
    expect(text.toLowerCase()).not.toContain('endpoint')
    expect(text.toLowerCase()).not.toContain('request body')
    expect(text.toLowerCase()).not.toContain('header')

    const run = button(root, 'Run checks')
    runAtCallback = run
    expect(run.disabled).toBe(false)
    run.click()
    expect(run.disabled).toBe(true)
    expect(disabledAtCallback).toBe(true)
    run.click()
    expect(onRun).toHaveBeenCalledOnce()
    expect(onRun).toHaveBeenCalledWith()
  })

  it('routes Run and Account callbacks with the fixed check identity', () => {
    const onRun = vi.fn()
    const onOpenAccount = vi.fn()
    const root = buildProductionDiagnosticsView(options({ onRun, onOpenAccount }))

    button(root, 'Run checks').click()
    expect(onRun).toHaveBeenCalledOnce()
    expect(onRun).toHaveBeenCalledWith()
    expect(root.querySelector('button.production-diagnostics__account')).toBeNull()

    const anonymous = buildProductionDiagnosticsView(options({
      state: { status: 'anonymous' },
      onOpenAccount,
    }))
    button(anonymous, 'Open Account').click()
    expect(onOpenAccount).toHaveBeenCalledOnce()
  })

  it.each([
    ['loading', 'Checking account readiness', null],
    ['unavailable', 'Diagnostics unavailable', null],
    ['anonymous', 'Sign in', 'Open Account'],
    ['signed-out', 'signed out', 'Open Account'],
    ['authenticated-error', 'Account readiness failed', 'Review Account'],
  ] as const)(
    'renders distinct %s readiness with a safe disabled action state',
    (status, instruction, accountLabel) => {
      const onOpenAccount = vi.fn()
      const root = buildProductionDiagnosticsView(options({
        state: { status } as ProductionDiagnosticsState,
        onOpenAccount,
      }))
      const content = diagnostics(root)

      expect(content.dataset.diagnosticsState).toBe(status)
      expect(content.textContent).toContain(instruction)
      expect(button(root, 'Run checks').disabled).toBe(true)
      expect(button(root, 'Copy receipt').disabled).toBe(true)
      const account = root.querySelector<HTMLButtonElement>('.production-diagnostics__account')
      expect(account?.textContent ?? null).toBe(accountLabel)
      if (status === 'authenticated-error') {
        expect(content.textContent).not.toContain('Sign in')
      }
      if (account) account.click()
      expect(onOpenAccount).toHaveBeenCalledTimes(accountLabel ? 1 : 0)
    },
  )

  it('renders IDLE as ready, RUNNING as single-flight, and does not expose a copy action before a receipt', () => {
    const ready = buildProductionDiagnosticsView(options({ state: { status: 'IDLE' } }))
    expect(diagnostics(ready).textContent).toContain('Ready to run')
    expect(button(ready, 'Run checks').disabled).toBe(false)
    expect(button(ready, 'Copy receipt').disabled).toBe(true)

    const running = buildProductionDiagnosticsView(options({ state: { status: 'RUNNING' } }))
    expect(diagnostics(running).dataset.diagnosticsState).toBe('RUNNING')
    expect(diagnostics(running).textContent).toContain('Running registered diagnostics')
    expect(button(running, 'Run checks').disabled).toBe(true)
    expect(button(running, 'Copy receipt').disabled).toBe(true)
  })

  it.each([
    ['PASS', PASS_STATE],
    ['FAIL', FAIL_STATE],
  ] as const)('renders a sanitized %s receipt and keeps copy status separate from the result', (_name, state) => {
    const expectedReceipt = productionDiagnosticsReceiptForState(state)
    if (!expectedReceipt) throw new Error('Missing terminal receipt')
    const resultStatus = expectedReceipt.overall
    const onRun = vi.fn()
    const onCopyReceipt = vi.fn()
    const root = buildProductionDiagnosticsView(options({ state, onRun, onCopyReceipt }))
    const content = diagnostics(root)
    const receipt = expectExactReceipt(root, expectedReceipt)

    expect(content.dataset.diagnosticsState).toBe(resultStatus)
    const statusRegion = content.querySelector<HTMLElement>('.production-diagnostics__status')
    expect(statusRegion?.getAttribute('role')).toBe('status')
    expect(statusRegion?.getAttribute('aria-live')).toBe('polite')
    expect(['status', 'region']).toContain(receipt.getAttribute('role'))
    expect(receipt.getAttribute('aria-label')).toBe('Diagnostics receipt')
    expect(receipt.getAttribute('aria-live')).toBe('polite')
    const run = button(root, 'Run checks')
    expect(run.disabled).toBe(false)
    run.click()
    expect(run.disabled).toBe(true)
    run.click()
    expect(onRun).toHaveBeenCalledOnce()
    expect(onRun).toHaveBeenCalledWith()
    expect(button(root, 'Copy receipt').disabled).toBe(false)
    button(root, 'Copy receipt').click()
    expect(onCopyReceipt).toHaveBeenCalledOnce()
    expect(content.dataset.diagnosticsState).toBe(resultStatus)

    const copied = buildProductionDiagnosticsView(options({
      state,
      copyStatus: 'copied',
    }))
    const copiedReceipt = expectExactReceipt(copied, expectedReceipt)
    const copiedFeedback = diagnostics(copied).querySelector<HTMLElement>('.production-diagnostics__copy-status')
    expect(copiedFeedback).not.toBe(copiedReceipt)
    expect(copiedFeedback?.getAttribute('role')).toBe('status')
    expect(copiedFeedback?.getAttribute('aria-live')).toBe('polite')
    expect(copiedFeedback?.textContent).toBe('Receipt copied')
    expect(diagnostics(copied).dataset.diagnosticsState).toBe(resultStatus)
    expect(copiedReceipt.textContent).toBe(JSON.stringify(expectedReceipt, null, 2))

    const failed = buildProductionDiagnosticsView(options({
      state,
      copyStatus: 'failed',
    }))
    const failedReceipt = expectExactReceipt(failed, expectedReceipt)
    const failedFeedback = diagnostics(failed).querySelector<HTMLElement>('.production-diagnostics__copy-status')
    expect(failedFeedback).not.toBe(failedReceipt)
    expect(failedFeedback?.getAttribute('role')).toBe('status')
    expect(failedFeedback?.getAttribute('aria-live')).toBe('polite')
    expect(failedFeedback?.textContent).toBe('Receipt copy failed')
    expect(diagnostics(failed).dataset.diagnosticsState).toBe(resultStatus)
    expect(failedReceipt.textContent).toBe(JSON.stringify(expectedReceipt, null, 2))
  })

  it('renders the runner projector output for a fully poisoned widened PASS state', () => {
    const hostileState = {
      ...PASS_STATE,
      id: 'id-primitive-secret-sentinel',
      label: 'label-primitive-secret-sentinel',
      code: 'code-primitive-secret-sentinel',
      topLevelSecretKey: 'top-level-secret-value',
      details: {
        ...SAFE_DETAILS,
        ok: 'ok-primitive-secret-sentinel',
        probeVersion: 91001,
        engineVersion: 91002,
        rulesetVersion: 91003,
        detailsSecretKey: 'details-secret-value',
        fixtures: {
          ...SAFE_DETAILS.fixtures,
          fixturesSecretKey: 'fixtures-secret-value',
          maximumLifecycle: {
            ...SAFE_DETAILS.fixtures.maximumLifecycle,
            phase: 'maximum-lifecycle-phase-secret-sentinel',
            winner: 'maximum-lifecycle-winner-secret-sentinel',
            winnerTeam: 91101,
            turn: 91102,
            actionCount: 91103,
            tickCount: 91104,
            maxTurnTickCount: 91105,
            lifecycleFixtureSecretKey: 'lifecycle-fixture-secret-value',
          },
          maximumTurn: {
            ...SAFE_DETAILS.fixtures.maximumTurn,
            phase: 'maximum-turn-phase-secret-sentinel',
            winner: 'maximum-turn-winner-secret-sentinel',
            winnerTeam: 92101,
            turn: 92102,
            actionCount: 92103,
            tickCount: 92104,
            maxTurnTickCount: 92105,
            maximumTurnFixtureSecretKey: 'maximum-turn-fixture-secret-value',
          },
        },
      },
    } as unknown as ProductionDiagnosticsState
    const root = buildProductionDiagnosticsView(options({ state: hostileState }))
    const expectedReceipt = productionDiagnosticsReceiptForState(hostileState)
    if (!expectedReceipt) throw new Error('Missing terminal receipt')
    const receipt = expectExactReceipt(root, expectedReceipt)
    const serializedView = root.outerHTML.toLowerCase()
    expect(receipt.textContent).toBe(JSON.stringify(expectedReceipt, null, 2))

    for (const forbidden of [
      'id-primitive-secret-sentinel',
      'label-primitive-secret-sentinel',
      'code-primitive-secret-sentinel',
      'toplevelsecretkey',
      'top-level-secret-value',
      'ok-primitive-secret-sentinel',
      '91001',
      '91002',
      '91003',
      'detailssecretkey',
      'details-secret-value',
      'fixturessecretkey',
      'fixtures-secret-value',
      'maximum-lifecycle-phase-secret-sentinel',
      'maximum-lifecycle-winner-secret-sentinel',
      '91101',
      '91102',
      '91103',
      '91104',
      '91105',
      'lifecyclefixturesecretkey',
      'lifecycle-fixture-secret-value',
      'maximum-turn-phase-secret-sentinel',
      'maximum-turn-winner-secret-sentinel',
      '92101',
      '92102',
      '92103',
      '92104',
      '92105',
      'maximumturnfixturesecretkey',
      'maximum-turn-fixture-secret-value',
    ]) {
      expect(serializedView).not.toContain(forbidden)
    }
  })

  it('contains a throwing Run callback and re-enables Run without corrupting receipt controls', () => {
    const root = buildProductionDiagnosticsView(options({
      state: PASS_STATE,
      onRun: () => { throw new Error('run callback exploded') },
    }))
    const run = button(root, 'Run checks')
    const copy = button(root, 'Copy receipt')

    expect(() => run.click()).not.toThrow()
    expect(run.disabled).toBe(false)
    expect(copy.disabled).toBe(false)
  })

  it('contains throwing copy and account callbacks without corrupting sibling controls', () => {
    const copyRoot = buildProductionDiagnosticsView(options({
      state: PASS_STATE,
      onCopyReceipt: () => { throw new Error('copy callback exploded') },
    }))
    const copy = button(copyRoot, 'Copy receipt')

    expect(() => copy.click()).not.toThrow()
    expect(button(copyRoot, 'Run checks').disabled).toBe(false)
    expect(copy.disabled).toBe(false)

    const accountRoot = buildProductionDiagnosticsView(options({
      state: { status: 'anonymous' },
      onOpenAccount: () => { throw new Error('account callback exploded') },
    }))
    const account = button(accountRoot, 'Open Account')

    expect(() => account.click()).not.toThrow()
    expect(button(accountRoot, 'Run checks').disabled).toBe(true)
    expect(button(accountRoot, 'Copy receipt').disabled).toBe(true)
    expect(account.disabled).toBe(false)
  })

  it('keeps the shared overlay surface as the vertical scroll owner and limits receipt JSON to horizontal overflow', () => {
    const blocksForClass = (source: string, className: string): string[] => {
      const classPattern = new RegExp(`\\.${className}(?![-\\w])`)
      return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((match) => {
        const selectors = match[1]
        const declarations = match[2]
        if (selectors === undefined || declarations === undefined) return []
        return selectors.split(',').some((selector) => classPattern.test(selector))
          ? [declarations]
          : []
      })
    }

    for (const className of [
      'production-diagnostics',
      'production-diagnostics__receipt',
    ]) {
      const declarations = blocksForClass(DIAGNOSTICS_STYLE_SOURCE, className).join('\n')
      expect(declarations).not.toMatch(/\b(?:overflow|overflow-y|overflow-block)\s*:/)
      expect(declarations).not.toMatch(/\bmax-block-size\s*:/)
    }

    const receiptDataDeclarations = blocksForClass(
      DIAGNOSTICS_STYLE_SOURCE,
      'production-diagnostics__receipt-data',
    ).join('\n')
    expect(receiptDataDeclarations).not.toMatch(/\b(?:overflow|overflow-y|overflow-block)\s*:/)
    expect(receiptDataDeclarations).not.toMatch(/\bmax-block-size\s*:/)
    if (/\boverflow-x\s*:/.test(receiptDataDeclarations)) {
      expect(receiptDataDeclarations).toMatch(/\boverflow-x\s*:\s*(?:auto|scroll)\b/)
    }

    const surfaceDeclarations = blocksForClass(LOBBY_STYLE_SOURCE, 'lobby-overlay__surface').join('\n')
    expect(surfaceDeclarations).toMatch(/\boverflow-y\s*:\s*auto\b/)

    const landscapeRule = DIAGNOSTICS_STYLE_SOURCE.match(
      /@media\s*\(orientation:\s*landscape\)[\s\S]*?(?=@media\s*\(prefers-reduced-motion)/,
    )?.[0] ?? ''
    expect(landscapeRule).not.toMatch(
      /#lobby\s+\.production-diagnostics[\s\S]*?\b(?:height|min-height|max-height|max-block-size)\s*:[^;]*vh\b/,
    )

    const reducedMotionRule = DIAGNOSTICS_STYLE_SOURCE.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?#lobby\s+\.production-diagnostics__actions\s+button\s*\{[\s\S]*?transition:\s*none;[\s\S]*?scroll-behavior:\s*auto;[\s\S]*?\}/,
    )?.[0] ?? ''
    expect(reducedMotionRule).toContain('transition: none')
    expect(reducedMotionRule).toContain('scroll-behavior: auto')
  })

  it('delegates labelled dialog semantics to LobbyOverlayView', () => {
    const root = buildProductionDiagnosticsView(options())
    const surface = dialog(root)

    expect(surface.getAttribute('role')).toBe('dialog')
    expect(surface.getAttribute('aria-modal')).toBe('true')
    expect(surface.getAttribute('aria-label')).toBe('Production diagnostics')
  })

  it.each([
    ['Close button', (root: HTMLElement, _surface: HTMLElement) => button(root, 'Close').click()],
    ['backdrop', (root: HTMLElement, _surface: HTMLElement) => {
      root.querySelector<HTMLButtonElement>('.lobby-overlay__backdrop')!.click()
    }],
    ['Escape', (_root: HTMLElement, surface: HTMLElement) => {
      surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    }],
  ] as const)('%s resolves focus after onClose replaces the Lobby root and old target', async (_path, close) => {
    const lobbyRoot = document.createElement('div')
    lobbyRoot.id = 'lobby'
    const oldTarget = connectedFocusTarget('Old Lobby target')
    lobbyRoot.append(oldTarget)
    document.body.append(lobbyRoot)
    const background = document.createElement('div')
    document.body.append(background)
    const replacementLobby = document.createElement('div')
    replacementLobby.id = 'lobby'
    const replacementTarget = connectedFocusTarget('Replacement Lobby target')
    replacementLobby.append(replacementTarget)
    let root!: HTMLElement
    const onClose = vi.fn(() => {
      lobbyRoot.replaceWith(replacementLobby)
      oldTarget.remove()
      root.remove()
    })
    const resolveReturnFocus = vi.fn(() => replacementTarget)
    root = buildProductionDiagnosticsView(options({ resolveReturnFocus, onClose }))
    append(root)

    await Promise.resolve()
    expect(background.inert).toBe(true)

    close(root, dialog(root))

    expect(onClose).toHaveBeenCalledOnce()
    expect(resolveReturnFocus).toHaveBeenCalledOnce()
    const onCloseOrder = onClose.mock.invocationCallOrder[0]
    const resolveReturnFocusOrder = resolveReturnFocus.mock.invocationCallOrder[0]
    expect(onCloseOrder).toBeDefined()
    expect(resolveReturnFocusOrder).toBeDefined()
    if (onCloseOrder === undefined || resolveReturnFocusOrder === undefined) {
      throw new Error('Missing callback invocation order')
    }
    expect(onCloseOrder).toBeLessThan(resolveReturnFocusOrder)
    expect(oldTarget.isConnected).toBe(false)
    expect(replacementTarget.isConnected).toBe(true)
    expect(document.activeElement).toBe(replacementTarget)
  })

  it('removes the overlay and restores focus when onClose throws before rerender', async () => {
    const background = document.createElement('div')
    document.body.append(background)
    const returnFocusTarget = connectedFocusTarget('Close failure return target')
    const onClose = vi.fn(() => {
      throw new Error('close callback exploded before rerender')
    })
    const resolveReturnFocus = vi.fn(() => returnFocusTarget)
    const root = buildProductionDiagnosticsView(options({ onClose, resolveReturnFocus }))
    append(root)

    await Promise.resolve()
    expect(root.isConnected).toBe(true)
    expect(background.inert).toBe(true)

    expect(() => button(root, 'Close').click()).not.toThrow()

    expect(onClose).toHaveBeenCalledOnce()
    expect(resolveReturnFocus).toHaveBeenCalledOnce()
    const onCloseOrder = onClose.mock.invocationCallOrder[0]
    const resolveReturnFocusOrder = resolveReturnFocus.mock.invocationCallOrder[0]
    expect(onCloseOrder).toBeDefined()
    expect(resolveReturnFocusOrder).toBeDefined()
    if (onCloseOrder === undefined || resolveReturnFocusOrder === undefined) {
      throw new Error('Missing close-exception callback invocation order')
    }
    expect(onCloseOrder).toBeLessThan(resolveReturnFocusOrder)
    expect(root.isConnected).toBe(false)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(background.inert).not.toBe(true)
    expect(returnFocusTarget.inert).not.toBe(true)
    expect(document.activeElement).toBe(returnFocusTarget)
  })

  it('uses delegated initial focus and keeps Tab navigation inside the modal', async () => {
    const returnFocusTarget = connectedFocusTarget()
    const background = document.createElement('div')
    document.body.append(background)
    returnFocusTarget.focus()
    const root = buildProductionDiagnosticsView(options({
      resolveReturnFocus: () => returnFocusTarget,
    }))
    append(root)

    await Promise.resolve()
    const surface = dialog(root)
    const close = button(root, 'Close')
    const run = button(root, 'Run checks')
    expect(document.activeElement).toBe(close)
    expect(returnFocusTarget.inert).toBe(true)
    expect(background.inert).toBe(true)

    run.focus()
    surface.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(surface.contains(document.activeElement)).toBe(true)
    close.focus()
    surface.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Tab', shiftKey: true, bubbles: true,
    }))
    expect(surface.contains(document.activeElement)).toBe(true)
  })

  it.each(['null', 'disconnected'] as const)(
    'closes safely when the resolved focus target is %s',
    async (targetState) => {
      const target = connectedFocusTarget('Transient diagnostics target')
      const onClose = vi.fn()
      const resolveReturnFocus = vi.fn(() => {
        if (targetState === 'disconnected') target.remove()
        return targetState === 'null' ? null : target
      })
      const root = buildProductionDiagnosticsView(options({ resolveReturnFocus, onClose }))
      append(root)

      await Promise.resolve()
      expect(() => button(root, 'Close').click()).not.toThrow()

      expect(onClose).toHaveBeenCalledOnce()
      expect(resolveReturnFocus).toHaveBeenCalledOnce()
      if (targetState === 'disconnected') expect(target.isConnected).toBe(false)
    },
  )

  it('keeps controls singular and routes events only through the current rebuilt root', async () => {
    const firstRun = vi.fn()
    const firstCopy = vi.fn()
    const first = buildProductionDiagnosticsView(options({
      state: PASS_STATE,
      onRun: firstRun,
      onCopyReceipt: firstCopy,
    }))
    append(first)
    await Promise.resolve()
    expect(first.querySelectorAll('.production-diagnostics__run')).toHaveLength(1)
    expect(first.querySelectorAll('.production-diagnostics__copy')).toHaveLength(1)
    expect(first.querySelectorAll('.lobby-overlay__close')).toHaveLength(1)
    button(first, 'Run checks').click()
    button(first, 'Copy receipt').click()
    expect(firstRun).toHaveBeenCalledOnce()
    expect(firstCopy).toHaveBeenCalledOnce()
    first.remove()

    const secondRun = vi.fn()
    const secondCopy = vi.fn()
    const secondClose = vi.fn()
    const second = buildProductionDiagnosticsView(options({
      state: PASS_STATE,
      onRun: secondRun,
      onCopyReceipt: secondCopy,
      onClose: secondClose,
    }))
    append(second)
    await Promise.resolve()
    expect(second.querySelectorAll('.production-diagnostics__run')).toHaveLength(1)
    expect(second.querySelectorAll('.production-diagnostics__copy')).toHaveLength(1)
    expect(second.querySelectorAll('.lobby-overlay__close')).toHaveLength(1)
    button(second, 'Run checks').click()
    button(second, 'Copy receipt').click()
    dialog(second).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(firstRun).toHaveBeenCalledOnce()
    expect(firstCopy).toHaveBeenCalledOnce()
    expect(secondRun).toHaveBeenCalledOnce()
    expect(secondCopy).toHaveBeenCalledOnce()
    expect(secondClose).toHaveBeenCalledOnce()
  })
})
