# Verified replay empty transport body fix

## Problem

The deployed replay probe is active, but a real zero-byte HTTP POST arrives at Supabase Edge with a non-null request-body stream. The shared no-body wrapper mistakes that empty transport stream for a payload and returns 400 before authentication.

## Bounded outcome

- No-body handlers accept an absent body or a transport-provided stream that ends without bytes.
- Any non-empty, delayed, unreadable, or non-terminating body is rejected with the existing generic 400 contract.
- Body inspection is bounded by a small chunk count and per-read deadline, occurs after rate limiting, and never parses or retains payload content.
- Existing JSON/optional-body modes and authentication behavior remain unchanged.
- The production probe reaches 401 without a bearer and succeeds with a valid signed-in user bearer.

## Out of scope

- Changing the probe response, replay workload, rate limits, authentication, persistence, schemas, or client UI.
- Accepting a JSON body or relying on client-controlled content-length metadata.

## Acceptance evidence

- RED reproduces an explicit empty transport stream returning 400.
- GREEN proves empty transport acceptance, real payload rejection, hidden payload rejection after empty chunks, timeout/error containment, and all prior wrapper behavior.
- Full engine, Edge, client, build, dependency, exact-diff, adversarial-review, hosted-CI, deployment, and production gates pass.
