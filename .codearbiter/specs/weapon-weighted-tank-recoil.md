# Weapon-Weighted Tank Recoil Specification

## Intent

Make firing feel physically connected to the tank that launched the shot. The
existing weapon-specific muzzle flash sells the projectile, but the tank itself
remains perfectly static, which makes even premium ordnance feel weightless.

## Player contract

- Entering `FIRING` gives the active living, visible shooter one short kick
  opposite its barrel direction.
- Launch weight comes from the existing bounded muzzle profile, so a nuke kicks
  harder than a baby missile without creating a second weapon taxonomy.
- The pose recovers quickly and monotonically to the authoritative tank
  position. It never changes engine coordinates, aim, collision, projectile
  launch geometry, replay, or network state.
- Only the shooter moves; buried, dead, missing, and non-shooting tanks remain
  unchanged.
- Reduced motion suppresses the recoil entirely.
- A reset removes any in-flight recoil.

## Presentation bounds

- Peak translation is capped at 4 logical pixels.
- Lifetime is capped at 10 rendered frames.
- The vertical component is damped so upward fire settles into the ground
  rather than making the tank visibly float.
- The existing muzzle flash stays at the authoritative pre-recoil barrel tip;
  the brief separation reads as the weapon leaving while the chassis kicks
  backward.

## Architecture

- Recoil is renderer-owned transient state derived from the existing
  `PLAYER_TURN -> FIRING` observation.
- A pure helper maps angle, bounded launch weight, and age to a finite local
  translation.
- `TankRenderer` applies the translation with balanced Canvas save/restore
  around only the matching tank.
- No dependency, shared-engine, action-log, Edge Function, schema, or Supabase
  deployment change is allowed.

## Acceptance

- Pure tests pin direction, strength ordering, recovery, bounds, and malformed
  input behavior.
- Real renderer tests prove exactly-once launch admission, shooter isolation,
  Canvas containment, reduced-motion suppression, reset, and idle-animation
  liveness.
- A real-browser comparison shows light and heavy shots at gameplay scale with
  no application error.
- Full local verification, independent review, hosted CI/CodeQL, merge
  cleanliness, exact-SHA Pages provenance, and live smoke pass.
