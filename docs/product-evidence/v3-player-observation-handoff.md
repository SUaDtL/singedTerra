# V3 player observation handoff (T15)

This is preparation, not completed player evidence. Use the existing
[observation template](p01-manual-observation-template.md) and
[report template](p01-manual-report-template.md). Their consent and proposed
owner-local retention policy still apply; no collection has started here.

For each willing participant:

1. Open the reviewed game in a fresh private browser window so prior tutorial,
   account and match state do not change the entry experience. Record the tested
   release revision in the aggregate report, not in individual JSON rows.
2. Let the participant choose a route without coaching. Observe whether they
   enter a game, fire, understand the first result, and make a voluntary next
   choice. Preserve early endings and uncertainty.
3. After that choice, a neutral question such as “What happened to your shot?”
   can clarify understanding. Distinguish that answer from unprompted behavior;
   do not store quotations or participant details.
4. Write one final supported P01/P02 row and validate it with the existing
   offline helper. Do not append extra JSON keys or change the schema.
5. Add only non-identifying aggregate observations to the report, then discard
   temporary observer tallies under the agreed retention handling.

The report keeps the existing validated denominator tables. Add a separate
**manual observer synthesis**, explicitly outside the helper's validation:

- Counts by played mode, coarse device class and browser family, including
  unknowns. Do not include versions, identifiers or per-session combinations.
- Counts of understood, unclear and unobserved first results; state how each
  was assessed and how many sessions reached a result.
- Unprompted next choices: replay, another mode, exit, none observed or unknown.
- Early endings by last observed stage, including unknown stages.
- Specific product confusion, described without identifying a participant:
  for example, whether a player confused aiming with firing, could not read
  the wind, or could not find the next action. Include the observation count
  and distinguish observed behavior from a later explanation.

Do not join these aggregate observations back to opaque session records or
include raw rows, names, URLs, room/account identifiers, transcripts or quotes.
Coarse aggregate browser/device categories are context for this synthesis,
not additional raw-record fields.

Select one next tactical or navigation hypothesis only after reviewing actual
observations. Link it to the observed problem, or label it exploratory. A small
owner-observed sample does not establish retention, market demand or causality.
T15 remains open until actual observations and owner review exist; T16 and T17
retain their dependency on that evidence.
