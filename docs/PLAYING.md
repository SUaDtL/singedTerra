# Playing singedTerra

singedTerra is a turn-based artillery game. On each turn, one tank can aim,
change power, choose a weapon, move, buy supplies, and commit one shot. Wind,
terrain, ammunition, fuel, and credits all shape the next turn.

## Choose a route

The deployment console is the front door for every match.

- **Start First Salvo** launches a one-round CPU duel with the opening controls explained in play when that introduction has not been completed in this browser.
- **Quick Duel vs CPU** launches the selected operation. For a new browser,
  **Choose another Quick Duel** reveals alternatives; returning players see
  the operation selection directly.
- **Local Battle** opens custom Hot Seat preparation.
- **Play Online** opens room creation, code entry, and public-room browsing.

After First Salvo has been seen on the current browser, the chooser keeps the
ordinary Quick Duel route in the main deployment rail instead.

## Hot Seat preparation

Hot Seat works entirely in one browser. No account or backend is required.

The preparation screen has three tabs.

### Local Battle

1. Choose 2–4 seats.
2. Name each player and select a color.
3. Set each seat to Human or CPU.
4. Choose a Garage preset or edit individual tank parts.
5. Set rounds, wind, wall behavior, and any advanced rules.
6. Select **Deploy local battle**.

Advanced rules include gravity, battlefield world, terrain hazards, seed,
per-round interest, sudden-death timing, and store arms level. Blank fields use
the engine defaults.

With four seats, **Team mode** runs a 2v2 match. Teammates cannot damage each
other, and a round ends when only one team has living tanks or both teams have
been eliminated.

Fresh seats start with Foundry, Ranger, Bulwark, then Jackal builds. They are
examples, not locked classes. Every part can be changed before launch.

### Practice vs CPU

Practice launches one of the existing Quick Duel operations. Each card states
its battlefield, round count, opponent, wall or hazard rule, arsenal limit,
and seed when fixed. Operations with a field order track that objective during
the match without changing the underlying combat rules.

Current operations include Standard Duel, First Salvo, Crosswind Range,
Caldera Run, Last Light Siege, and Lean Arsenal.

### Verified Deployment

Verified Deployment requires a signed-in account. The server allocates an
eligible session and verifies the completed transcript before it returns a
receipt. Local play never invents a verified result.

Crosswind Qualification is a separate trial entry inside this tab. Its fixed
rules are seed 42, wrap walls, Baby Missile only, and at most three human
salvos. The defined first-clear reward is a Crosswind Qualification medal and
200 Verified Career XP; repeat clears grant 0 XP.

The Crosswind Qualification backend release, hosted capacity proof, and public
admission enablement are still pending. The client checks availability only
after an explicit click. Until the server enables the trial, that check may
return an unavailable response and no session or award is created.

## Online rooms

Online play uses Supabase rooms. Create a public room for the browser or a
private room for code-only entry. Other players can browse or join by code,
then ready up before the host starts.

Each browser runs the same deterministic engine from the room seed and ordered
action log. Supabase validates commands and assigns their order. If a
connection drops, a returning player can rebuild the match from committed
actions when the room and stored seat are still compatible.

Accounts are optional for casual rooms. A linked account can record casual
participation, but that evidence is separate from verified replay rewards.

## Garage and Vehicle Bay

Each tank has four visual slots:

- mobility;
- hull;
- turret;
- barrel.

Foundry, Ranger, Bulwark, and Jackal are complete presets. Open a player's
Garage to choose a preset or mix parts, then finish editing to return to the
Vehicle Bay. The selected tank appears there at inspection scale while the
roster keeps every seat in view. Name, color, and loadout changes are reflected
when the preparation view returns.

Tank parts are visual identity. They do not change health, power, fuel, or
weapon behavior.

## Battlefield worlds and walls

Every match uses Ember Dusk, Obsidian Caldera, or Glassstorm Expanse. The match
seed selects or retains the world consistently for every client. Atmosphere
and materials change presentation; the declared terrain hazard and match rules
still decide gameplay.

Side-wall modes change projectile behavior:

- **Open:** shots can leave the arena.
- **Reflective:** side rails bounce shots back into play.
- **Wrap:** a shot crossing one side enters from the other with its velocity intact.
- **Concrete:** the side boundary acts as an impact surface.

Reduced-motion preferences suppress transient atmosphere and movement effects
while keeping state visible.

## Read the battle console

The bronze console keeps the live decision in one place:

- the active commander, health, and team color;
- selected weapon and ammunition;
- elevation, power, and wind;
- fuel and movement controls;
- credits and Armory access;
- Fire readiness and resolving state.

Elevation follows the engine convention: `0° = right`, `90° = up`, and
`180° = left`. Power is limited by the active tank's current capacity.

The trajectory guide follows the real barrel geometry for an opening portion
of the predicted flight. It is a ranging aid. It does not mark a guaranteed
impact point.

The Match ledger keeps the roster visible and opens the Command Menu. Armory,
Settings, and First Salvo help use focused dialogs and return focus to the
control that opened them.

## Controls

### Keyboard

| Input | Action |
|---|---|
| `←` / `→` | Aim left or right |
| `↑` / `↓` | Increase or decrease power |
| `A` / `D` | Move left or right and spend fuel |
| `Q` | Select the next weapon |
| `Space` / `Enter` | Fire or activate the selected shield |
| `G` | Toggle the trajectory guide |
| `M` | Toggle audio |
| Hold `F` | Fast-forward the current shot locally |

Gameplay input is accepted only for the local human who owns the active turn.
Aim, power, movement, weapon selection, and Fire are disabled while the shot
resolves or another surface owns input.

### Pointer

With a fine pointer, press on the battlefield and drag outward from the active
tank. Direction sets barrel angle and distance sets power. Releasing does not
fire, so the shot still requires the Fire control, `Space`, or `Enter`.

### Compact and touch layouts

The compact battle console presents touch-sized controls for aim, power,
movement, weapon selection, and Fire. The controls have stable accessible
names and use the same turn, fuel, ammunition, and resolving gates as keyboard
input.

Touching or dragging on the battlefield also adjusts angle and power. It does
not fire. Portrait phones show a rotate-device gate because the battlefield is
designed for a fitted landscape stage.

## First Salvo help

The first eligible local turn can open a short field briefing, followed by
Aim, Power and Wind, then Fire guidance on the real controls. The coach advances
only after the matching action. **Skip** stores the choice in the current
browser. Command Menu can replay First Salvo help during an eligible match.

## Weapons

The Armory exposes 18 deterministic weapons. Exact price, bundle, ammo, blast,
and behavior definitions live in
[`shared/src/engine/WeaponSystem.ts`](../shared/src/engine/WeaponSystem.ts).

### Direct fire and ranging

Baby Missile, Missile, and Heavy Missile form the basic damage ladder. Baby
Nuke and Nuke trade cost and scarcity for much larger reach. Tracer is a cheap,
zero-damage ranging shot that follows real wind and collision, marks its
impact, consumes one round, and ends the turn.

### Airburst and spread

Cluster Bomb, MIRV, Death's Head, and Funky Bomb split or distribute damage
over a wider area. Their timing and submunition paths come from deterministic
inputs.

### Terrain and area control

Dirt Bomb builds cover. Riot Bomb excavates a wide damage-free crater. Napalm
and Hot Napalm leave spreading fire. Sandhog tunnels through ground before its
final detonation. Bouncing Betty walks explosions across the terrain through
repeated hops.

### Defense

Shield and Heavy Shield raise finite damage-absorbing fields and end the turn.
They use the same selection and action-log path as projectile weapons.

Terrain collapse can hurt a tank after a long drop. The first 32 pixels are
safe. Each additional pixel deals deterministic fall damage. A purchased
Parachute reduces one dangerous fall to 25% damage, then is consumed.

## Movement, credits, and rounds

Movement does not end the turn, but it spends fuel for distance actually
traveled. Terrain, tank collision, cliffs, arena bounds, burial, and remaining
fuel can shorten or reject movement.

Damage dealt to opponents earns credits. The Armory sells finite ammunition,
Batteries, Fuel Tanks, and Parachutes. Purchases do not end the turn.

In multi-round matches, credits, inventory, round wins, kills, damage totals,
and tank cosmetics carry forward. Health, shields, fuel, positions, terrain,
and the per-round wind sequence reset. A between-round shop opens before the
next battlefield begins.

## After the last shot

The After-Action Report shows the winner's customized tank and final standings.
A mutual knockout is a draw. Replay and rematch actions preserve the current
mode's rules, while **Main Menu** returns to the selected lobby route with
keyboard focus restored to a visible control.

## A useful first shot

1. Check whether the target is left or right of your barrel.
2. Read the wind.
3. Use the guide to learn the current angle and power relationship.
4. Start with Baby Missile or Tracer.
5. After a miss, change one variable at a time.
6. Move only when the new firing lane is worth the fuel.
