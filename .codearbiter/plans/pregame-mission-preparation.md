# Pre-game mission preparation hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Local Battery and Open Operation setup routes one deliberate pre-game preparation hierarchy without changing their match or transport behavior.

**Architecture:** Add a small pure DOM builder for an accessible named preparation section. `LobbyHotSeatView` and `LobbyCreateView` keep ownership of their existing controls and callbacks, but compose those controls into the shared section frames and use an explicit protocol disclosure label. Scoped Lobby CSS supplies the common command framing and responsive geometry; no state or transport code moves.

**Tech Stack:** TypeScript, DOM UI, CSS in `client/src/ui/Lobby.ts`, Vitest, Playwright.

## Global Constraints

- Client UI only. No auth, backend, Supabase, migration, dependency, renderer, game-rule, generated-art, or setting-serialization change.
- Preserve every existing input value, listener, validation result, and start/create callback.
- Use the existing dark squared command language; do not introduce rounded-card presentation.
- Keep the working spec and plan under `.codearbiter/`.
- Do not read or modify `.codearbiter/sprint-log.md` because of the sanctioned malformed UTF-8 marker-root exception.

---

### Task 1: Define the reusable preparation-section contract

**Files:**
- Create: `client/src/ui/LobbyPreparationSection.ts`
- Create: `client/src/ui/LobbyPreparationSection.test.ts`

**Interfaces:**
- Produces `buildLobbyPreparationSection({ id, title, description?, children }) => HTMLElement`.
- Produces a `section.lobby-preparation-section` whose `aria-labelledby` references `<id>-heading`, heading has class `.lobby-preparation-section__title`, optional description has class `.lobby-preparation-section__purpose`, and body has class `.lobby-preparation-section__body`.
- Consumes only DOM nodes supplied by route builders; it owns no lobby state or callbacks.

- [ ] **Step 1: Write the failing unit contract**

```ts
const section = buildLobbyPreparationSection({
  id: 'crew-manifest',
  title: 'Crew manifest',
  description: 'Assign the battery before deployment.',
  children: [field('Players')],
});
expect(section.tagName).toBe('SECTION');
expect(section.getAttribute('aria-labelledby')).toBe('crew-manifest-heading');
expect(section.querySelector('.lobby-preparation-section__title')?.textContent)
  .toBe('Crew manifest');
expect(section.querySelector('.lobby-preparation-section__body')?.textContent)
  .toContain('Players');
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm -w @singedterra/client run test -- LobbyPreparationSection.test.ts`

Expected: FAIL because the presentation builder does not exist.

- [ ] **Step 3: Implement the minimal pure builder**

```ts
export function buildLobbyPreparationSection(options: LobbyPreparationSectionOptions): HTMLElement {
  const section = document.createElement('section');
  section.className = 'lobby-preparation-section';
  section.setAttribute('aria-labelledby', `${options.id}-heading`);
  // append heading, optional purpose, then supplied children in a body node
  return section;
}
```

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npm -w @singedterra/client run test -- LobbyPreparationSection.test.ts`

Expected: PASS.

### Task 2: Compose the Local Battery mission preparation route

**Files:**
- Modify: `client/src/ui/LobbyHotSeatView.ts`
- Modify: `client/src/ui/LobbyHotSeatView.test.ts`

**Interfaces:**
- Consumes `buildLobbyPreparationSection` from Task 1.
- Produces `Crew manifest` containing the existing Players selector and player rows.
- Produces `Battlefield protocol` around the existing advanced `<details>` element, with final action text `Deploy local battle`.

- [ ] **Step 1: Write failing Local Battery DOM assertions**

```ts
expect(root.querySelector('[aria-labelledby="crew-manifest-heading"]')?.textContent)
  .toContain('Players');
expect(root.querySelector('[aria-labelledby="battlefield-protocol-heading"] details')?.className)
  .toBe('lobby-advanced');
expect(button(root, 'Deploy local battle').disabled).toBe(false);
```

Keep the current player-count callback and invalid-start assertions, updating only the action label they query.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm -w @singedterra/client run test -- LobbyHotSeatView.test.ts`

Expected: FAIL because the named sections and deployment label do not exist.

- [ ] **Step 3: Compose existing controls into named sections**

Import the Task 1 builder. Put `countField` and `rows` into `Crew manifest`; put the existing `advanced` node into `Battlefield protocol`; preserve the same `change` and `click` listeners. Replace only `Start Game` display copy with `Deploy local battle`.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npm -w @singedterra/client run test -- LobbyHotSeatView.test.ts`

Expected: PASS with existing callbacks and validation behavior intact.

### Task 3: Compose the Open Operation mission preparation route

**Files:**
- Modify: `client/src/ui/LobbyCreateView.ts`
- Modify: `client/src/ui/LobbyCreateView.test.ts`

**Interfaces:**
- Consumes `buildLobbyPreparationSection` from Task 1.
- Produces `Command vehicle` containing the supplied name/color and Garage nodes.
- Produces `Operation profile` containing Players, CPU opponents, and Visibility fields.
- Produces `Battlefield protocol` containing the existing `.lobby-advanced` node and action label `Create operation`.

- [ ] **Step 1: Write failing Open Operation DOM assertions**

```ts
expect(root.querySelector('[aria-labelledby="command-vehicle-heading"]')?.textContent)
  .toContain('name-color');
expect(root.querySelector('[aria-labelledby="operation-profile-heading"]')?.textContent)
  .toContain('CPU opponents');
expect(root.querySelector('[aria-labelledby="battlefield-protocol-heading"] details')?.className)
  .toBe('lobby-advanced');
expect(button(root, 'Create operation').disabled).toBe(false);
```

Keep the current player, bot, visibility, create, join, and browse callback assertions.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm -w @singedterra/client run test -- LobbyCreateView.test.ts`

Expected: FAIL because the named section hierarchy and action label do not exist.

- [ ] **Step 3: Compose the existing Open Operation nodes without rewiring them**

Import the Task 1 builder. Append the supplied `nameColor` and `garage` nodes under `Command vehicle`, the existing player/bot/visibility fields under `Operation profile`, and the existing `<details class="lobby-advanced">` plus its supplied advanced fields under `Battlefield protocol`. Keep all existing event listeners; replace only the visible Create button copy with `Create operation`.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `npm -w @singedterra/client run test -- LobbyCreateView.test.ts`

Expected: PASS with all current callbacks and navigation actions intact.

### Task 4: Make the preparation hierarchy visually causal across viewport classes

**Files:**
- Modify: `client/src/ui/Lobby.ts`
- Modify: `e2e/lobby-layout.spec.ts`

**Interfaces:**
- Consumes `.lobby-preparation-section` from Task 1 and `.lobby-advanced` existing disclosure controls.
- Produces contained, visible section heading/body regions on Local Battery and Open Operation at desktop, Pixel touch, and small-window viewports.

- [ ] **Step 1: Write the browser geometry contract first**

Add an `assertPreparationHierarchy` helper that reads each named section, its heading, its body, and the final deployment action. Assert every region has visible height, remains inside the active route panel, clears its next sibling, and has no border radius. Invoke it for Local Battery and after navigating to Open Operation in the desktop, Pixel touch, and small-window projects.

- [ ] **Step 2: Run the targeted browser test and confirm it fails before the new composition CSS**

Run: `npx playwright test e2e/lobby-layout.spec.ts --grep "mission preparation"`

Expected: FAIL because the new semantic hierarchy has no finished contained visual composition.

- [ ] **Step 3: Add scoped command-frame styling**

In `Lobby.ensureStyles`, style `.lobby-preparation-section` as a squared, ruled operational panel with a compact uppercase title, optional muted purpose, and body spacing. Let `.lobby-advanced` sit inside the Battlefield Protocol body without changing fields or disclosure behavior. At compact width, reduce spacing and preserve all labels, controls, and deployment action inside the visible route panel.

- [ ] **Step 4: Run the targeted browser test and confirm it passes**

Run: `npx playwright test e2e/lobby-layout.spec.ts --grep "mission preparation"`

Expected: PASS across desktop, Pixel touch, and small-window projects.

- [ ] **Step 5: Prove causal geometry**

Temporarily add a production-only compact rule that sets `.lobby-preparation-section__body { height: 0; overflow: hidden; }`. Rebuild the production bundle and run the targeted browser test. Record the expected section-visibility failure, then remove the mutation with `apply_patch` before final verification.

### Task 5: Verify, review, and deliver

**Files:**
- Verify: `client/src/ui/LobbyPreparationSection.ts`, `client/src/ui/LobbyHotSeatView.ts`, `client/src/ui/LobbyCreateView.ts`, `client/src/ui/Lobby.ts`, their focused unit tests, and `e2e/lobby-shell.spec.ts`

- [ ] **Step 1: Run final local gates**

Run: `npm run test:client`, `npm run check`, `npm run check:edge`, `npm run audit:deps`, `npm run build`, and `git diff --check`.

Expected: all pass.

- [ ] **Step 2: Run the production-bundle browser matrix**

Run the existing Playwright suite against a controlled production bundle with local Supabase test variables.

Expected: every non-live test passes at desktop, touch, and compact viewports.

- [ ] **Step 3: Review and deliver**

Stage only the spec, plan, preparation-section source/test, route sources/tests, Lobby CSS host, and browser test. Run the canonical changed-file secrets scan. Give an adversarial reviewer the exact staged diff, spec, plan, tests, final gate output, and mutation evidence. Resolve every Critical, High, and merge-blocking finding. Commit, open a PR, require hosted CI to pass on the reviewed head, merge with a head guard, let Pages deploy, and verify direct production provenance.

## Plan self-review

- Spec coverage: Tasks 1 through 4 cover shared frame ownership, both primary setup routes, accessible section hierarchy, callback preservation, desktop/compact visual containment, and causal geometry. Task 5 carries every delivery gate.
- Placeholder scan: no deferred implementation text or unspecified test work remains.
- Type consistency: Task 1 defines the only new helper consumed by Tasks 2 and 3; Task 4 consumes its stable class names without moving Lobby state.
