# Skills production guard checks

The combat suite now performs a real paid Cannon Attack purchase while Minefield is armed and Overdrive is active. Actual kills fund the 5 Scrap debit. The test checks the catalog's level-100 to level-101 damage change, 1,125 to 1,138, while the mine damage remains captured at activation. Damaged hull, passive maximum hull, the remaining Overdrive timer and spent uses remain unchanged. Repeated projection cannot stack effects. A real run checkpoint retains the paid purchase, debit, armed damage and active timer, and restored combat matches the original future state. All ten combat tests pass.

The first revised harness attempted a nonexistent result property, then incorrectly expected a linear +10 attack increase at level 100. Those were test-author mistakes corrected to `ChargedScrap` and the existing catalog's nonlinear damage. They were not production regressions, and no runtime changes followed.

The independent mutation run compiled temporary copies of production sources and ran the existing meaningful cases against them. All four unmodified baseline cases passed; all six mutants compiled and failed the intended behavioral assertion:

| Mutated production behavior | Existing case | Detected assertion |
|---|---|---|
| Draw omits the Intel debit | progression `draw` | fixed draw retry |
| Draw calls the chooser again on confirmation | progression `draw` | fixed draw retry |
| Spent active is admitted again | combat `activation` | spent repair denied |
| Unknown spent-mask bits are admitted | combat `invalid` | unknown spent bits rejected |
| Unequipped skill can be marked spent | combat `invalid` | unequipped mine state rejected |
| Paid projection reprices previously armed mines | combat `armed-boundary` | paid attack improves weapon but cannot reprice armed mines |

The forged-state fixtures use a nonzero tick and otherwise admissible effect fields so the intended guard must reject each case. An unrelated initial-checkpoint or damage-bound guard cannot mask those removals.

[The retained JSON](guard-mutations.json) records the exact source replacement, original and mutated source hashes, successful compile exit, nonzero test exit, and actual assertion output. The harness checks every original input hash again at the end. It edits no production source or saved profile, and does not establish native/device acceptance.

Raw `sourceSha256`, `originalSourceSha256` and `mutantSourceSha256` values retain the actual tested bytes. Additional LF-normalized bindings use the recorded `CRLF-and-CR-to-LF; all other bytes preserved` mode so an LF checkout can be compared without relabeling the raw evidence. Report output and temporary mutation files use explicit LF line endings.

```powershell
python -B campaign-unity/Tools/last_stand_skills_combat/test_combat.py
python -B campaign-unity/Tools/last_stand_skills_combat/prove_skill_guards.py --output campaign-unity/docs/last-stand-skills/guard-mutations.json
```
