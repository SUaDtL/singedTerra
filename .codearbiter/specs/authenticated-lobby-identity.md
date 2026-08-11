# Sprint spec: Authenticated lobby identity coherence

**Approval:** Accepted under the maintainer's standing bounded-spec authority on 2026-08-11.

## Outcome

A signed-in player enters online setup with their account display name already present, while gameplay-seat authorization remains independent and room-name conflicts remain editable. Authenticated victories never display the anonymous future-match sign-in prompt.

## Contract

1. An authenticated account profile supplies the default online player name for create and join flows.
2. The default is presentation data only. The account JWT does not create, own, or authorize a gameplay seat; existing server-minted seat credentials remain authoritative.
3. The player-name control remains editable because room names must be unique and account display names are not gameplay identifiers.
4. A user edit has precedence over later account refreshes, rerenders, or sign-in transitions.
5. While the name is still profile-derived, an authenticated profile-name change updates it. Signing out clears a profile-derived name so a shared browser does not retain account presentation data. Signing out does not erase a deliberate user override.
6. Online names remain bounded by the existing 20-character create/join contract. A longer account display name is shown intact and rejected locally with an actionable correction; it is never silently truncated.
7. Anonymous players retain the existing blank editable name flow.
8. The anonymous progression handoff remains available only when explicitly activated. Its `hidden` state must win over authored layout CSS so authenticated users cannot see “Sign in to record future matches.”
9. Existing account, hot-seat, room transport, waiting-room rename, diagnostics, and anonymous progression behavior remain unchanged.

## Acceptance criteria

1. Initial authenticated state and later authenticated session emission prefill create and join setup with the exact profile display name.
2. The create and join transports receive that name without requiring typing.
3. A typed override survives account summary/profile rerenders and later authentication state updates.
4. A profile-derived name tracks profile changes, clears on sign-out, and a typed override does not clear on sign-out.
5. A 21–24 character profile name is visible, produces a local 20-character validation error on create/join, and causes no network request.
6. Anonymous setup remains blank and editable.
7. The progression handoff has computed `display: none` while hidden and becomes visible only after the anonymous handoff method is called.
8. Focus, layout, and responsive online setup remain usable in the existing rendered browser matrix.
9. The final review package contains this spec, the plan, sprint log, RED/GREEN evidence, tests, and exact diff; every Critical, High, and merge-blocking finding is resolved.
10. Exact reviewed-head hosted checks are green before merge, then Pages publishes that merged main head and production health is verified.

## Out of scope

- Binding accounts to gameplay seats or replacing seat tokens.
- Enforcing account display names as immutable room names.
- Changing backend name limits, account profile limits, Auth configuration, migrations, or Edge Functions.
- Reworking the waiting-room rename flow or progression rules.

## Open questions

None.
