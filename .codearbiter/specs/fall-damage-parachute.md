# Fall Damage and Parachute

> Status: approved under the standing improvement-goal authority.

## Goal

Make terrain collapse create a meaningful Scorched Earth tradeoff: a tank that
drops a long distance takes deterministic fall damage, while a purchased
Parachute protects one dangerous fall and is consumed only when it is needed.

## Scope

- Add a deterministic fall-distance accumulator around the existing terrain-settle
  seam in `GameEngine`.
- Apply one integer fall-damage result after each complete terrain settle; no
  shooter credit, blast shield absorption, randomness, or wall-clock input.
- Add `parachute` to the existing accessory catalog and network buy allowlist.
  One purchase grants one parachute, and a dangerous fall consumes one.
- Preserve existing battery/fuel-tank behavior and carry accessory inventory
  across rounds.
- Expose the accessory in the existing HUD store and document the rule.

## Explicit rule

`FALL_SAFE_DISTANCE = 32px`. Damage is
`floor((distance - FALL_SAFE_DISTANCE) * 1.5)` for an unprotected fall. A
Parachute changes that damage to `floor(damage * 0.25)` and is consumed. Falls
at or below the safe distance do not consume a parachute and deal no damage.

## Boundaries

No auth, secrets, crypto, migrations, RLS/grants, dependencies, action kinds,
or server-side physics are added. The existing `buy` accessory payload remains
the network contract; the new string is validated by the existing allowlist.

## Acceptance criteria

1. A deterministic long collapse damages an unprotected tank and can kill it.
2. A parachute reduces the same fall damage and decrements exactly once.
3. A safe fall leaves both health and parachute count unchanged.
4. Live and replayed action sequences remain byte-identical, including accessory
   inventory and fall outcomes.
5. Existing accessory buys and all current checks remain green.
