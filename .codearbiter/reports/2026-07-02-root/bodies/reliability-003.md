# stop() does not cancel the seq-conflict retry timer or the rematch poll loop, so their callbacks (and listener notifications) can fire after teardown

**Severity:** low  |  **Confidence:** 0.75  |  **Effort:** S

**Where:**
- client/src/client/NetworkClient.ts:370-389
- client/src/client/NetworkClient.ts:766-776
- client/src/client/NetworkClient.ts:672-714

**Evidence:** stop() (lines 370-389) clears fireWatchdog, the turn-watch timers, the rAF handle, and removes both channels — but nothing tracks or cancels the seq-conflict retry `setTimeout(() => this.submitAction(...), delay)` scheduled at lines 773-776, nor the `handleRematch` bounded poll loop (lines 680-691) which sleeps `await new Promise(resolve => setTimeout(resolve, 150))` up to 8 times. After stop(), a pending seq-retry fires submitAction against a torn-down room and, on failure, calls failFire -> emitState -> notifies listeners (lines 583-587) even though the client is closed; handleRematch can likewise invoke the rematch listener after teardown.

**Impact:** Post-teardown callbacks: a stray POST to a dead room, and state/listener callbacks after the client was stopped (potential UI update or migration trigger on a discarded client). Low blast radius (referee rejects the late POST) but a genuine resource-lifecycle gap that can cause confusing late notifications.

**Recommendation:** Track outstanding retry/poll timers (or set a `_closing`/disposed flag that submitAction, the retry callback, handleRematch, and failFire check before acting) and clear/short-circuit them in stop().

**Acceptance criteria:**
- After stop(), no scheduled retry or rematch-poll callback mutates state or invokes a listener
- stop() clears or guards every timer created in the class

<!-- dedup_key: reliability:client/src/client/NetworkClient.ts:stop-untracked-timers · finding: reliability-003 -->
