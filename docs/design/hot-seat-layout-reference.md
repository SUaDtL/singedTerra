# Hot Seat layout reference

The owner requested an ImageGen mockup before further implementation on 2026-09-13, then implementation against that mockup. Generated with the built-in ImageGen tool. The sibling PNG is the visual target, not a runtime image of the UI.

## Required behavior

- Local Battle, Practice vs CPU, and Verified Deployment are distinct accessible tabs. Local Battle opens directly to the existing crew controls.
- A compact header and account control leave usable space for preparation.
- Crew settings occupy the wider column, with the existing tank preview in a smaller adjacent column.
- Existing battlefield and advanced settings remain available. No gameplay, account, reward, or verification contracts change.
- The primary action remains visible in a footer while dense content scrolls. Keyboard focus and native touch scrolling must reach every control.
- Compact layouts retain readable text and usable touch targets; they may simplify decoration and stack fields.
- Verify actual local configuration changes survive deployment, plus practice and verified actions, across desktop, compact fine-pointer, and emulated landscape touch layouts.

## Generation prompt

Use case: ui-mockup.
Create a high-fidelity, implementable desktop game UI mockup for singedTerra, a browser artillery game. Use the supplied screenshot ONLY as a brand/art reference: charcoal-black background, warm brass/gold accents, subdued burgundy sunset, geometric red tracked tank, compact monospace military labels. Completely redesign its broken layout. Show one flat straight-on screen, approximately 16:9, no monitor frame, no perspective, no annotations outside the interface. This is the visual target for real HTML/CSS implementation.

Composition: modest 64px top bar with the gold wordmark "singedTerra" at left and a compact account control "SUaDtL · Level 5" at right. Under it, a small "← Deployment choices" navigation link and the single page title "Hot Seat" with one subtitle "Set your crew for a shared-screen battle." Avoid duplicated command preparation, local battery, readiness, dossier, and objective headers. Three clearly readable horizontal tabs spanning the content: "Local Battle" selected in gold, "Practice vs CPU", "Verified Deployment". Those are alternate surfaces, not simultaneously stacked cards.

The selected Local Battle body is a generous two-column layout, around 68% configuration and 32% vehicle preview, with comfortable internal gutters. LEFT: a clear "Crew" section, a compact "Players  2" dropdown, then two wide horizontal player rows. Each row shows a small color swatch, a readable name input ("Player 1" / "Player 2"), controller dropdown "Human", and an unobtrusive "Customize tank" action. Below, a "Battlefield" section with three equal, comfortably wide labeled dropdowns: "Rounds" value "3", "Wind" value "6", "Walls" value "Open". Then a quiet collapsed disclosure "Advanced settings". Use realistic form controls with visible boundaries, generous target size, and 16px or larger readable body text. No squeezed columns, tiny metadata, word-per-line wrapping, overlapping controls, or ornamental controls.

RIGHT: a smaller but handsome "Vehicle Bay" preview card. A red tank with restrained dusk light, fully contained within the upper half of the card; label "Player 1". Beneath it, two small red/blue selectable tank thumbnails and a clean two-by-two specification list: "Mobility · Tracks", "Hull · Armor Hull", "Turret · Cupola", "Barrel · Cannon". Keep decoration secondary to form controls; no huge tank background taking half the screen.

A fixed bottom action bar spans both columns and remains entirely visible. Left: concise status "2 players · 3 rounds · Shared screen". Right: one prominent gold button "Deploy local battle". This should be unmistakably the primary action. All controls, bottom bar, and text fit inside the screen with ample breathing room. The middle content can scroll on smaller screens, while header and primary action remain reachable; the desktop view shown should fit without clipping.

Visual tone: crafted artillery command room, practical game menu, restrained brass borders, crisp squared shapes with slight corner rounding, readable modern humanist sans-serif for labels/body and a sparing monospaced accent for metadata. Retain the game's recognizable atmosphere from the reference but prioritize a functional, calm, coherent hierarchy. Render all specified text accurately. No invented currencies, weapons, stats, progression changes, or additional features.
