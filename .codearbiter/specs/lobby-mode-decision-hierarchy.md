# Lobby Mode Decision Hierarchy

Task: `ux.menu.0003`
Decision: SMARTS ranks the user's explicit menu-coherence request first. The lobby is the roadmap's first unfinished stage, and this client-only slice has high reach with low reversible delivery risk.

## Problem

The lobby exposes accessible Hot Seat and Play Online tabs, but each selected panel starts directly with configuration fields. A player must infer the mode's purpose and the intended next action from the controls below it.

## Decision

Place one non-interactive mode context above the selected setup panel. It names the selected mode and explains its immediate journey in plain language: shared-screen setup then start for Hot Seat; create, join by code, or browse for Online. Existing controls, routes, account behavior, room behavior, and match configuration remain unchanged.

## Acceptance criteria

1. Each selected play-mode panel contains one visible heading and concise mode-specific explanation before its existing setup content.
2. The context updates with the existing Hot Seat and Play Online tab selection, including Arrow, Home, and End keyboard switching, without taking focus from the selected tab.
3. The context adds no interactive element and does not alter existing primary-action labels, callbacks, or online subview routes.
4. At desktop, landscape-touch, and compact widths, the mode heading and explanation remain inside the lobby frame and leave the existing primary action reachable.
5. No engine, input behavior, network/Supabase contract, account/persistence behavior, dependency, migration, or secret changes are permitted.

## Evidence plan

Unit-test the shell's semantic hierarchy and tab-driven context. Use the existing built-browser lobby layout guardrail across its viewport projects. Review the exact final diff with the current spec, plan, sprint log, tests, and diff. The documented H-05 sprint-log encoding exception remains scoped and non-blocking.
