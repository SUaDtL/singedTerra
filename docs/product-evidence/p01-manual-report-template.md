# P01 manual report template

Report only actual validated records. Begin with the source date range and the
number of final session rows. Do not create placeholder human observations.

For each stage (`guestEntry`, `firstShot`, `completedMatch`,
`voluntaryReplay`), report raw counts for:

- recorded sessions;
- eligible sessions;
- known yes and known no outcomes among eligible sessions; and
- unknown outcomes and unknown eligibility.

Repeat the same raw counts for each initiating-player history segment (`new`,
`returning`, `unknown`) and social-context segment (`solo`, `friends`). Keep
`unknown` visible; do not omit it from a denominator or convert it into a
negative outcome.

State the limits directly: owner-observed sessions of zero to two players do
not establish retention, broad demand, player satisfaction, or causal product
effects. Family/friend feedback is feedback, not broad-market evidence.

Optional `guestEntryToFirstShotMs` values in `p02-manual-v2` are elapsed-time
observations only. They do not establish newcomer understanding, voluntary
replay behavior, retention, or a causal effect of First Salvo. The schema does not record the selected launch route,
so its timing values cannot distinguish First Salvo from other entry paths.
This offline tooling adds no in-app telemetry. Do not collect or
retain them until the owner confirms the proposed consent and retention policy.

The report must contain no names, email addresses, account IDs, room codes,
URLs, tokens, connection details, or raw session records.
