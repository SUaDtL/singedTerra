# CI duplicate-work measurement

Task: `ci.efficiency.0001`. Decision: retain the current workflow. The observed
upper bound does not demonstrate a material improvement to CI completion time.

`check-work` runs `npm run check`, then the database and client suites, then
`npm run build`. The last command repeats typechecking and some compatibility
checks through the root package scripts. It also produces the required client
bundle, so deleting that entire step would remove required work.

GitHub's completed step timestamps bound the possible saving more conservatively
than a local microbenchmark. The entire final build step took only 3 to 5 seconds:

| Run and source | Final build step | check-work duration | Longest browser job |
| --- | ---: | ---: | ---: |
| [37161335435](https://github.com/SUaDtL/singedTerra/actions/runs/37161335435), `b644c7ec` | 5 s | 6m 43s | 16m 06s |
| [37162520348](https://github.com/SUaDtL/singedTerra/actions/runs/37162520348), `1b8a4e8f` | 3 s | 4m 24s | 13m 40s |
| [37163405407](https://github.com/SUaDtL/singedTerra/actions/runs/37163405407), `214e84a5` | 5 s | 6m 46s | 17m 20s |

The last run's browser job failed; its duration is diagnostic evidence, not a
passing benchmark. Both successful runs already finished `check-work` more than
nine minutes before the browser lane. Removing only its duplicated checks cannot
shorten those observed critical paths, and its runner-time saving is strictly
bounded by the whole 3-to-5-second build step. No candidate workflow change or
hosted before/after experiment was needed to establish this upper bound.

No workflow, package script, required result, browser shard, release-provenance
check, or deployment gate changed. The separate campaign readout race is fixed
through its existing browser assertion path, not through CI policy changes.
