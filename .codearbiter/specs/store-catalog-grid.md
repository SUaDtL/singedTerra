# Store Catalog Grid Sprint Spec

Status: APPROVED via the logged 2026-08-01 standing-permission override.

## Intent

Turn the in-game Store from a long, undifferentiated purchase list into a production-ready armory that helps a player understand what each item does and find it quickly without leaving the single-page battle shell.

## SMARTS decision

The chosen design is a category-first card catalog. Four visible category sections group the complete inventory, each card adds one concise behavior line, and responsive CSS lays those sections and cards into multiple columns whenever space permits. The wallet header and Close action remain outside the catalog's scroll region.

Alternatives rejected:

- Category tabs reduce height but hide most of the catalog and add interaction during a turn.
- A carousel or master-detail inspector provides more room per weapon but makes price comparison and quick buying slower.
- A dependency-backed component system adds supply-chain and bundle cost without solving a difficult interaction or rendering problem in this bounded slice.

SMARTS verdict: strong, high confidence. The category-first grid has the highest player value, preserves the existing economy contract, is easy to reverse, and can be proven with isolated metadata, DOM, and browser-layout tests.

## Catalog contract

The client owns presentation-only catalog metadata in a focused `storeCatalog.ts` module. It must cover every implemented finite-stock weapon and every accessory exactly once, without changing `WeaponSystem`, prices, bundle sizes, arms levels, inventory, or deterministic actions.

The four categories and stable item order are:

1. **Impact** — Missile, Heavy Missile, Baby Nuke, Nuke.
2. **Tactical** — Bouncing Betty, Funky Bomb, Cluster Bomb, MIRV, Death's Head.
3. **Terrain & Fire** — Dirt Bomb, Riot Bomb, Napalm, Hot Napalm, Sandhog.
4. **Systems** — Shield, Battery, Fuel Tank.

Every entry has one accurate, plain-language role line derived from the existing engine behavior. The UI must not expose exact predicted impact points or change combat information.

## Interaction and layout

- The Store remains a modal over the battlefield and preserves click-outside, Close, and existing buy callbacks.
- The panel itself does not scroll. The category catalog is the only scroll owner; the title, live credit balance, and Close action stay visible.
- Wide layouts show category sections and their item cards in multiple columns to materially reduce vertical travel.
- Compact and coarse-pointer layouts collapse progressively to readable one-column cards with at least 44px buy targets.
- Cards retain weapon glyphs, names, owned or locked state, price, and bundle/effect amount; accessories receive the same visual hierarchy without a misleading generic weapon icon.
- Buy buttons keep the current disabled rules for phase, affordability, and arms level and remain native accessible buttons.
- The Store and its active controls stay inside the modal overlay at supported browser sizes. Opening it must not cause document-level scrolling.

## Explicit non-goals

- No economy, weapon tuning, inventory, deterministic engine, Supabase, auth, migration, or network changes.
- No new dependency or generated asset.
- No filters, search, comparison drawer, animation system, or purchase confirmation.
- No redesign of the between-round shop in this sprint.

## Acceptance evidence

- Unit tests prove exact, duplicate-free catalog coverage and stable category/item order.
- HUD tests prove headings, role copy, ownership/lock content, and the unchanged purchase payloads.
- Browser tests prove the wide multi-column layout, compact one-column fallback, fixed header/footer visibility, internal scroll ownership, minimum touch target, overlay containment, and no document overflow.
- Focused tests, `npm run check`, `npm run build`, and the applicable Playwright slice pass from fresh commands.
- One adversarial subagent reviews the exact final package; all Critical, High, Medium, and merge-blocking findings are corrected.
- The exact PR head passes every required hosted check before standing merge authority is used; the resulting production deployment receives provenance and live-smoke proof.
