// Cockpit HUD gauge math (GH #44): pure value->gauge mappings + on-gauge label
// formatters for the elevation / wind / power instruments.
// Run: npx tsx scripts/checks/gaugemath.mjs
//
// REFUTES "a gauge needle/fill can run past its dial" (every mapping clamps) and
// "the redesign drops the exact numbers" (label formatters reproduce them). Pure
// + DOM-free, so it runs under tsx with no browser; the SVG rendering rides these
// mappers and is covered by design review, not here.

import {
  gaugeFraction,
  windNeedleOffset,
  elevationNeedleDeg,
  elevationDegrees,
  aimDirectionGlyph,
  powerLabel,
  windMagnitudeLabel,
  windDirectionSymbol,
} from '../../client/src/ui/gaugeMath.ts';

let failures = 0;
let checks = 0;
function fail(msg) {
  failures++;
  console.log('  FAIL: ' + msg);
}
function ok(msg) {
  checks++;
  console.log('  ok:   ' + msg);
}
function eq(actual, expected, label) {
  if (actual === expected) ok(`${label} => ${JSON.stringify(actual)}`);
  else fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

console.log('gaugemath: value->gauge mappings + labels');

// OB1 — power fill: clamped linear fraction in [0,1].
eq(gaugeFraction(0, 0, 100), 0, 'gaugeFraction 0/100');
eq(gaugeFraction(100, 0, 100), 1, 'gaugeFraction 100/100');
eq(gaugeFraction(70, 0, 100), 0.7, 'gaugeFraction 70/100');
eq(gaugeFraction(-5, 0, 100), 0, 'gaugeFraction -5 clamps low');
eq(gaugeFraction(140, 0, 100), 1, 'gaugeFraction 140 clamps high');

// OB2 — wind needle: signed deflection in [-1,1], sign encodes direction.
eq(windNeedleOffset(0, 10), 0, 'wind 0 -> centered');
eq(windNeedleOffset(10, 10), 1, 'wind +max -> +1 (right)');
eq(windNeedleOffset(-10, 10), -1, 'wind -max -> -1 (left)');
eq(windNeedleOffset(15, 10), 1, 'wind over +max clamps to +1');
eq(windNeedleOffset(-15, 10), -1, 'wind over -max clamps to -1');

// OB3 — elevation needle: global barrel angle, clamped [0,180], monotonic.
eq(elevationNeedleDeg(0), 0, 'elev needle 0 (right)');
eq(elevationNeedleDeg(90), 90, 'elev needle 90 (up)');
eq(elevationNeedleDeg(180), 180, 'elev needle 180 (left)');
eq(elevationNeedleDeg(-30), 0, 'elev needle clamps low');
eq(elevationNeedleDeg(210), 180, 'elev needle clamps high');

// OB4 — label formatters reproduce the exact numbers.
eq(powerLabel(70.4), '70', 'powerLabel rounds');
eq(powerLabel(0), '0', 'powerLabel 0');
eq(windMagnitudeLabel(3.24), '3.2', 'windMagnitudeLabel one decimal');
eq(windDirectionSymbol(3.2), '→', 'windDir right');
eq(windDirectionSymbol(-3.2), '←', 'windDir left');
eq(windDirectionSymbol(0), '•', 'windDir calm');
// Elevation label: barrel-relative (0=flat..90=up) + aim-direction glyph, reused
// by HUD's aimReadout so the gauge label and the text readout never drift.
eq(elevationDegrees(45), 45, 'elevationDegrees right side');
eq(aimDirectionGlyph(45), '▶', 'aim glyph right');
eq(elevationDegrees(135), 45, 'elevationDegrees left side mirrors');
eq(aimDirectionGlyph(135), '◀', 'aim glyph left');
eq(elevationDegrees(90), 90, 'elevationDegrees straight up');
eq(aimDirectionGlyph(90), '▲', 'aim glyph up');

console.log(`\ngaugemath: ${checks} ok, ${failures} failed`);
if (failures > 0) process.exit(1);
