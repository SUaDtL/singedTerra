// ACCESSORIES check — drift guard for the accessory store catalog (se-parity-ui sprint).
// The store UI renders an accessory row from the ACCESSORIES record (name/price/bundle/armsLevel).
// Those values are SOURCED FROM the battery constants, so the store label can never silently desync
// from the engine effect. This pins that sourcing. Proves:
//   1. ACCESSORIES.battery price/bundleSize/armsLevel == the BATTERY_* constants exactly.
//   2. Each entry's `type` field matches its record key (the catalog can't mislabel an accessory).
//   3. The catalog is non-empty and every entry carries a non-empty name + blurb (renderable row).
//
// Deterministic: no Math.random / Date. Run: npx tsx scripts/checks/accessories.mjs

import {
  ACCESSORIES,
  BATTERY_PRICE,
  BATTERY_BUNDLE_SIZE,
  BATTERY_ARMS_LEVEL,
  FUEL_TANK_PRICE,
  FUEL_TANK_BUNDLE_SIZE,
  FUEL_TANK_ARMS_LEVEL,
  FUEL_TANK_FUEL,
  PARACHUTE_PRICE,
  PARACHUTE_BUNDLE_SIZE,
  PARACHUTE_ARMS_LEVEL,
} from '../../shared/src/engine/WeaponSystem.ts';

let failed = false;
const log = (...a) => console.log(...a);
const fail = (m) => { failed = true; log(`FAIL: ${m}`); };

// --- Check 1: battery catalog entry tracks the constants ---
{
  const b = ACCESSORIES.battery;
  if (!b) fail('ACCESSORIES.battery is missing');
  if (b && b.price !== BATTERY_PRICE) fail(`battery price ${b.price} != BATTERY_PRICE ${BATTERY_PRICE}`);
  if (b && b.bundleSize !== BATTERY_BUNDLE_SIZE) fail(`battery bundleSize ${b.bundleSize} != BATTERY_BUNDLE_SIZE ${BATTERY_BUNDLE_SIZE}`);
  if (b && b.armsLevel !== BATTERY_ARMS_LEVEL) fail(`battery armsLevel ${b.armsLevel} != BATTERY_ARMS_LEVEL ${BATTERY_ARMS_LEVEL}`);
  if (!failed) log('PASS: ACCESSORIES.battery price/bundle/armsLevel track the BATTERY_* constants.');
}

// --- Check 1c: Parachute catalog entry tracks its economy constants ---
{
  const parachute = ACCESSORIES.parachute;
  if (!parachute) fail('ACCESSORIES.parachute is missing');
  if (parachute && parachute.price !== PARACHUTE_PRICE) fail('parachute price drifted from PARACHUTE_PRICE');
  if (parachute && parachute.bundleSize !== PARACHUTE_BUNDLE_SIZE) fail('parachute bundleSize drifted from PARACHUTE_BUNDLE_SIZE');
  if (parachute && parachute.armsLevel !== PARACHUTE_ARMS_LEVEL) fail('parachute armsLevel drifted from PARACHUTE_ARMS_LEVEL');
  if (parachute && !parachute.blurb.includes('25%')) fail('parachute blurb must describe its reduction');
  if (!failed) log('PASS: ACCESSORIES.parachute tracks the fall-protection constants.');
}

// --- Check 1b: Fuel Tank catalog entry tracks its canonical constants ---
{
  const fuel = ACCESSORIES.fuel_tank;
  if (!fuel) fail('ACCESSORIES.fuel_tank is missing');
  if (fuel && fuel.price !== FUEL_TANK_PRICE) {
    fail(`fuel tank price ${fuel.price} != FUEL_TANK_PRICE ${FUEL_TANK_PRICE}`);
  }
  if (fuel && fuel.bundleSize !== FUEL_TANK_BUNDLE_SIZE) {
    fail(`fuel tank bundleSize ${fuel.bundleSize} != FUEL_TANK_BUNDLE_SIZE ${FUEL_TANK_BUNDLE_SIZE}`);
  }
  if (fuel && fuel.armsLevel !== FUEL_TANK_ARMS_LEVEL) {
    fail(`fuel tank armsLevel ${fuel.armsLevel} != FUEL_TANK_ARMS_LEVEL ${FUEL_TANK_ARMS_LEVEL}`);
  }
  if (fuel && !fuel.blurb.includes(String(FUEL_TANK_FUEL))) {
    fail(`fuel tank blurb does not name its ${FUEL_TANK_FUEL}-fuel effect`);
  }
  if (!failed) log('PASS: ACCESSORIES.fuel_tank tracks the canonical fuel constants.');
}

// --- Check 2: every entry's `type` matches its key (no mislabelled accessory) ---
{
  for (const [key, def] of Object.entries(ACCESSORIES)) {
    if (def.type !== key) fail(`ACCESSORIES['${key}'].type is '${def.type}' (must equal its key)`);
  }
  if (!failed) log('PASS: every accessory entry.type matches its record key.');
}

// --- Check 3: catalog is non-empty + each row is renderable ---
{
  const entries = Object.values(ACCESSORIES);
  if (entries.length === 0) fail('ACCESSORIES is empty (no accessory rows could render)');
  for (const def of entries) {
    if (!def.name) fail(`accessory '${def.type}' has no name`);
    if (!def.blurb) fail(`accessory '${def.type}' has no blurb`);
    if (!(def.price >= 0)) fail(`accessory '${def.type}' has a non-numeric/negative price`);
  }
  if (!failed) log(`PASS: ${entries.length} accessory row(s) carry name + blurb + price.`);
}

if (failed) { log('\nACCESSORIES CHECK: FAILED'); process.exit(1); }
else { log('\nACCESSORIES CHECK: PASSED'); process.exit(0); }
