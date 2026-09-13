# Deployment console visual reference

Owner direction, 2026-09-13: make out-of-game UI match the real in-game HUD.
Built-in ImageGen produced deployment-console-reference.png from the rendered
in-game HUD screenshot before implementation. Generated text is illustrative:
retain the repository's actual operation titles, briefings, defaults and behavior.

Visual target: bronze/copper bevels and corner hardware; recessed dark panels;
engraved amber headings; cream readable copy; restrained cyan glass; green actual
readiness and a deep-red primary launch control matching FIRE. Use actual existing
HUD assets and typography wherever they can scale without distorting or clipping.
No decorative gauge should masquerade as a control or imply nonexistent game data.

Main entry: operation selection left, truthful battlefield preview right, compact
account/title above, substantial shared bottom rail with Local Battle, Play Online
and primary Quick Duel launch. Preserve First Salvo discovery, saved preference,
rejoin priority, imported challenge ownership and every existing account path.

Carry panel/control materials through Hot Seat, Garage, online create/join/browse/
waiting and existing preparation dialogs. Preserve P12's accessible tabs, explicit
crew controls, scrolling body and visible launch footer. Use the same styling for
existing terminal outside-game surfaces only where it preserves current geometry.
Do not modify engine, gameplay, reward, session, API, or callback semantics.

On compact landscape screens, simplify frame ornament, stack or scroll content,
and keep primary actions reachable with legible text and real touch hitboxes.
No giant fixed illustration may squeeze controls. Respect reduced motion and
preserve keyboard order, focus, contrast, accessible names and real native inputs.

Verification: focused behavior parity, selected-operation preview synchronization,
all ordinary/First Salvo/imported/rejoin/account paths, wide/standard/compact direct
visual review, actual keyboard and touch flows, full client/build and relevant
browser suites. Parent owns the sole localhost server and final delivery.
