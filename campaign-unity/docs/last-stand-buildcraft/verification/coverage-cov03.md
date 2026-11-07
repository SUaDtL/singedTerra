# COV03: targeting and support boundaries

The focused suite passes **12 checks**, including three new behavior cases and a new mutation case. All **10 new boundary/guard mutations** fail the intended behavioral assertions after successful compilation; the three existing combat mutations still fail as expected. Mutations are confined to temporary source copies. Runtime files, numerical balance reports and their source archives are unchanged.

The new checks exercise production `Step`/`Hit` behavior with isolated, explicitly seeded foes:

- Arc acquisition at 24,999 / 25,000 / 25,001 model units, including emitted target identity and untouched outside target.
- Arc hops at exact geometric separations of 6,998 / 7,000 / 7,002 units, including ordered identities, hop source and 75% damage falloff.
- Carrier and Medic auras at 8,998 / 9,000 / 9,002 units, including affected identities, actual shield/heal event amounts, unchanged outside targets and exact budget debits.
- Five eligible allies against each role's three-target limit. Carrier coverage verifies the actual protected mask/identities and repeated protection without counting a target twice. Medic coverage verifies the first three affected identities and untouched fourth/fifth allies.
- Full finite carrier exhaustion and a partially spent Medic budget that ends partway through a pulse, with conservation and nonnegative remainder checked on every step.

Symmetric integer formation coordinates give exact squared-distance witnesses for the 7m and 9m boundaries; the tests do not substitute a radius helper for observing combat effects. These fixtures are behavioral coverage, not earned progression or rendered qualification.

The new mutation case removes both acquisition/hop range guards, tightens their inclusive boundaries, removes Carrier/Medic aura guards and target caps, and removes each finite-budget clamp. The resulting assertion markers are retained in the [GREEN and mutation transcript](coverage-cov03.log); the [source/transcript binding](coverage-cov03.json) records exact inputs and checks they remained unchanged during execution.

Changed implementation files for this finding are limited to `Tools/last_stand_buildcraft/CombatChecks.cs`, `Tools/last_stand_buildcraft/test_combat.py`, and the central test inventory. The inventory now contains 118 modules / 715 cases. Existing balance evidence remains historical and immutable; this coverage receipt supplements it.
