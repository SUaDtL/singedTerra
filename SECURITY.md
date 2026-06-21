# Security Policy

singedTerra is a personal, hobby project — a browser artillery game — but security reports are very
welcome and taken seriously.

## Reporting a vulnerability

**Please do not open a public issue for a security vulnerability.**

- Preferred: use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
  ("Report a vulnerability" under the **Security** tab).
- Or email **brennonhuff@gmail.com** with details and, if possible, a proof of concept.

You'll get an acknowledgement as soon as practical. As a solo hobby project there is no formal SLA, but
genuine issues will be prioritized.

## The security model (so you know what's in scope)

singedTerra is intentionally designed around a **casual, no-account** model. Understanding it tells you
what is a real issue versus an accepted design tradeoff:

- **No end-user authentication; ephemeral identity.** A player is a server-minted random UUID — there
  are no passwords, no PII, and no long-lived accounts by design.
- **Trust-client gameplay.** Networked play is deterministic lockstep: clients replay an action log
  through identical engines. A client can submit actions for its own turn (and for CPU seats in its
  room); the Edge Function referee validates turn ownership and allocates sequence numbers but does not
  re-simulate physics. Gameplay-integrity abuse within a single casual room is a known tradeoff, not a
  vulnerability.
- **The Supabase anon key is public by design** — it ships in the client bundle, as Supabase intends.
  Security rests on **Row-Level Security**: all anonymous writes are denied; every mutation goes
  through a service-role Edge Function. The **service-role key never reaches the client** and is read
  only from the server environment.

### Things that ARE in scope (please report)

- Any way to read or write data that RLS should prevent (e.g. an anon write succeeding).
- Exposure of the service-role key or any server secret.
- Stored/reflected XSS or other code execution in another player's browser (e.g. via a crafted
  player name or room field).
- A way for one player to corrupt or hijack another room/player beyond the accepted single-room
  trust-client model.
- Denial-of-service or cost-amplification against the Edge Functions / database.

## Supported versions

This is a continuously-deployed single project; only the current `main` / live deployment is supported.
There are no maintained release branches.
