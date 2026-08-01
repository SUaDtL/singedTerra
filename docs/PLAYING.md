# Playing singedTerra

singedTerra is a turn-based artillery game. Each turn gives one tank control of
the battlefield. Read the wind, choose a weapon, set angle and power, then
commit to the shot.

## Start a match

### Hot seat

Hot seat runs entirely in one browser and needs no backend.

1. Choose 2–4 seats.
2. Name each player and choose a color.
3. Set seats to Human or CPU.
4. Pick a Garage kit or mix individual tank parts.
5. Open Advanced settings if you want to change wind, gravity, side walls,
   rounds, interest, sudden death, arms level, or the terrain seed.
6. Start the game.

Side walls default to **Open**. **Reflective** rails bounce a shot back into
the arena; **Wrap** portals carry it across to the opposite edge without
changing its speed or direction.

### Online

Online play uses Supabase rooms. Create a public room for the room browser or a
private room for code-only access. Other players can browse, join by code, and
ready up before the host starts the match.

Online clients run the same deterministic engine locally. If a connection
drops, the client can rebuild the match from the room seed and ordered action
log.

## Read the battlefield

The right tactical rail answers the questions that matter before a shot:

- **Whose turn is it?** The active player and team color lead the turn panel.
- **What am I firing?** The selected weapon and ammo state sit beside the
  active player.
- **Where is the barrel pointed?** Elevation uses `0° = right`, `90° = up`, and
  `180° = left`.
- **How hard is the shot?** Power runs from 0 to the tank's current cap.
- **What is the wind doing?** The wind vector shows direction and magnitude.
- **Can I move?** The fuel gauge and movement controls show the current reserve.

The launch guide follows the real barrel geometry and fades after the opening
portion of the predicted trajectory. It is a ranging aid, not a target marker.

## Controls

### Keyboard

| Input | Action |
|---|---|
| `←` / `→` | Aim left or right |
| `↑` / `↓` | Increase or decrease power |
| `A` / `D` | Move left or right |
| `Q` | Cycle weapons |
| `Space` / `Enter` | Fire or activate Shield |
| `G` | Toggle the trajectory guide |
| `M` | Toggle audio |
| Hold `F` | Fast-forward the current shot locally |

Input is accepted only for the local human who owns the active turn. Aim,
power, movement, weapon selection, and fire are disabled while a shot resolves.

### Pointer

On desktop, press on the battlefield and drag outward from the active tank.
Drag direction sets the barrel angle and drag distance sets power. Releasing
does not fire, so the shot still requires `Space`, `Enter`, or the Fire control.

### Touch

Landscape touch layouts place an eight-control dock over the battlefield for
aim, power, movement, weapon selection, and Menu while keeping Fire, Store,
fuel, and Arsenal in the tactical rail. Each control has a stable accessible
name. Combat controls use the same gates as keyboard input; Menu remains
available to pause.

Portrait phones show a rotate-device gate. The game is designed around a wide
battlefield and a single fitted page.

## First Salvo

On your first eligible local turn, a compact non-modal coach walks through
three real controls: Aim, Power while reading the Wind Vector, then Fire. It
advances only when you use those controls. Choose Skip to hide it on this
browser; that choice persists. In Menu, Replay First Salvo restarts the coach
for the current match without changing the match or the saved choice.

## Weapon families

The Arsenal exposes sixteen deterministic weapons. The exact prices, blast
values, ammo, and behavior definitions live in
[`shared/src/engine/WeaponSystem.ts`](../shared/src/engine/WeaponSystem.ts).

### Direct fire

Baby Missile, Missile, and Heavy Missile form the basic damage ladder. Baby
Nuke and Nuke trade cost and scarcity for much larger blast reach.

### Airburst and spread

Cluster Bomb, MIRV, Death's Head, and Funky Bomb split or distribute damage
across a wider area. Their timing and submunition paths are generated from
deterministic inputs.

### Terrain and area denial

Dirt Bomb builds cover. Riot Bomb excavates a wide, damage-free crater to open
a lane or free a buried tank. Napalm and Hot Napalm leave spreading fire.
Sandhog enters the ground and bores a visible tunnel before its final
detonation. Bouncing Betty walks explosions across the terrain through repeated
hops.

### Defense

Shield raises a damage-absorbing field and ends the turn. It uses the same
weapon-selection and action-log path as projectile weapons.

## Movement, money, and rounds

Movement is turn-neutral but spends fuel based on distance actually traveled.
Terrain, tank collision, cliffs, bounds, and the remaining reserve can shorten
a requested move.

Damage dealt to opponents earns credits. The Store sells finite ammunition and
accessories such as Batteries and Fuel Tanks. Purchases do not end the turn.

In multi-round matches, credits, inventory, and scoreboard totals carry
forward. Health, shield, fuel, positions, terrain, and the per-round wind
sequence reset. A between-round shop opens before the next battlefield begins.

## Practical first shots

1. Check whether the target is left or right of your barrel.
2. Read the wind before changing power.
3. Use the opening guide to learn the current angle and power relationship.
4. Start with a cheap direct-fire weapon.
5. Change one variable after a miss. Large angle and power changes together
   make the result harder to read.
6. Move only when a new firing lane is worth the fuel.
