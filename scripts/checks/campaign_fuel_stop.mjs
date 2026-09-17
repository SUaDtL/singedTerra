// Ash Road T-20 Fuel Stop source-engine contract (AC-09).
//
// The focused source contract owns the retained transcript assertions. This
// checked-in entrypoint keeps it discoverable beside the other engine checks.
// Run: npx tsx --tsconfig=client/tsconfig.json scripts/checks/campaign_fuel_stop.mjs

const { FUEL_STOP_CHECK_SUMMARY } = await import('../../shared/src/campaign/fuelStop.test.ts')
console.log(`campaign-fuel-stop: PASS (${FUEL_STOP_CHECK_SUMMARY})`)
