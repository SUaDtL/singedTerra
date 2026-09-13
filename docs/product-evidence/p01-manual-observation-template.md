# P01 manual observation template

Use this only for an owner-observed, consented session. Do not begin real
collection until the owner confirms the proposed consent and retention policy.

Record one final object per observed session using this exact shape:

```json
{
  "schemaVersion": "p01-manual-v1",
  "sessionId": "session-0001",
  "observedOn": "2026-09-12",
  "consent": true,
  "initiatingPlayerHistory": "new",
  "socialContext": "solo",
  "participants": 1,
  "guestEntry": "yes",
  "firstShot": "yes",
  "completedMatch": "no",
  "voluntaryReplay": "not_observed",
  "status": "ended_early"
}
```

`initiatingPlayerHistory` is only the initiating player's voluntary statement or
observer-known history: `new`, `returning`, or `unknown`. Never infer it from a
mixed group. `socialContext` is `solo` only with one participant and `friends`
only with two or more.

Use `yes`, `no`, and `not_observed` exactly. A later `yes` requires the prior
stage to be `yes`: first shot follows guest entry, completed match follows first
shot, and voluntary replay follows completed match. `status` is `complete`,
`ended_early`, or `unknown`.

Use `nextManualSessionId(existingRecords)` to generate the next sequential
opaque ID (`session-0001`, then `session-0002`).
Do not append a duplicate. To correct a record, explicitly replace the one row
with the same ID after validation; never merge two rows or sum their outcomes.

Do not record names, email addresses, account IDs, player IDs, room codes,
URLs, tokens, cookies, IP addresses, device identifiers, browser/connection
details, chat, transcripts, or free-form notes. These are prohibited rather
than merely unnecessary.

Proposed policy: retain raw owner-local records for at most 30 days, then retain
only a non-identifying aggregate report. This is a proposal, not a claim about
current collection or compliance.
