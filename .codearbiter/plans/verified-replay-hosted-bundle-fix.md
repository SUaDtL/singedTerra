# Plan: verified replay hosted bundle fix

1. Add a syntax-aware recursive guard starting at the deployed Edge entry point and prove it fails on the current graph.
2. Add explicit `.ts` extensions only to reachable relative imports and enable TypeScript's no-emit support for those extensions.
3. Prove the guard and Deno graph check pass; run full engine, Edge, client, build, and dependency gates.
4. Package the exact diff and evidence for one adversarial review; resolve every merge-blocking finding.
5. Commit through the CodeArbiter gate, open a PR, require green exact-head hosted CI, merge, deploy, and verify production.
