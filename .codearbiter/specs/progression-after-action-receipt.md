# Progression After-Action Receipt

**Task:** `mvp2.progression.0007` under standing approval.

## Problem

An authenticated player can finish a hot-seat match, have the existing server-side record succeed, and still see only the general victory report. The absence of an immediate receipt makes legitimate progression look missing.

## Decision

Keep match recording, account refresh, and progression calculation exactly as they are. When the existing hot-seat reporter receives a successful server-confirmed record, show a short noninteractive receipt inside the current After Action Report: `Progression recorded`. Do not show XP, a level claim, an estimated reward, or a receipt for anonymous, failed, fixture, network, AI, duplicate, or stale-match cases.

## Acceptance criteria

1. `createHotSeatProgressionReporter` emits its success callback once only after its existing `report` promise resolves `true`, passing the same trusted match result it submitted.
2. A `false` result, rejection, duplicate terminal frame, non-hot-seat mode, AI seat, deterministic fixture, or absent account seat produces no receipt callback.
3. `main.ts` forwards a successful receipt to HUD only while the same game session still owns the active After Action Report; a late completion from a prior game cannot appear in a later game or lobby.
4. The existing victory dialog contains a visually subordinate `Progression recorded` status after success. It is announced politely, does not change the two-action focus loop, and clears when the report closes or a new game starts.
5. The receipt is presentation only. No Auth/Supabase contract, persistence, XP formula, progression total, gameplay simulation, or dependency changes are allowed.
