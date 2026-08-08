# Nanoid audit-gate repair plan

Status: approved under standing sprint authority
Date: 2026-08-08
Task: deps.audit.0002

- [x] Reproduce the High advisory on the unchanged lockfile.
- [x] Vet the exact patched release, provenance, license, scripts, dependencies,
  compatibility, advisory status, and published delta with an independent
  dependency reviewer.
- [x] Guard the named transitive update with a dry run proving the exact
  `3.3.16` to `3.3.18` transition.
- [x] Add the reviewed root override and regenerate only the nanoid lock entry
  with lifecycle scripts disabled.
- [x] Verify the resolved graph, registry signatures and attestations, zero-High
  audit, production build, full client suite, deterministic checks, and diff
  hygiene.
- [x] Give one adversarial reviewer the spec, plan, sprint receipt, complete test
  evidence, and final diff; resolve every merge blocker.
- [x] Commit through the sanctioned gate, open a PR, and require hosted CI green
  on the exact reviewed head.
- [ ] Merge under standing authority, verify exact-main hosted health and Pages,
  then mark deps.audit.0002 done.
