# Ash Road Chapter One sprint receipt

Status: implementation complete; ready for owner playtest. Merge does not authorize release or deployment.

## Delivered chapter

- Four authored definitions form a three-battle run: Fuel Stop, High Road or Salvage Pit, then Relay Ridge.
- The chapter uses the shared deterministic engine through one opt-in `CampaignClient`; it does not create a second ballistics owner, a network campaign protocol, or an account-reward path.
- Authored terrain, collidable/destructible objects, causal effect chains, protected-object precedence, survival objectives, announced strikes, deterministic campaign tactics, checkpoint economy, retry, save/resume, and bounded replay are integrated.
- Three public kits expose six curated tactical weapons. Unavailable selections are skipped, while accepted canonical selection remains authoritative.
- The existing semantic battle console owns controls and dialogs. Canvas owns battlefield geometry; the existing Match instrument becomes a Mission ledger for campaign facts, and the checkpoint panel owns between-encounter decisions. No objective banner overlays the battlefield or command deck.
- Six hash-bound campaign art assets and four distinct bounded WebAudio cues ship with provenance and readable fallbacks.

## Final-review corrections

- Exact payload/revision ownership prevents stale resume overwrite and preserves read-only conflict state across transitions.
- Replay expansion is admitted against the 256-command receipt limit before engine mutation.
- Campaign terminal verdict waits for physical projectile, fire, terrain, object, zone, and warning settlement.
- Napalm burn components retain weapon and root-commitment attribution.
- Checkpoint dialogs isolate focus, weapon cycling bypasses unavailable choices, objectives/warnings are explicit, and the free hull patch is reachable through the public UI.
- Authored object art is sized independently from collision geometry, grounded by measured opaque footprints, and stripped of opaque black export padding; fallbacks preserve the same tactical labels and health facts.

## Verification boundary

The reproducible commands, counts, digests, browser matrix, and performance identities are recorded in `ash-road-verification.md`, `ash-road-performance.md`, and `ash-road-shared-digest.md`. The sole permitted ASTRA review and corrected findings are recorded in `ash-road-final-review.md`. Independent crypto, coverage, mechanics, object/effect, and deployment-metadata reviews found no remaining BLOCK-level code issue.

Machine evidence proves the implemented contracts and production-built journeys. It does not substitute for physical-phone, listening-room, new-player, or owner judgment. Those are listed in `ash-road-owner-playtest.md` and remain pending without blocking source completion.

## Delivery and rollback boundary

- PR: #514, draft until hosted CI and merge readiness are resolved.
- No self-hosted runner was registered or used.
- No release, GitHub Pages deployment, Supabase deployment, migration, paid service, or production mutation is authorized by this receipt.
- Rollback disables the local experience entry while retaining compatible device-local saves; ordinary modes and retained verified artifacts remain unchanged.
