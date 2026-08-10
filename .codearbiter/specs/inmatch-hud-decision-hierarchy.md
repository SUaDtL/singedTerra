# In-match HUD decision hierarchy

## Problem

The combat HUD presents a strong aiming surface, but it keeps the same visual weight while a shot is sending, flying, and resolving. At that point aim, power, weapon, fire, roster, and arsenal are inactive telemetry competing with the progress and impact-learning feedback the player needs next.

## Outcome

Make the HUD explicitly state-responsive. During `PLAYER_TURN`, the active-player identity, ballistic instruments, weapon, and fire commitment remain primary. During pending fire, `FIRING`, and `RESOLVING`, the shot-progress strip moves to the first position in the command console and receives the strongest visual emphasis while inactive decision controls and secondary rail material are visibly demoted. Fine-pointer and touch command decks follow the same focus state.

## Acceptance criteria

1. The HUD exposes one deterministic focus mode: `decision`, `outcome`, or `terminal`, derived only from the current game phase and pending-fire flag.
2. `PLAYER_TURN` without pending fire uses `decision`; pending fire plus `FIRING` and `RESOLVING` use `outcome`; all other phases use `terminal`.
3. In `outcome`, the visible progress strip precedes the instruments and actions visually, remains inside the command console, and is more prominent than inactive controls.
4. The side-rail instruments, action row, roster, arsenal, and both fine-pointer and touch command decks are visually demoted in `outcome` without DOM reparenting, clipping, overlap, lost status text, or altered input/gameplay behavior.
5. The command region and touch toolbar expose their inactive outcome state to assistive technology without hiding the live progress announcement.
6. Returning to a fresh `PLAYER_TURN` restores the complete decision emphasis.
7. Real-browser proof covers the causal fire transition and computed hierarchy across desktop-fine, pixel-touch, and small-window profiles, including reduced motion.

## Boundaries

- Client HUD DOM state, injected HUD CSS, unit tests, and HUD Playwright guardrails only.
- No engine, renderer, physics, action, input binding, network, auth, persistence, Supabase, dependency, asset, or gameplay-tuning change.

## Non-goals

- Removing information or controls.
- Redesigning the Impact Monitor, tutorial, store, arsenal contents, or pre-game menu.
- Changing when a player can act.
