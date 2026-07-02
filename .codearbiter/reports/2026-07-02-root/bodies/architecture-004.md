# Introduce a shared Edge-Function HTTP transport — 10 hand-rolled fetch sites re-derive URL, headers, and error handling

**Severity:** low  |  **Confidence:** 0.8  |  **Effort:** M

**Where:**
- client/src/ui/Lobby.ts:839-842
- client/src/ui/Lobby.ts:1006-1009
- client/src/ui/Lobby.ts:1091-1093
- client/src/client/NetworkClient.ts:720-810

**Evidence:** Ten call sites across two files (Lobby.ts x7, NetworkClient.ts x3) each construct `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/<name>` by hand with their own header block and ad-hoc response parsing. There is no shared client helper for invoking an Edge Function; the base-URL/header/error contract is duplicated per call and drifts (Lobby uses fire-and-forget `void fetch` for heartbeat/leave, NetworkClient wraps its own retry).

**Impact:** A change to auth headers, the functions base path, or a cross-cutting concern (timeout, retry, error envelope) must be applied in ten places; new callers copy whichever nearby site they see, entrenching the divergence.

**Recommendation:** Add a single typed callFunction(name, body) transport in lib/ (base URL + anon-key headers + error envelope in one place) and route all edge-function POSTs through it; layer NetworkClient's retry on top rather than re-deriving the URL.

**Acceptance criteria:**
- a single module owns the functions/v1 base URL and default headers
- no UI or client file constructs the functions/v1 URL string inline

<!-- dedup_key: architecture:client/src:no-shared-edge-fn-transport · finding: architecture-004 -->
