import type {
  CompletionRetryProbeState,
  PagesProvenanceState,
  ProductionDiagnosticsReceipt,
  ProductionDiagnosticsState,
} from '../client/ProductionDiagnostics'
import {
  PRODUCTION_DIAGNOSTIC_CHECKS,
  productionDiagnosticsReceiptForState,
} from '../client/ProductionDiagnostics'
import { buildLobbyOverlayView } from './LobbyOverlayView'

export type ProductionDiagnosticsCopyStatus = 'idle' | 'copied' | 'failed'

export interface ProductionDiagnosticsViewOptions {
  readonly state: ProductionDiagnosticsState
  readonly completionRetryProbe: CompletionRetryProbeState
  readonly pagesProvenance: PagesProvenanceState
  readonly copyStatus: ProductionDiagnosticsCopyStatus
  readonly resolveReturnFocus: () => HTMLElement | null
  readonly onRun: () => void
  readonly onCopyReceipt: () => void
  readonly onOpenAccount: () => void
  readonly onArmCompletionRetryProbe: () => void
  readonly onRunPagesProvenance: () => void
  readonly onClose: () => void
}

function pagesProvenanceCopy(state: PagesProvenanceState): string {
  if (state.status === 'PASS') return `Deployed ${state.sha.slice(0, 12)} · Pages run ${state.runId}`
  if (state.status === 'RUNNING') return 'Checking the live Pages artifact…'
  if (state.status === 'FAIL') return `Deployment provenance failed: ${state.code}`
  return 'Verify which exact main commit and Pages run served this client.'
}

function buildPagesProvenanceTool(options: ProductionDiagnosticsViewOptions): HTMLElement {
  const section = document.createElement('section')
  section.className = 'production-diagnostics__provenance'
  const heading = document.createElement('h3')
  heading.textContent = 'Live deployment provenance'
  const state = document.createElement('strong')
  state.textContent = pagesProvenanceCopy(options.pagesProvenance)
  const run = document.createElement('button')
  run.type = 'button'
  run.textContent = 'Check deployed build'
  run.disabled = !isRunEnabled(options.state.status) || options.pagesProvenance.status === 'RUNNING'
  run.addEventListener('click', () => {
    if (!run.disabled) options.onRunPagesProvenance()
  })
  section.append(heading, state, run)
  return section
}

function completionRetryCopy(state: CompletionRetryProbeState): string {
  switch (state.status) {
    case 'armed':
      return 'ARMED: the next accepted completion response will be discarded once.'
    case 'response-discarded':
      return 'RESPONSE LOST: use the in-game Retry verification control with the retained evidence.'
    case 'PASS':
      return 'PASS: identical retry returned the immutable receipt.'
    case 'FAIL':
      return state.code === 'evidence_mismatch'
        ? 'FAIL: retry evidence changed.'
        : 'FAIL: retry returned a different receipt.'
    default:
      return 'Ready. No completion response will be altered until explicitly armed.'
  }
}

function buildCompletionRetryProbe(options: ProductionDiagnosticsViewOptions): HTMLElement {
  const section = document.createElement('section')
  section.className = 'production-diagnostics__fault'
  section.dataset.completionRetryState = options.completionRetryProbe.status
  const heading = document.createElement('h3')
  heading.textContent = 'Completion retry proof'
  const description = document.createElement('p')
  description.textContent = 'Discard exactly one accepted completion response, then verify the ordinary retry returns the same immutable receipt and one-award delta.'
  const state = document.createElement('strong')
  state.className = 'production-diagnostics__fault-state'
  state.textContent = completionRetryCopy(options.completionRetryProbe)
  const arm = document.createElement('button')
  arm.type = 'button'
  arm.className = 'production-diagnostics__arm-retry'
  arm.textContent = 'Arm response loss'
  arm.disabled = !isRunEnabled(options.state.status)
    || options.completionRetryProbe.status === 'armed'
    || options.completionRetryProbe.status === 'response-discarded'
  arm.addEventListener('click', () => {
    if (!arm.disabled) options.onArmCompletionRetryProbe()
  })
  section.append(heading, description, state)
  if (options.completionRetryProbe.status === 'PASS') {
    const award = document.createElement('code')
    award.textContent = `${options.completionRetryProbe.award.matchesDelta} match · ${options.completionRetryProbe.award.winsDelta} win · ${options.completionRetryProbe.award.totalXpDelta} XP`
    section.append(award)
  }
  section.append(arm)
  return section
}

function readinessCopy(status: ProductionDiagnosticsState['status']): string {
  switch (status) {
    case 'loading':
      return 'Checking account readiness'
    case 'unavailable':
    case 'disposed':
      return 'Diagnostics unavailable'
    case 'anonymous':
      return 'Sign in to use the authenticated production check.'
    case 'signed-out':
      return 'Account signed out; sign in to run diagnostics.'
    case 'authenticated-error':
      return 'Account readiness failed. Review the account session before running diagnostics.'
    case 'RUNNING':
      return 'Running registered diagnostics'
    case 'PASS':
      return 'PASS: all registered checks'
    case 'FAIL':
      return 'FAIL: one or more checks'
    case 'IDLE':
      return 'Ready to run'
    default:
      return 'Diagnostics unavailable'
  }
}

function isRunEnabled(status: ProductionDiagnosticsState['status']): boolean {
  return status === 'IDLE' || status === 'PASS' || status === 'FAIL'
}

function buildAccountAction(
  state: ProductionDiagnosticsState,
  onOpenAccount: () => void,
): HTMLButtonElement | undefined {
  if (
    state.status !== 'anonymous'
    && state.status !== 'signed-out'
    && state.status !== 'authenticated-error'
  ) return undefined

  const account = document.createElement('button')
  account.type = 'button'
  account.className = 'production-diagnostics__account'
  account.textContent = state.status === 'authenticated-error' ? 'Review Account' : 'Open Account'
  account.addEventListener('click', () => {
    try {
      onOpenAccount()
    } catch {
      // Account recovery remains available after a synchronous caller failure.
    }
  })
  return account
}

function buildReceiptRegion(receipt: ProductionDiagnosticsReceipt | undefined): HTMLDivElement {
  const region = document.createElement('div')
  region.className = 'production-diagnostics__receipt'
  region.setAttribute('role', 'status')
  region.setAttribute('aria-live', 'polite')
  region.setAttribute('aria-label', 'Diagnostics receipt')

  if (receipt) {
    const data = document.createElement('pre')
    data.className = 'production-diagnostics__receipt-data'
    data.textContent = JSON.stringify(receipt, null, 2)
    region.append(data)
  } else {
    const placeholder = document.createElement('span')
    placeholder.className = 'production-diagnostics__receipt-placeholder'
    placeholder.textContent = 'No completed receipt.'
    region.append(placeholder)
  }

  return region
}

function copyStatusText(status: ProductionDiagnosticsCopyStatus): string {
  switch (status) {
    case 'copied':
      return 'Receipt copied'
    case 'failed':
      return 'Receipt copy failed'
    default:
      return ''
  }
}

export function buildProductionDiagnosticsView(
  options: ProductionDiagnosticsViewOptions,
): HTMLElement {
  const receipt = productionDiagnosticsReceiptForState(options.state)
  const content = document.createElement('div')
  content.className = 'production-diagnostics'
  content.dataset.diagnosticsState = options.state.status

  const intro = document.createElement('p')
  intro.className = 'production-diagnostics__intro'
  intro.textContent = 'Authenticated production probes. Uses the browser session and a fixed allowlisted check registry.'

  const status = document.createElement('div')
  status.className = 'production-diagnostics__status'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')
  const statusLabel = document.createElement('span')
  statusLabel.className = 'production-diagnostics__status-label'
  statusLabel.textContent = 'STATUS'
  const statusValue = document.createElement('strong')
  statusValue.className = 'production-diagnostics__status-value'
  statusValue.textContent = readinessCopy(options.state.status)
  status.append(statusLabel, statusValue)

  const check = document.createElement('section')
  check.className = 'production-diagnostics__check'
  const checkHeading = document.createElement('h3')
  checkHeading.textContent = 'CHECK REGISTER'
  check.append(checkHeading)
  for (const descriptor of PRODUCTION_DIAGNOSTIC_CHECKS) {
    const checkLine = document.createElement('div')
    checkLine.className = 'production-diagnostics__check-line'
    const checkName = document.createElement('strong')
    checkName.textContent = descriptor.label
    const checkFunction = document.createElement('code')
    checkFunction.textContent = descriptor.functionName
    checkLine.append(checkName, checkFunction)
    check.append(checkLine)
  }

  const actions = document.createElement('div')
  actions.className = 'production-diagnostics__actions'
  const run = document.createElement('button')
  run.type = 'button'
  run.className = 'production-diagnostics__run'
  run.textContent = 'Run checks'
  run.disabled = !isRunEnabled(options.state.status)
  run.addEventListener('click', () => {
    if (run.disabled) return
    run.disabled = true
    try {
      options.onRun()
    } catch {
      run.disabled = false
    }
  })
  const copy = document.createElement('button')
  copy.type = 'button'
  copy.className = 'production-diagnostics__copy'
  copy.textContent = 'Copy receipt'
  copy.disabled = receipt === undefined
  copy.addEventListener('click', () => {
    if (copy.disabled) return
    try {
      options.onCopyReceipt()
    } catch {
      // Copy feedback is owned by the caller; keep this render unchanged.
    }
  })
  actions.append(run, copy)

  const account = buildAccountAction(options.state, options.onOpenAccount)
  if (account) actions.append(account)
  const completionRetryProbe = buildCompletionRetryProbe(options)
  const pagesProvenance = buildPagesProvenanceTool(options)

  const receiptHeading = document.createElement('h3')
  receiptHeading.className = 'production-diagnostics__receipt-heading'
  receiptHeading.textContent = 'RECEIPT / SCHEMA V1'
  const receiptRegion = buildReceiptRegion(receipt)
  const copyStatus = document.createElement('div')
  copyStatus.className = 'production-diagnostics__copy-status'
  copyStatus.setAttribute('role', 'status')
  copyStatus.setAttribute('aria-live', 'polite')
  copyStatus.textContent = copyStatusText(options.copyStatus)

  const consoleGrid = document.createElement('div')
  consoleGrid.className = 'production-diagnostics__console'
  const left = document.createElement('div')
  left.className = 'production-diagnostics__column'
  left.append(status, check, pagesProvenance, completionRetryProbe, actions)
  const right = document.createElement('div')
  right.className = 'production-diagnostics__column production-diagnostics__column--receipt'
  right.append(receiptHeading, receiptRegion, copyStatus)
  consoleGrid.append(left, right)

  content.append(intro, consoleGrid)

  let overlay: HTMLElement
  overlay = buildLobbyOverlayView({
    label: 'Production diagnostics',
    kicker: 'AUTHENTICATED OPERATIONS',
    variant: 'operations',
    body: content,
    onClose: () => {
      try {
        options.onClose()
      } catch {
        overlay.remove()
      }

      let returnFocus: HTMLElement | null
      try {
        returnFocus = options.resolveReturnFocus()
      } catch {
        return
      }

      try {
        if (returnFocus?.isConnected) returnFocus.focus()
      } catch {
        // A hostile or detached target must not escape the modal close path.
      }
    },
  })
  return overlay
}
