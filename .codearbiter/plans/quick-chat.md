# Networked Quick Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed, ephemeral, accessible quick-chat palette to networked matches without touching deterministic gameplay or persistence.

**Architecture:** A pure client catalog validates six message keys and supplies constant labels. `NetworkClient` owns one room-scoped Realtime Broadcast channel, exposes send/receive callbacks, enforces an 800 ms local send interval, and tears the channel down with the game. `HUD` renders the palette and receives validated sender labels through a transient text-only toast; `main.ts` wires the optional interface, leaving `HotSeatClient` unchanged.

**Tech Stack:** TypeScript, Supabase Realtime Broadcast, DOM APIs, Vitest/jsdom, existing Vite client.

## Global Constraints

- Broadcast only; do not write quick-chat data to `room_actions`, Postgres, or an Edge Function.
- Payloads contain only a catalog key and public player ID; no free text or HTML.
- Unknown or malformed payloads are ignored, and channel/send failures are fail-soft.
- No auth, persistence, migrations, secrets, dependencies, or shared deterministic engine changes.

---

### Task 1: Catalog and pure transport contract

**Files:**
- Create: `client/src/client/quickChat.ts`
- Test: `client/src/client/quickChat.test.ts`

**Interfaces:**
- Produce `QUICK_CHAT_MESSAGES`, `QuickChatKey`, `QuickChatPayload`, `isQuickChatKey`, and `parseQuickChatPayload`.
- `parseQuickChatPayload(value: unknown): QuickChatPayload | null` accepts only a known key and a non-empty string player ID.

- [ ] Write failing tests for the exact six-key catalog, unknown-key rejection, malformed payload rejection, and constant text labels.
- [ ] Run `npx vitest run client/src/client/quickChat.test.ts` and observe the missing-module failure.
- [ ] Implement the catalog and parser with no DOM or Supabase dependency.
- [ ] Re-run the focused test and verify it passes.

### Task 2: NetworkClient broadcast lifecycle

**Files:**
- Modify: `client/src/client/GameClient.ts`
- Modify: `client/src/client/NetworkClient.ts`
- Test: `client/src/client/NetworkClient.quickChat.test.ts`

**Interfaces:**
- Add optional `sendQuickChat(key: QuickChatKey): boolean` and `onQuickChat(listener: (message: { key: QuickChatKey; playerId: string; playerName: string }) => void): () => void` to `GameClient`.
- `NetworkClient.initialize()` subscribes to `quick_chat` on `quick_chat:<roomId>` and `stop()` removes it. `sendQuickChat` returns false for cooldown or unavailable channel.

- [ ] Write failing tests for broadcast subscription, valid receive/name resolution, malformed/unknown filtering, 800 ms cooldown, send payload, and teardown.
- [ ] Run the focused NetworkClient test and observe the missing interface/channel behavior.
- [ ] Implement the smallest channel and callback lifecycle using the existing Supabase client seam.
- [ ] Re-run focused tests and verify no `room_actions` call is introduced.

### Task 3: Accessible HUD palette and wiring

**Files:**
- Modify: `client/src/ui/HUD.ts`
- Modify: `client/src/main.ts`
- Modify: `client/src/style.css` only if the existing HUD style injection cannot contain the palette styling
- Test: `client/src/ui/HUD.quickChat.test.ts`

**Interfaces:**
- Add `HUD.setQuickChatEnabled(enabled: boolean)`, `HUD.onQuickChat(listener: (key: QuickChatKey) => void)`, and `HUD.showQuickChat(message: { playerName: string; key: QuickChatKey }): void`.
- Use a `button` to open a small list of six `button` elements, with accessible names and Escape/selection close behavior. Sender names and labels enter the DOM through `textContent`.

- [ ] Write failing jsdom tests for network-only visibility, keyboard/pointer activation, all six labels, callback emission, and text-only received toast.
- [ ] Run the focused HUD test and observe the absent control/failure.
- [ ] Implement the control using the existing HUD build/update lifecycle and existing toast layer.
- [ ] Wire `main.ts` to enable it only when the active client exposes `onQuickChat` and `sendQuickChat`, and to forward receive events to `HUD.showQuickChat`.
- [ ] Re-run focused HUD tests and confirm hot-seat remains unchanged.

### Task 4: Full verification and review package

**Files:**
- Modify: `.codearbiter/sprint-log.md`
- Modify: `.codearbiter/open-tasks.md`

- [ ] Run `npm run check`, `npm run check:edge`, `npm run test:client`, `npm run typecheck`, `npm run build`, `npm run test:e2e`, `git diff --check`, and the state-free secrets scan.
- [ ] Append exact RED/GREEN and verification receipts to the sprint log.
- [ ] Send Euler the spec, plan, sprint log, tests, and final diff; resolve all Critical, High, Medium merge blockers, and other blocking findings.
- [ ] Use the commit gate, open a PR, require green checks on the exact reviewed head, merge under standing authority, deploy no backend changes, and smoke-test Pages plus unchanged function OPTIONS health.


## Maintenance reconciliation — 2026-10-29

**Current disposition:** Current implementation. Current source/oracles: `client/src/client/quickChat.ts`, `client/src/client/NetworkClient.quickChat.test.ts`.

The latest change to this historical plan reachable from `origin/main` is `b397161e9e9e` (feat(network): add ephemeral quick chat). The original unchecked RED, review, exact-head CI, deployment and acceptance entries remain historical evidence gaps unless a specific later receipt says otherwise. Current source or merge containment alone does not prove those executions. Do not rerun this old feature plan merely to manufacture a historical RED.

See [the project maintenance report](../reports/project-maintenance-2026-10-29.md#historical-plan-dispositions) for the bounded disposition and remaining obligation. This dated note preserves the original execution ledger.
