# Store Catalog Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the in-turn Store's long purchase list with an accurate, categorized, responsive armory catalog while preserving every economy and purchase behavior.

**Architecture:** A new client-only metadata module maps the existing weapon/accessory identifiers into four presentation categories and concise behavior summaries. `HUD.buildStore()` renders that metadata into semantic category sections while continuing to read all live price, bundle, ownership, lock, and affordability values from `WeaponSystem`; the existing embedded stylesheet owns responsive layout and scroll containment.

**Tech Stack:** TypeScript, DOM APIs, CSS, Vitest/jsdom, Playwright, existing Canvas/HTML HUD architecture.

## Global Constraints

- Do not change `WeaponSystem`, prices, bundles, arms levels, inventory, deterministic actions, Supabase, or network behavior.
- Do not add a dependency or generated asset.
- Keep the between-round shop unchanged.
- Keep title/credits and Close outside the catalog scroll region.
- Preserve native buttons and existing phase, affordability, and arms-level disabled rules.
- At compact/coarse layouts, buy targets must be at least 44px high.

---

### Task 1: Typed armory catalog and semantic Store rendering

**Files:**
- Create: `client/src/ui/storeCatalog.ts`
- Create: `client/src/ui/storeCatalog.test.ts`
- Create: `client/src/ui/HUD.store.test.ts`
- Modify: `client/src/ui/HUD.ts`

**Interfaces:**
- Consumes: `WeaponType`, `AccessoryType`, `WEAPONS`, `ACCESSORIES`, `makeWeaponIcon()`, and the existing `StorePurchase` callback contract.
- Produces: `STORE_CATALOG`, a readonly array of sections containing discriminated `weapon` or `accessory` entries, plus semantic `.st-hud__store-catalog`, `.st-hud__store-section`, `.st-hud__store-section-grid`, `.st-hud__store-summary`, and existing `.st-hud__store-row` nodes.

- [x] **Step 1: Write the failing metadata tests**

  Assert that flattening `STORE_CATALOG` yields exactly the implemented finite-stock `WEAPONS` keys plus every `ACCESSORIES` key, each once, in the four approved categories and stable order. Assert every summary is non-empty and spot-check the behavior-defining copy for Bouncing Betty, Riot Bomb, Napalm, Sandhog, Shield, Battery, and Fuel Tank.

- [x] **Step 2: Run the metadata test and capture RED**

  Run: `npm -w @singedterra/client exec vitest run src/ui/storeCatalog.test.ts`

  Expected: FAIL because `storeCatalog.ts` does not exist.

- [x] **Step 3: Implement the minimal typed metadata module**

  Define a discriminated union for weapon/accessory entries and the exact four-section `STORE_CATALOG`. Keep every behavior summary presentation-only and under one line of UI copy.

- [x] **Step 4: Run the metadata test and capture GREEN**

  Run: `npm -w @singedterra/client exec vitest run src/ui/storeCatalog.test.ts`

  Expected: PASS.

- [x] **Step 5: Write the failing HUD structure and callback tests**

  Mount a real `HUD`/`GameEngine` harness. Assert the four semantic sections and ordered names/summaries, a separate non-scrolling header/catalog/footer structure, preserved weapon and accessory purchase payloads, native disabled state, and live Fuel Tank ownership text.

- [x] **Step 6: Run the HUD test and capture RED**

  Run: `npm -w @singedterra/client exec vitest run src/ui/HUD.store.test.ts`

  Expected: FAIL because the Store still renders one undifferentiated `.st-hud__store-grid` list without categories or summaries.

- [x] **Step 7: Render the catalog without changing live economy data flow**

  Import `STORE_CATALOG`, build a semantic section for each category, and create each existing store cell through small private weapon/accessory card helpers. Read names, prices, bundles, and effects from `WEAPONS`/`ACCESSORIES`; attach the existing `{ weapon }`/`{ accessory }` callbacks once; keep `storeCells` and `storeAccessoryCells` as the update seam.

- [x] **Step 8: Run the focused HUD suite and capture GREEN**

  Run: `npm -w @singedterra/client exec vitest run src/ui/storeCatalog.test.ts src/ui/HUD.store.test.ts src/ui/HUD.mobility.test.ts src/ui/HUD.shell.test.ts`

  Expected: PASS.

### Task 2: Responsive armory layout and browser proof

**Files:**
- Modify: `client/src/ui/HUD.ts`
- Modify: `e2e/hud-layout.spec.ts`

**Interfaces:**
- Consumes: the Task 1 Store DOM classes and the existing `?e2e=hotseat` deterministic browser route.
- Produces: a fixed-shell modal with an internally scrolling multi-column catalog and responsive one-column fallback.

- [x] **Step 1: Write the failing browser-layout assertions**

  Extend the Store layout coverage to assert: four categories, multi-column wide layout, one-column compact layout, visible header and Close action, `.st-hud__store-catalog` as the scroll owner, at least 44px compact buy targets, modal containment, and no document-level overflow.

- [x] **Step 2: Run the Playwright slice and capture RED**

  Run: `npm run test:e2e -- e2e/hud-layout.spec.ts --grep "Store catalog"`

  Expected: FAIL because the old Store panel owns scrolling and the catalog has no responsive section grid.

- [x] **Step 3: Implement the responsive Store CSS**

  Widen the panel within the battlefield overlay, move overflow to `.st-hud__store-catalog`, lay out category sections/cards with CSS Grid, establish clearer card hierarchy and hover/focus-visible states, and add compact/coarse-pointer fallbacks without altering other HUD surfaces.

- [x] **Step 4: Run the focused unit and Playwright suites**

  Run: `npm -w @singedterra/client exec vitest run src/ui/storeCatalog.test.ts src/ui/HUD.store.test.ts src/ui/HUD.mobility.test.ts src/ui/HUD.shell.test.ts`

  Run: `npm run test:e2e -- e2e/hud-layout.spec.ts --grep "Store catalog|weapon-family glyphs"`

  Expected: PASS.

- [x] **Step 5: Run full local verification**

  Run: `npm run check`

  Run: `npm run build`

  Run: `npm run test:client`

  Expected: all PASS.

- [x] **Step 6: Inspect the real Store visually at wide and compact sizes**

  Start exactly one local Vite server, open `?e2e=hotseat`, inspect screenshots for hierarchy, clipping, scroll ownership, readability, and disabled states, then stop the server and close agent-created browser tabs.

- [ ] **Step 7: Review, land, and deploy**

  Run one adversarial subagent over the exact package, correct every Critical/High/Medium/merge blocker, pass the codeArbiter commit and PR gates, wait for all exact-head hosted checks, merge only under the separately logged standing merge authority, and verify exact deployment provenance plus live smoke.
