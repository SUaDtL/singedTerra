// Generated retained cq1; MIT, singedTerra contributors. Do not regenerate in normal builds.
/** Fail closed for legacy or malformed roster metadata. */
function normalizeTeamId(value) {
	return value === 1 || value === 2 ? value : void 0;
}
/** Fail closed to the legacy open boundary at every untyped room seam. */
function normalizeWallMode(value) {
	return value === "reflective" || value === "wrap" || value === "concrete" ? value : "open";
}
/**
* Shared numeric primitives. Single source of truth so a NaN/edge-behavior change
* can't silently diverge hot-seat vs networked replay (REVIEW_BACKLOG P3-15) — the
* engine, the AI, terrain generation, and the UI all clamp the SAME way.
*/
/**
* Clamp `v` into the inclusive range [lo, hi].
*
* NaN note (preserved from every prior copy): for `v === NaN`, both `v < lo` and
* `v > hi` are false, so NaN is returned unchanged — do NOT "fix" this without
* auditing every caller, as the engine relies on this exact behavior.
*/
function clamp(v, lo, hi) {
	return v < lo ? lo : v > hi ? hi : v;
}
/**
* Terrain: a per-pixel BITMAP — a Uint8Array of length CANVAS_WIDTH*CANVAS_HEIGHT
* (index y*CANVAS_WIDTH + x), 0 = air, 1 = solid, 2 = lava. This bitmap is the canonical
* terrain held in GameState and used for O(1) collision (SPEC §4.1). It is built
* by rasterizing a midpoint-displacement HEIGHT-MAP SILHOUETTE (`generate()`
* returns the per-column surface y), then deformed on explosions (craters clear
* pixels; the Dirt Bomb sets them) and compacted by gravity, which lets unsupported
* ground fall and buries tanks.
*
* Convention (shared by all agents): y grows DOWNWARD, so a smaller surface-y is a
* taller hill. Ground occupies y from the surface down to CANVAS_HEIGHT; a point
* (x, y) is solid when its bitmap pixel is set (or y >= CANVAS_HEIGHT).
*
* Determinism: all randomness here comes from a SEEDED PRNG (mulberry32) seeded
* from the `seed` argument. No wall-clock reads, no global Math.random — same
* seed always yields identical terrain.
*/
var CANVAS_WIDTH = 1200;
/** Surface kept within these vertical bounds so tanks have sky above / ground below. */
var MIN_SURFACE_Y = Math.floor(210);
var MAX_SURFACE_Y = 400;
/**
* Seeded PRNG (mulberry32). Deterministic, fast, good enough for terrain gen.
* Returns a function yielding floats in [0, 1).
*/
function mulberry32$1(seed) {
	let a = seed;
	return function() {
		a |= 0;
		a = a + 1831565813 | 0;
		let t = Math.imul(a ^ a >>> 15, 1 | a);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
/**
* Fold an arbitrary caller-supplied seed (which may be a float, negative, NaN,
* Infinity, or larger than 2^32) into a well-mixed uint32. This avoids silent
* seed collisions: a bare `seed >>> 0` would collapse all of NaN/0/-0/Infinity/
* 2^32 to seed 0 and alias seeds differing only above bit 32. Deterministic —
* pure integer mixing, no clock or global random.
*/
function hashSeed$1(seed) {
	const n = Number.isFinite(seed) ? seed : 2654435769;
	const frac = Math.floor((n - Math.floor(n)) * 4294967296) >>> 0;
	const lo = Math.floor(n) | 0;
	const hi = Math.floor(n / 4294967296) | 0;
	let h = (lo ^ frac ^ Math.imul(hi, 2246822507)) >>> 0;
	h ^= h >>> 16;
	h = Math.imul(h, 2246822507);
	h ^= h >>> 13;
	h = Math.imul(h, 3266489909);
	h ^= h >>> 16;
	return h >>> 0;
}
/**
* Generate a reproducible height map via 1D midpoint displacement
* (diamond-square variant). Endpoints are seeded randomly, then each segment is
* recursively split: the midpoint height is the average of its endpoints plus a
* random displacement whose magnitude halves at each level of recursion.
*
* @param seed RNG seed for reproducible terrain. Same seed => identical array;
*             different seeds => different terrain.
* @returns Height map of length CANVAS_WIDTH, each value the surface y for that
*          column, within roughly [MIN_SURFACE_Y, MAX_SURFACE_Y].
*/
function generate(seed, work) {
	const rand = mulberry32$1(hashSeed$1(seed));
	const n = CANVAS_WIDTH;
	let size = 1;
	while (size + 1 < n) {
		work?.charge("terrainSteps");
		size *= 2;
	}
	const gridLen = size + 1;
	work?.charge("allocatedBytes", gridLen * Float64Array.BYTES_PER_ELEMENT);
	const heights = new Float64Array(gridLen);
	const span = 190;
	const mid = 305;
	heights[0] = mid + (rand() - .5) * span * .5;
	heights[gridLen - 1] = mid + (rand() - .5) * span * .5;
	let displacement = span * .6;
	const roughness = .5;
	for (let step = size; step > 1; step = Math.floor(step / 2)) {
		work?.charge("terrainSteps");
		const half = Math.floor(step / 2);
		for (let i = half; i < gridLen; i += step) {
			work?.charge("terrainCells");
			const left = heights[i - half];
			const right = heights[i + half];
			if (left === void 0 || right === void 0) throw new RangeError("midpoint displacement sampled outside its grid");
			const avg = (left + right) / 2;
			heights[i] = avg + (rand() - .5) * 2 * displacement;
		}
		displacement *= roughness;
	}
	work?.charge("allocatedBytes", n * Uint16Array.BYTES_PER_ELEMENT);
	const terrain = new Uint16Array(n);
	for (let x = 0; x < n; x++) {
		work?.charge("terrainCells");
		const sample = heights[Math.round(x * (gridLen - 1) / 1199)];
		if (sample === void 0) throw new RangeError("terrain sampling exceeded the generated grid");
		const y = clamp(sample, MIN_SURFACE_Y, MAX_SURFACE_Y);
		terrain[x] = Math.round(y);
	}
	return terrain;
}
/** Total pixel count of the terrain bitmap (one byte per pixel). */
var BITMAP_LEN = CANVAS_WIDTH * 600;
/** Fail closed at every untyped option seam. */
function normalizeTerrainHazardMode(value) {
	return value === "lava" ? "lava" : "none";
}
/**
* Paint deterministic exposed lava pools onto an existing ordinary bitmap.
* Placement uses only the supplied seed and avoids the initial spawn corridors.
* The helper is a no-op for legacy `none` mode and returns the number of pixels
* changed to LAVA_PIXEL.
*/
function applyTerrainHazards(bitmap, seed, mode, work) {
	if (mode !== "lava") return 0;
	const rand = mulberry32$1(hashSeed$1(seed + 1818326625));
	const poolCount = 2 + Math.floor(rand() * 3);
	let written = 0;
	for (let pool = 0; pool < poolCount; pool++) {
		work?.charge("terrainSteps");
		const center = 520 + Math.floor(rand() * 160);
		const halfWidth = 18 + Math.floor(rand() * 18);
		const depth = 6 + Math.floor(rand() * 7);
		for (let x = center - halfWidth; x <= center + halfWidth; x++) {
			work?.charge("terrainSteps");
			if (x < 0 || x >= 1200) continue;
			let surface = -1;
			for (let y = 0; y < 400; y++) {
				work?.charge("terrainCells");
				if (bitmap[y * 1200 + x] === 1) {
					surface = y;
					break;
				}
			}
			if (surface < 0) continue;
			const end = Math.min(400, surface + depth);
			for (let y = surface; y < end; y++) {
				work?.charge("terrainCells");
				const index = y * CANVAS_WIDTH + x;
				if (bitmap[index] === 1) {
					bitmap[index] = 2;
					written++;
				}
			}
		}
	}
	return written;
}
/**
* Build a pixel BITMAP (Uint8Array of length CANVAS_WIDTH*CANVAS_HEIGHT, index
* y*CANVAS_WIDTH + x, 0 = air, 1 = solid, 2 = lava) from a height LINE (one surface y per
* column, as produced by generate()). For each column x the pixels from its
* surface y down to the canvas floor are filled solid; everything above is air.
*
* Deterministic — a pure function of the input height line. The bitmap is the
* runtime representation deformed by explosions; the height line is kept only
* for generation and tank placement.
*/
function buildBitmap(heightLine, work) {
	work?.charge("allocatedBytes", BITMAP_LEN);
	const bitmap = new Uint8Array(BITMAP_LEN);
	for (let x = 0; x < CANVAS_WIDTH; x++) {
		work?.charge("terrainSteps");
		const s = clamp(heightLine[x] ?? 400, 0, 400);
		for (let y = s; y < 600; y++) {
			work?.charge("terrainCells");
			bitmap[y * CANVAS_WIDTH + x] = 1;
		}
	}
	return bitmap;
}
/**
* Pure, bounds-checked pixel lookup: a material value if (x, y) is solid, 0 if air OR
* out-of-canvas. No bottom-floor synthesis here — out-of-bounds reads return
* air; the bottom-floor collision rule lives in Physics.collide, not here.
*/
function pixelAt(bitmap, x, y, work) {
	work?.charge("terrainCells");
	if (x < 0 || x >= 1200 || y < 0 || y >= 600) return 0;
	return bitmap[y * 1200 + x] ?? 0;
}
/**
* Surface y at a given (possibly fractional) x: the topmost solid pixel in that
* column. Scans only the mutable band and returns the first solid y; if the whole
* mutable column is air, returns ARENA_FLOOR_Y (the synthesized protected floor).
* Replaces the old height-line
* surfaceAt — now derived from the live bitmap so it tracks deformation.
*/
function surfaceAt(bitmap, x, work) {
	work?.charge("terrainSteps");
	const xi = clamp(Math.floor(x), 0, 1199);
	for (let y = 0; y < 400; y++) {
		work?.charge("terrainCells");
		if ((bitmap[y * 1200 + xi] ?? 0) > 0) return y;
	}
	return 400;
}
/**
* Deform the BITMAP with a circular blast at (cx, cy) of radius r (SPEC §4.1).
*
* raise=false CLEARS (sets 0/air) every solid-or-not pixel inside the blast
* circle — a crater. raise=true FILLS (sets 1/solid) every pixel inside the
* circle — dirt/raise weapons. Iterates the bounding box ceil(c-r)..floor(c+r)
* in both axes and writes only the in-canvas pixels whose center lies within r
* of (cx, cy). Pure integer/float arithmetic on the inputs — deterministic.
*
* Returns the clamped bounding rect {xStart,xEnd,yStart,yEnd} of the pixels
* ACTUALLY written (so the gravity pass can be confined to the touched column
* range), or null if r<=0 or no pixel fell inside the canvas+circle.
*/
function deform(bitmap, cx, cy, r, raise = false, work) {
	if (r <= 0) return null;
	const r2 = r * r;
	const value = raise ? 1 : 0;
	let xMin = Infinity;
	let xMax = -Infinity;
	let yMin = Infinity;
	let yMax = -Infinity;
	const pxStart = Math.ceil(cx - r);
	const pxEnd = Math.floor(cx + r);
	const pyStart = Math.ceil(cy - r);
	const pyEnd = Math.min(Math.floor(cy + r), 399);
	for (let px = pxStart; px <= pxEnd; px++) {
		work?.charge("terrainSteps");
		if (px < 0 || px >= 1200) continue;
		const dx = px - cx;
		for (let py = pyStart; py <= pyEnd; py++) {
			work?.charge("terrainCells");
			if (py < 0 || py >= 600) continue;
			const dy = py - cy;
			if (dx * dx + dy * dy > r2) continue;
			bitmap[py * CANVAS_WIDTH + px] = value;
			if (px < xMin) xMin = px;
			if (px > xMax) xMax = px;
			if (py < yMin) yMin = py;
			if (py > yMax) yMax = py;
		}
	}
	if (xMin > xMax) return null;
	return {
		xStart: xMin,
		xEnd: xMax,
		yStart: yMin,
		yEnd: yMax
	};
}
/**
* Advance the per-column "dirt falls" settle by AT MOST `pxPerTick` pixels per
* column per call. Uses a SAND model: only UNSUPPORTED solid pixels (those with
* air directly below) fall, by exactly 1px per sub-step. `pxPerTick` sub-steps
* are run per column per call (with early-exit if the column is fully settled).
*
* Scanning bottom-up each sub-step: when a solid at y has air at y+1, the solid
* swaps down (bitmap[y+1]=1, bitmap[y]=0). This means an entire floating run
* descends exactly 1px per sub-step (the vacated row is filled by the grain
* above; the gap rises to the top of the floating mass). Supported grains (solid
* directly below, or resting on the canvas floor) never move.
*
* Properties:
*   - Strictly downward-only: no solid pixel ever moves upward.
*   - Solid-count conserved: no pixel is created or destroyed per column.
*   - Supported ground is preserved: if a solid's lower neighbour is solid it
*     never moves, so a resting floor stays in place while a floating overhang
*     above it descends independently.
*   - Convergence parity: looping to convergence produces a result byte-identical
*     to a single applyGravity call on the same input bitmap (all solids end at
*     the bottom of each column, same final compacted state).
*   - Termination: converges in at most ceil(CANVAS_HEIGHT / pxPerTick) calls.
*   - Deterministic: no Math.random, no Date, no wall-clock reads.
*
* Returns `true` iff any pixel moved this call; `false` once fully settled.
*/
function settleStep(bitmap, xStart, xEnd, pxPerTick, work) {
	const lo = Math.max(0, xStart);
	const hi = Math.min(1199, xEnd);
	let anyMoved = false;
	for (let x = lo; x <= hi; x++) {
		work?.charge("terrainSteps");
		for (let s = 0; s < pxPerTick; s++) {
			work?.charge("terrainSteps");
			let movedThisSubstep = false;
			for (let y = 398; y >= 0; y--) {
				work?.charge("terrainCells");
				const pixel = bitmap[y * 1200 + x] ?? 0;
				if (pixel > 0 && (bitmap[(y + 1) * 1200 + x] ?? 0) === 0) {
					bitmap[(y + 1) * CANVAS_WIDTH + x] = pixel;
					bitmap[y * CANVAS_WIDTH + x] = 0;
					movedThisSubstep = true;
					anyMoved = true;
				}
			}
			if (!movedThisSubstep) break;
		}
	}
	return anyMoved;
}
/** Authored visual families available to every player for free. */
var TANK_KIT_IDS = [
	"foundry",
	"ranger",
	"bulwark",
	"jackal"
];
/** Independently selectable visual slots; order is stable for UI and atlases. */
var TANK_PART_SLOTS = [
	"treads",
	"hull",
	"turret",
	"barrel"
];
var DEFAULT_TANK_LOADOUT = Object.freeze({
	treads: "foundry",
	hull: "foundry",
	turret: "foundry",
	barrel: "foundry"
});
var KIT_IDS = new Set(TANK_KIT_IDS);
function defaultLoadout() {
	return { ...DEFAULT_TANK_LOADOUT };
}
/**
* Normalize untrusted/legacy roster data. Only an exact four-field allowlisted
* object survives; everything else fails closed to a fresh Foundry preset.
*/
function normalizeTankLoadout(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return defaultLoadout();
	const record = value;
	if (Object.keys(record).length !== TANK_PART_SLOTS.length || !TANK_PART_SLOTS.every((slot) => Object.hasOwn(record, slot) && typeof record[slot] === "string" && KIT_IDS.has(record[slot]))) return defaultLoadout();
	return {
		treads: record.treads,
		hull: record.hull,
		turret: record.turret,
		barrel: record.barrel
	};
}
/**
* Napalm fire-field tuning (NAMED CONSTANTS, not magic numbers). On impact a
* burning puddle ~2*NAPALM_SPLASH wide is seeded, then creeps NAPALM_SPREAD_RATE
* columns/side/tick out to ±NAPALM_MAX_SPREAD (flowing downhill, climbing rises
* only up to NAPALM_CLIMB px). Each column burns NAPALM_BURN_TICKS ticks; a tank
* in the flames takes NAPALM_DOT per tick (so a full engulfment over the burn
* roughly totals a heavy-weapon hit, but spread out — rewarding good terrain).
*/
var NAPALM_SPLASH = 24;
var NAPALM_MAX_SPREAD = 90;
var NAPALM_SPREAD_RATE = 3;
var NAPALM_BURN_TICKS = 78;
var NAPALM_DOT = .7;
var NAPALM_CLIMB = 6;
/**
* Hot Napalm — a hotter, wider, longer-burning variant of the napalm field. It
* runs the SAME deterministic processFire path; only the tuning is escalated.
* Peak total burn ≈ HOT_NAPALM_DOT * HOT_NAPALM_BURN_TICKS ≈ 95 — heavy sustained
* area denial (vs ~55 for regular napalm). Tunable in playtesting.
*/
var HOT_NAPALM_SPLASH = 30;
var HOT_NAPALM_MAX_SPREAD = 120;
var HOT_NAPALM_SPREAD_RATE = 4;
var HOT_NAPALM_BURN_TICKS = 100;
var HOT_NAPALM_DOT = .95;
var HOT_NAPALM_CLIMB = 8;
/**
* Shield force-field tuning. Activating the shield grants this many HP of damage
* absorption (a pool, not a hit count — see ShieldDef). 120 => soaks one full nuke
* (max 100) plus a glance, ~2 missiles (60 each), or one napalm burn (~55 total),
* then the next overflow leaks to health. Chosen so a bought shield is worth its
* credits without being immune to sustained heavy fire. Tunable in playtesting.
*/
var SHIELD_CAPACITY = 120;
var HEAVY_SHIELD_CAPACITY = 240;
/**
* Store economy tuning (SPEC §9). Credits use the Scorched Earth scale (weapons
* cost thousands), so earnings are scaled to match: a tank starts with
* STARTING_CREDITS, earns CREDITS_PER_DAMAGE per point of damage dealt to an
* opponent, plus a flat TURN_STIPEND each shot (so even a miss pays a little).
* A clean kill (~100 dmg) nets ~CREDITS_PER_DAMAGE*100 + stipend ≈ a Baby Nuke.
* All integers / pure arithmetic — deterministic, no RNG.
*/
var STARTING_CREDITS = 8e3;
/**
* Battery accessory economy (SE-parity). A Battery raises a tank's `powerCap` above the 100
* baseline so a player can INVEST credits to extend range on the 1200px field. Values are
* the canonical Scorched Earth 1991 catalog ($5000 / bundle of 10, +10 power per unit,
* arms-level 2 — see docs/reference/scorched_earth_1991_catalog.ts) as NAMED, playtest-
* tunable constants. One purchase grants the whole bundle: +PER_UNIT*BUNDLE_SIZE cap.
*/
var BATTERY_PRICE = 5e3;
/**
* Fuel Tank accessory economy (SE-parity). The canonical catalog sells ten
* tanks at ten fuel units each for $10,000 at arms level 3.
*/
var FUEL_TANK_PRICE = 1e4;
/** One-use fall protection. A parachute reduces one dangerous collapse fall to 25% damage. */
var PARACHUTE_PRICE = 4e3;
/**
* Weapon definition table. Implemented entries carry playable tuning while the
* union remains exhaustive so the client can render the complete shop catalog.
*/
var WEAPONS = {
	baby_missile: {
		type: "baby_missile",
		name: "Baby Missile",
		implemented: true,
		price: 400,
		bundleSize: 10,
		armsLevel: 0,
		detonation: {
			radius: 18,
			maxDamage: 34,
			falloffExponent: 2,
			style: "blast",
			color: "#ffb347",
			durationFrames: 85
		}
	},
	missile: {
		type: "missile",
		name: "Missile",
		implemented: true,
		price: 1875,
		bundleSize: 5,
		armsLevel: 0,
		detonation: {
			radius: 30,
			maxDamage: 60,
			falloffExponent: 2,
			style: "blast",
			color: "#ff6a2b",
			durationFrames: 100
		}
	},
	heavy_missile: {
		type: "heavy_missile",
		name: "Heavy Missile",
		implemented: true,
		price: 6e3,
		bundleSize: 3,
		armsLevel: 1,
		detonation: {
			radius: 50,
			maxDamage: 85,
			style: "blast",
			color: "#ff6600",
			durationFrames: 110
		}
	},
	baby_nuke: {
		type: "baby_nuke",
		name: "Baby Nuke",
		implemented: true,
		price: 1e4,
		bundleSize: 3,
		armsLevel: 0,
		detonation: {
			radius: 65,
			maxDamage: 90,
			style: "blast",
			color: "#fff27a",
			durationFrames: 95
		}
	},
	nuke: {
		type: "nuke",
		name: "Nuke",
		implemented: true,
		price: 12e3,
		bundleSize: 1,
		armsLevel: 1,
		detonation: {
			radius: 90,
			maxDamage: 100,
			style: "blast",
			color: "#fff7c2",
			durationFrames: 115
		}
	},
	dirt_bomb: {
		type: "dirt_bomb",
		name: "Dirt Bomb",
		implemented: true,
		price: 5e3,
		bundleSize: 5,
		armsLevel: 0,
		detonation: {
			radius: 50,
			maxDamage: 0,
			raisesTerrain: true,
			style: "blast",
			color: "#a9744f",
			durationFrames: 52
		}
	},
	bouncing_betty: {
		type: "bouncing_betty",
		name: "Bouncing Betty",
		implemented: true,
		price: 6e3,
		bundleSize: 5,
		armsLevel: 2,
		detonation: {
			radius: 30,
			maxDamage: 55,
			style: "blast",
			color: "#ff8c42",
			durationFrames: 52
		},
		behavior: { bounce: {
			maxBounces: 3,
			restitution: .7,
			detonateEachBounce: true,
			hopBoost: 2.6
		} }
	},
	funky_bomb: {
		type: "funky_bomb",
		name: "Funky Bomb",
		implemented: true,
		price: 7e3,
		bundleSize: 2,
		armsLevel: 4,
		detonation: {
			radius: 25,
			maxDamage: 45,
			style: "blast",
			color: "#d65cff",
			durationFrames: 52
		},
		behavior: { airburst: {
			trigger: "age",
			count: 5,
			spread: 1.5,
			ageFrames: 40
		} }
	},
	napalm: {
		type: "napalm",
		name: "Napalm",
		implemented: true,
		price: 1e4,
		bundleSize: 10,
		armsLevel: 2,
		detonation: {
			radius: 34,
			maxDamage: 0,
			style: "blast",
			color: "#ff5a1f",
			durationFrames: 40
		},
		behavior: { napalm: {
			splashRadius: NAPALM_SPLASH,
			maxSpread: NAPALM_MAX_SPREAD,
			spreadRate: NAPALM_SPREAD_RATE,
			burnTicks: NAPALM_BURN_TICKS,
			dotPerTick: NAPALM_DOT,
			climbLimit: NAPALM_CLIMB
		} }
	},
	cluster_bomb: {
		type: "cluster_bomb",
		name: "Cluster Bomb",
		implemented: true,
		price: 1e4,
		bundleSize: 3,
		armsLevel: 2,
		detonation: {
			radius: 18,
			maxDamage: 28,
			style: "cluster",
			color: "#ffd23f",
			durationFrames: 60
		},
		behavior: { airburst: {
			trigger: "apex",
			count: 5,
			spread: .5
		} }
	},
	mirv: {
		type: "mirv",
		name: "MIRV",
		implemented: true,
		price: 14e3,
		bundleSize: 2,
		armsLevel: 3,
		detonation: {
			radius: 32,
			maxDamage: 50,
			style: "cluster",
			color: "#ffae3d",
			durationFrames: 80
		},
		behavior: { airburst: {
			trigger: "apex",
			count: 3,
			spread: .7
		} }
	},
	deaths_head: {
		type: "deaths_head",
		name: "Death's Head",
		implemented: true,
		price: 24e3,
		bundleSize: 1,
		armsLevel: 4,
		detonation: {
			radius: 36,
			maxDamage: 55,
			style: "cluster",
			color: "#ff4d4d",
			durationFrames: 85
		},
		behavior: { airburst: {
			trigger: "apex",
			count: 7,
			spread: 1
		} }
	},
	riot_bomb: {
		type: "riot_bomb",
		name: "Riot Bomb",
		implemented: true,
		price: 3e3,
		bundleSize: 5,
		armsLevel: 1,
		detonation: {
			radius: 55,
			maxDamage: 0,
			style: "blast",
			color: "#cdbf9a",
			durationFrames: 42
		}
	},
	hot_napalm: {
		type: "hot_napalm",
		name: "Hot Napalm",
		implemented: true,
		price: 16e3,
		bundleSize: 5,
		armsLevel: 3,
		detonation: {
			radius: 40,
			maxDamage: 0,
			style: "blast",
			color: "#ff3a00",
			durationFrames: 44
		},
		behavior: { napalm: {
			splashRadius: HOT_NAPALM_SPLASH,
			maxSpread: HOT_NAPALM_MAX_SPREAD,
			spreadRate: HOT_NAPALM_SPREAD_RATE,
			burnTicks: HOT_NAPALM_BURN_TICKS,
			dotPerTick: HOT_NAPALM_DOT,
			climbLimit: HOT_NAPALM_CLIMB
		} }
	},
	sandhog: {
		type: "sandhog",
		name: "Sandhog",
		implemented: true,
		price: 16750,
		bundleSize: 5,
		armsLevel: 0,
		detonation: {
			radius: 38,
			maxDamage: 70,
			style: "blast",
			color: "#f3a83b",
			durationFrames: 88
		},
		behavior: { sandhog: {
			ticks: 22,
			horizontalSpeed: 3.2,
			verticalSpeed: 2.4,
			tunnelRadius: 7
		} }
	},
	tracer: {
		type: "tracer",
		name: "Tracer",
		implemented: true,
		price: 10,
		bundleSize: 20,
		armsLevel: 0,
		detonation: {
			radius: 10,
			maxDamage: 0,
			preservesTerrain: true,
			style: "blast",
			color: "#55e6ff",
			durationFrames: 28
		}
	},
	shield: {
		type: "shield",
		name: "Shield",
		implemented: true,
		price: 2e4,
		bundleSize: 3,
		armsLevel: 3,
		detonation: {
			radius: 0,
			maxDamage: 0,
			style: "blast",
			color: "#7ad7ff",
			durationFrames: 50
		},
		behavior: { shield: { capacity: SHIELD_CAPACITY } }
	},
	heavy_shield: {
		type: "heavy_shield",
		name: "Heavy Shield",
		implemented: true,
		price: 3e4,
		bundleSize: 2,
		armsLevel: 4,
		detonation: {
			radius: 0,
			maxDamage: 0,
			style: "blast",
			color: "#b77aff",
			durationFrames: 60
		},
		behavior: { shield: { capacity: HEAVY_SHIELD_CAPACITY } }
	}
};
/** Look up a weapon definition by type. Fails fast on an unknown key rather than
*  returning `undefined` and crashing later on a `.detonation`/`.airburst` access.
*  The networked referee (submit_action/validate.ts) rejects unknown weapon strings
*  before they enter the action log, so this guard should never fire for a validated
*  room — it exists so a bad/legacy/skewed log row surfaces a clear error instead of
*  a cryptic `undefined` crash. Deterministic: every client throws identically. */
function getWeapon(type) {
	const def = WEAPONS[type];
	if (!def) throw new Error(`getWeapon: unknown weapon type "${type}"`);
	return def;
}
/** MVP0 default aiming/loadout values. */
var DEFAULT_ANGLE = 45;
var DEFAULT_POWER = 50;
var DEFAULT_HEALTH = 100;
var DEFAULT_WEAPON = "baby_missile";
/**
* Per-weapon STARTING loadout (SPEC §9 economy). A tank opens with unlimited Baby
* Missile plus a small mid-tier kit; the premium NUKE tier (baby_nuke, nuke) and
* extra rounds must be BOUGHT from the store with credits earned per damage dealt.
* This is what makes the credits/buy/earn loop actually change decisions — see
* REVIEW_BACKLOG.md task P0-1. Deterministic: pure literals. Tune in playtesting;
* the AI's chooseWeapon() only picks weapons it actually has, so it degrades
* gracefully (heavy_missile -> missile -> baby_missile) as stock runs down.
*/
var START_AMMO = {
	missile: 4,
	heavy_missile: 1,
	cluster_bomb: 2,
	bouncing_betty: 2,
	funky_bomb: 1,
	napalm: 1,
	dirt_bomb: 1,
	riot_bomb: 1,
	shield: 1,
	baby_nuke: 0,
	nuke: 0,
	mirv: 0,
	deaths_head: 0,
	hot_napalm: 0,
	sandhog: 1,
	tracer: 1,
	heavy_shield: 1
};
/** Horizontal placement fractions for the two MVP0 tanks. */
var LEFT_TANK_FRACTION = .15;
var RIGHT_TANK_FRACTION = .85;
/** Distinct default colors for the two MVP0 tanks. */
var TANK_COLORS = ["#e84d4d", "#4d8ce8"];
/**
* Default color palette for multi-player (2–4) placement. The first two entries
* match the MVP0 two-tank colors so a 2-player game looks identical whether it
* goes through placeTwoTanks or placeTanks with default colors.
*/
var MULTI_TANK_COLORS = [
	"#e84d4d",
	"#4d8ce8",
	"#4de87a",
	"#e8c84d"
];
/** Inclusive horizontal spread band (canvas fractions) for N evenly-spaced tanks. */
var SPREAD_MIN_FRACTION = .1;
/**
* Default loadout (Sprint 4, generous sandbox): baby_missile is unlimited; every
* other weapon starts with DEFAULT_AMMO rounds. No Infinity sentinel — the
* `unlimited` flag carries that meaning so inventory JSON round-trips cleanly.
* Deterministic: a pure literal, no clock/random.
*/
function defaultInventory() {
	const limited = (count) => ({
		count,
		unlimited: false
	});
	return {
		baby_missile: {
			count: 0,
			unlimited: true
		},
		missile: limited(START_AMMO.missile),
		heavy_missile: limited(START_AMMO.heavy_missile),
		baby_nuke: limited(START_AMMO.baby_nuke),
		nuke: limited(START_AMMO.nuke),
		dirt_bomb: limited(START_AMMO.dirt_bomb),
		bouncing_betty: limited(START_AMMO.bouncing_betty),
		funky_bomb: limited(START_AMMO.funky_bomb),
		napalm: limited(START_AMMO.napalm),
		cluster_bomb: limited(START_AMMO.cluster_bomb),
		mirv: limited(START_AMMO.mirv),
		deaths_head: limited(START_AMMO.deaths_head),
		riot_bomb: limited(START_AMMO.riot_bomb),
		hot_napalm: limited(START_AMMO.hot_napalm),
		sandhog: limited(START_AMMO.sandhog),
		tracer: limited(START_AMMO.tracer),
		shield: limited(START_AMMO.shield),
		heavy_shield: limited(START_AMMO.heavy_shield)
	};
}
function defaultAccessories() {
	return {
		battery: 0,
		fuel_tank: 0,
		parachute: 0
	};
}
/** Snap an x-position to a surface y-height from the terrain height map. */
function surfaceY(x, terrain) {
	return terrain[Math.min(Math.max(Math.round(x), 0), terrain.length - 1)] ?? 600;
}
/**
* Create a fresh tank snapped onto the terrain surface at column `x`, with
* MVP0 default aiming and loadout. Deterministic (no clock / random reads).
*/
function createTank(id, playerName, x, terrain, color, ai = null, loadout, team = null) {
	return {
		id,
		playerName,
		x,
		y: surfaceY(x, terrain),
		angle: DEFAULT_ANGLE,
		power: DEFAULT_POWER,
		powerCap: 100,
		health: DEFAULT_HEALTH,
		fuel: 100,
		selectedWeapon: DEFAULT_WEAPON,
		inventory: defaultInventory(),
		accessories: defaultAccessories(),
		color,
		loadout: normalizeTankLoadout(loadout),
		alive: true,
		shieldHp: 0,
		credits: STARTING_CREDITS,
		roundWins: 0,
		kills: 0,
		totalDamage: 0,
		buried: false,
		buriedTurns: 0,
		ai,
		team
	};
}
/**
* Place exactly two tanks at ~15% and ~85% of CANVAS_WIDTH, each resting on the
* terrain surface, with distinct colors. Deterministic — the optional
* `GameOptions` is accepted for signature parity but placement does not depend
* on any random source.
*/
function placeTwoTanks(terrain, opts) {
	const leftX = Math.round(CANVAS_WIDTH * LEFT_TANK_FRACTION);
	const rightX = Math.round(CANVAS_WIDTH * RIGHT_TANK_FRACTION);
	return orientTanksTowardNearestOpponent([createTank("p1", "Player 1", leftX, terrain, TANK_COLORS[0]), createTank("p2", "Player 2", rightX, terrain, TANK_COLORS[1])]);
}
/**
* Place N (2–4) tanks spread evenly across the canvas in the inclusive band
* [SPREAD_MIN_FRACTION, SPREAD_MAX_FRACTION], each resting on the terrain
* surface, using each player's name + color. Ids are 'p1'..'pN'. Deterministic:
* placement depends only on N and the terrain, never on a random source.
*
* For N=2 this yields x at 0.1 and 0.9 — intentionally NOT the same as
* placeTwoTanks (0.15 / 0.85): callers wanting the exact MVP0 two-tank layout
* must use placeTwoTanks. Colors default to MULTI_TANK_COLORS when a player
* omits one.
*/
function placeTanks(terrain, players, opts) {
	const n = players.length;
	const explicitTeams = players.map((player) => normalizeTeamId(player.team));
	const hasValidExplicitTeams = explicitTeams.every((team) => team !== void 0) && explicitTeams.filter((team) => team === 1).length === 2 && explicitTeams.filter((team) => team === 2).length === 2;
	const tanks = [];
	for (const [i, player] of players.entries()) {
		const frac = n <= 1 ? SPREAD_MIN_FRACTION : SPREAD_MIN_FRACTION + .8 * (i / (n - 1));
		const x = Math.round(CANVAS_WIDTH * frac);
		const color = player.color ?? MULTI_TANK_COLORS[i % MULTI_TANK_COLORS.length] ?? MULTI_TANK_COLORS[0];
		tanks.push(createTank(`p${i + 1}`, player.name, x, terrain, color, player.ai ?? null, player.loadout, opts?.teamMode === true && n === 4 ? hasValidExplicitTeams ? explicitTeams[i] : i % 2 === 0 ? 1 : 2 : null));
	}
	return orientTanksTowardNearestOpponent(tanks);
}
/**
* Point each fresh tank toward its nearest opponent. Array order is the
* deterministic tie-break, so a centered tank aims left when neighbors are
* equidistant. Placement and every round reset share this path.
*/
function orientTanksTowardNearestOpponent(tanks) {
	for (const tank of tanks) {
		let nearest;
		let nearestDistance = Number.POSITIVE_INFINITY;
		for (const candidate of tanks) {
			if (candidate.id === tank.id) continue;
			const distance = Math.abs(candidate.x - tank.x);
			if (distance < nearestDistance) {
				nearest = candidate;
				nearestDistance = distance;
			}
		}
		if (nearest) tank.angle = nearest.x < tank.x ? 135 : 45;
	}
	return tanks;
}
/**
* Barrel-end point (projectile spawn) along the tank's aim vector, from the
* barrel pivot at the turret top (BARREL_PIVOT_HEIGHT above the tank base).
*
* Angle convention (SPEC §6): degrees, 0 = right (+x), 90 = up (screen −y).
* tip = (tank.x + len*cosθ, tank.y − BARREL_PIVOT_HEIGHT − len*sinθ).
*/
function barrelTip(tank, length) {
	const rad = tank.angle * Math.PI / 180;
	return {
		x: tank.x + length * Math.cos(rad),
		y: tank.y - 20 - length * Math.sin(rad)
	};
}
/**
* Tank entity helpers operating on the serializable `TankState`. Kept as plain
* functions (rather than a stateful class) so state stays JSON-serializable for
* GameState broadcast.
*/
var Tank = { 
/** Apply damage, clamping health to [0, 100] and updating `alive`. */
applyDamage(tank, amount) {
	tank.health = Math.min(100, Math.max(0, tank.health - amount));
	tank.alive = tank.health > 0;
} };
/**
* Deterministic projectile physics (SPEC §4.2). Fixed 16ms timestep so hot-seat
* and networked execution produce identical results — no wall-clock time, no
* mid-flight randomness, no clock-derived dt.
*
* Angle/launch convention (SPEC §6): angle in degrees, 0° = right (+x),
* 90° = up (screen −y). Barrel unit vector is (cos θ, −sin θ).
*
* Coordinate convention: x in [0, CANVAS_WIDTH) left→right; y grows DOWNWARD.
* terrain[x] is the surface y at column x; a point is underground when
* y >= terrain[floor(x)].
*/
/** Gravity acceleration in px/tick (SPEC §4.2, §12). Added to vy each tick. */
var GRAVITY = .15;
/** Per-tick horizontal acceleration multiplier applied to the wind value. */
var WIND_FACTOR = .006;
/**
* Max amount the wind may change from one turn to the next (gentle drift). Wind
* walks by a delta in [-WIND_DRIFT_STEP, +WIND_DRIFT_STEP] per turn (then clamps
* to [-maxWind, +maxWind]) so players can range/walk shots in across turns.
*/
var WIND_DRIFT_STEP = 2.5;
/**
* Launch speed (px/tick) per unit of power (power is 0–100). Tunable
* (~0.12–0.3); with power 100 this yields a muzzle speed of ~16.5 px/tick.
* Retuned 0.24 -> 0.165 alongside the 1200×600 field (Terrain.CANVAS_*): max-power
* flat range is now ~1.5× the map width (was ~4.8×), so the full 0–100 power dial
* is meaningful and crossing the field at 45° needs ~power 70 (was ~38). Longer
* flights also give wind more influence, so games run more turns (playtest note).
*/
var POWER_SCALE = .165;
/** Degrees → radians. */
var DEG_TO_RAD = Math.PI / 180;
/**
* Launch velocity for a shot fired at `angleDeg` (0 = right, 90 = up) with the
* given `power` (0–100). Up is screen −y, hence the −sin term.
*/
function launchVelocity(angleDeg, power) {
	const theta = angleDeg * DEG_TO_RAD;
	const speed = power * POWER_SCALE;
	return {
		vx: speed * Math.cos(theta),
		vy: -speed * Math.sin(theta)
	};
}
/**
* Advance a projectile by one fixed timestep (SPEC §4.2):
*   vy += gravity; vx += wind * WIND_FACTOR; vx/vy *= 1 - PROJECTILE_DRAG;
*   x += vx; y += vy.
* Mutates and returns the projectile. dt is constant — never read from a clock.
*
* `gravity` defaults to the GRAVITY constant so existing 2-arg callers keep
* working unchanged; the engine threads a per-room override (GameOptions.gravity).
*/
function stepProjectile(p, wind, gravity = GRAVITY) {
	p.vy += gravity;
	p.vx += wind * WIND_FACTOR;
	p.vx *= .99;
	p.vy *= .99;
	p.x += p.vx;
	p.y += p.vy;
	return p;
}
/**
* Sweep collision along the segment from a projectile's pre-step position
* (prevX, prevY) to its post-step position (p.x, p.y), testing intermediate
* points so a fast shot cannot tunnel through a thin terrain spike or a tank
* (the per-tick displacement can exceed TANK_WIDTH at high power).
*
* The segment is supersampled into ceil(distance / SWEEP_STEP) sub-steps and
* `collide` is tested at each interpolated point (including the endpoint). The
* FIRST hit along the path wins, so collisions register at the entry point
* rather than wherever the endpoint happened to land. Fully deterministic — the
* sub-step count and interpolation depend only on the input coordinates.
*/
function sweepCollide(p, prevX, prevY, terrain, tanks, walls = "open", work) {
	work?.charge("sweepSegments");
	const endX = p.x;
	const endY = p.y;
	const dx = endX - prevX;
	const dy = endY - prevY;
	const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 1));
	const probe = {
		x: prevX,
		y: prevY,
		vx: p.vx,
		vy: p.vy,
		weaponType: p.weaponType,
		age: p.age,
		hasSplit: p.hasSplit,
		bounces: p.bounces
	};
	for (let i = 1; i <= steps; i++) {
		work?.charge("sweepSamples");
		const t = i / steps;
		probe.x = prevX + dx * t;
		probe.y = prevY + dy * t;
		const hit = collide(probe, terrain, tanks, walls, work);
		if (hit.type !== "none") {
			if (hit.type === "wall" && walls === "wrap") {
				const boundaryX = hit.side === "left" ? 0 : CANVAS_WIDTH;
				const contactY = prevY + dy * (dx === 0 ? t : clamp((boundaryX - prevX) / dx, 0, 1));
				hit.y = contactY;
				hit.remainingX = endX - boundaryX;
				hit.remainingY = endY - contactY;
				p.x = boundaryX;
				p.y = contactY;
				return hit;
			}
			if (hit.type === "wall" && walls === "concrete") {
				const boundaryX = hit.side === "left" ? 0 : CANVAS_WIDTH;
				const contactY = prevY + dy * (dx === 0 ? t : clamp((boundaryX - prevX) / dx, 0, 1));
				hit.y = contactY;
				p.x = hit.x;
				p.y = contactY;
				return hit;
			}
			if (hit.type === "ground" && probe.y >= 400 && prevY < 400 && endY >= 400) {
				const contactX = prevX + dx * (dy === 0 ? t : clamp((400 - prevY) / dy, 0, 1));
				hit.x = contactX;
				hit.y = 400;
				p.x = contactX;
				p.y = 400;
				return hit;
			}
			p.x = probe.x;
			p.y = probe.y;
			return hit;
		}
	}
	return { type: "none" };
}
/**
* Test a projectile against bounds, tanks, and terrain for this tick. Checked
* in priority order: out-of-bounds → tank → ground. Call AFTER integrating.
*
* - OOB: x < 0 || x >= CANVAS_WIDTH (x===0 ok, x===CANVAS_WIDTH-1 ok).
* - Tank: AABB of width TANK_WIDTH / height TANK_HEIGHT, centered on tank.x
*   with its base at tank.y (box spans [tank.y - h, tank.y]).
* - Ground: logical arena floor (y >= ARENA_FLOOR_Y) or a solid bitmap pixel at
*   (floor(x), floor(y)).
*/
function collide(p, terrain, tanks, walls = "open", work) {
	work?.charge("collisionChecks");
	if (p.x < 0 || p.x >= 1200) {
		if (walls === "reflective" || walls === "wrap" || walls === "concrete") return p.x < 0 ? {
			type: "wall",
			side: "left",
			x: WALL_INSET,
			y: p.y
		} : {
			type: "wall",
			side: "right",
			x: CANVAS_WIDTH - WALL_INSET,
			y: p.y
		};
		return { type: "oob" };
	}
	const halfW = 10;
	for (const tank of tanks) {
		work?.charge("engineSteps");
		if (tank.alive === false) continue;
		const left = tank.x - halfW;
		const right = tank.x + halfW;
		const top = tank.y - 12;
		const bottom = tank.y;
		if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) return {
			type: "tank",
			tankId: tank.id,
			x: p.x,
			y: p.y
		};
	}
	const xi = Math.floor(p.x);
	if (p.y >= 400) return {
		type: "ground",
		x: p.x,
		y: p.y,
		material: "ground"
	};
	const pixel = pixelAt(terrain, xi, Math.floor(p.y), work);
	if (pixel > 0) return {
		type: "ground",
		x: p.x,
		y: p.y,
		material: pixel === 2 ? "lava" : "ground"
	};
	return { type: "none" };
}
/** Keep a reflected shell safely inside the next collision probe. */
var WALL_INSET = .01;
/** Reflect one exact horizontal-wall contact without changing vertical motion. */
function reflectSideWall(p, hit) {
	p.x = hit.x;
	p.y = hit.y;
	p.vx = hit.side === "left" ? Math.abs(p.vx) : -Math.abs(p.vx);
	return p;
}
/**
* Transfer one exact wrap-wall contact to the paired rail, then sweep the
* unconsumed part of this fixed tick for an immediate entry-side collision.
* Every projectile field except position is preserved.
*/
function wrapSideWall(p, hit, terrain, tanks, work) {
	const entryX = hit.side === "left" ? CANVAS_WIDTH - WALL_INSET : WALL_INSET;
	const endX = entryX + (hit.remainingX ?? 0);
	const endY = hit.y + (hit.remainingY ?? 0);
	p.x = entryX;
	p.y = hit.y;
	const entryHit = collide(p, terrain, tanks, "open", work);
	if (entryHit.type !== "none") return entryHit;
	p.x = endX;
	p.y = endY;
	return sweepCollide(p, entryX, hit.y, terrain, tanks, "open", work);
}
var BOUNCE_RESTITUTION = .7;
/** Column half-window sampled either side of the impact x to estimate the slope. */
var NORMAL_SAMPLE_DX = 2;
/**
* Derive a unit surface normal at impact x from neighboring-column surface
* heights (the bitmap has no stored normals). Central-difference the surface y
* over [x-NORMAL_SAMPLE_DX, x+NORMAL_SAMPLE_DX]:
*   slope = (surfaceAt(x+dx) - surfaceAt(x-dx)) / (2*dx)   // dy per dx, y down
* The outward (up-and-away-from-ground) normal of a height field y=f(x) is
* proportional to (slope, -1) (points toward -y / sky), normalized:
*   n = normalize( slope, -1 )
* Flat ground: slope=0 => n=(0,-1) (straight up) => a vertical drop reflects to
* a vertical bounce. Steep/near-vertical wall: |slope| huge => n ≈ (+/-1, ~0)
* (horizontal) => a horizontal shot reflects back horizontally. Sampling reads
* only surfaceAt() (pure bitmap scan) so it is fully replicated state.
*
* Edge guard: columns are clamped in-bounds by surfaceAt itself, so x near
* 0/799 is safe. An all-air column yields surfaceAt == CANVAS_HEIGHT on both
* sides => slope 0 => n=(0,-1), the safe default.
*/
function surfaceNormalAt(terrain, x, work) {
	const left = surfaceAt(terrain, x - NORMAL_SAMPLE_DX, work);
	const nx = (surfaceAt(terrain, x + NORMAL_SAMPLE_DX, work) - left) / 4;
	const ny = -1;
	const mag = Math.hypot(nx, ny);
	return {
		vx: nx / mag,
		vy: ny / mag
	};
}
/**
* Reflect velocity v about unit normal n: v' = v - 2(v·n)n, then scale by
* restitution. Pure float math — identical on replay. (Velocity reuses the
* {vx,vy} shape.)
*/
function reflectVelocity(v, n, restitution = BOUNCE_RESTITUTION) {
	const dot = v.vx * n.vx + v.vy * n.vy;
	return {
		vx: (v.vx - 2 * dot * n.vx) * restitution,
		vy: (v.vy - 2 * dot * n.vy) * restitution
	};
}
/**
* Circular damage falloff (SPEC §4.2):
* MAX_DAMAGE * (1 - (dist/radius)^falloffExponent), clamped to
* [0, MAX_DAMAGE]. Exponent 1 preserves the default linear curve; larger
* exponents keep more damage inside the disc while still reaching zero at the
* exact edge.
*/
function damage(dist, radius, falloffExponent = 1) {
	if (radius <= 0 || dist >= radius - 1e-9) return 0;
	const exponent = Number.isFinite(falloffExponent) && falloffExponent > 0 ? falloffExponent : 1;
	return 100 * (1 - Math.max(0, dist / radius) ** exponent);
}
/**
* Convenience: damage dealt to a tank from an explosion at (cx, cy) with the
* given radius, measured from the tank's center-of-body (SPEC §4.2).
*/
function explosionDamage(cx, cy, radius, tank, falloffExponent = 1) {
	const tx = tank.x;
	const ty = tank.y - 6;
	return damage(Math.hypot(cx - tx, cy - ty), radius, falloffExponent);
}
/**
* Deterministic seeded PRNG stream for the engine (SPEC §4.4 wind generation).
*
* Determinism is a hard requirement: NO Math.random, NO wall-clock. This module
* exposes the same mulberry32 + hashSeed mixing used by terrain generation, but
* as an INDEPENDENT, stateful stream so the wind sequence can be advanced once
* per turn without consuming (and thereby perturbing) the terrain generator.
*
* Same seed + same number of advances => identical value sequence, always.
*/
/**
* Seeded PRNG (mulberry32). Returns a closure yielding floats in [0, 1). The
* internal state advances by one on every call — call it exactly once per unit
* of randomness you need so the stream stays reproducible.
*/
function mulberry32(seed) {
	let a = seed;
	return function() {
		a |= 0;
		a = a + 1831565813 | 0;
		let t = Math.imul(a ^ a >>> 15, 1 | a);
		t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
/**
* Fold an arbitrary caller seed (float, negative, NaN, Infinity, or > 2^32) into
* a well-mixed uint32 (MurmurHash3 fmix32 finalizer). Mirrors Terrain's hashSeed
* so the wind stream is seeded from the same game seed without aliasing.
*/
function hashSeed(seed) {
	const n = Number.isFinite(seed) ? seed : 2654435769;
	const frac = Math.floor((n - Math.floor(n)) * 4294967296) >>> 0;
	const lo = Math.floor(n) | 0;
	const hi = Math.floor(n / 4294967296) | 0;
	let h = (lo ^ frac ^ Math.imul(hi, 2246822507)) >>> 0;
	h ^= h >>> 16;
	h = Math.imul(h, 2246822507);
	h ^= h >>> 13;
	h = Math.imul(h, 3266489909);
	h ^= h >>> 16;
	return h >>> 0;
}
/**
* Create an independent, reproducible RNG stream from a game seed. The returned
* function yields the next float in [0, 1) and advances the stream by one.
*
* This is its OWN mulberry32 instance seeded from the game seed — it never
* consumes the terrain generator's stream (so advancing wind cannot perturb
* terrain or vice-versa). Same seed + same number of advances => identical
* sequence, always.
*/
function createRng(seed) {
	return mulberry32(hashSeed(seed));
}
var BLAST_REACH = 1.8;
var CLUSTER_REACH = 1.4;
function blastReach(style) {
	return style === "cluster" ? CLUSTER_REACH : BLAST_REACH;
}
function blastReachRadius(baseRadius, style) {
	return Math.max(0, baseRadius) * blastReach(style);
}
/** True only for the exact movement payload domain shared with the Edge referee. */
function isValidMoveDelta(delta) {
	return Number.isInteger(delta) && delta !== 0 && Math.abs(delta) <= 8;
}
/**
* Resolve one deterministic tank movement commitment.
*
* The action is traversed one integer column at a time, preventing tunneling
* through cliffs, battlefield bounds, or another living tank. Fuel is charged
* only after a candidate pixel is accepted. The function mutates only `tank`
* and returns the horizontal pixels actually traveled.
*/
function resolveTankMove(tank, tanks, terrain, delta) {
	if (!isValidMoveDelta(delta) || !tank.alive || tank.buried || tank.fuel <= 0) return 0;
	const direction = Math.sign(delta);
	const requested = Math.min(Math.abs(delta), Math.floor(tank.fuel));
	const minX = 10;
	const maxX = CANVAS_WIDTH - 10;
	let traveled = 0;
	for (let step = 0; step < requested; step += 1) {
		const candidateX = tank.x + direction;
		if (candidateX < minX || candidateX > maxX) break;
		const candidateY = surfaceAt(terrain, candidateX);
		if (Math.abs(candidateY - tank.y) > 4) break;
		if (tanks.some((other) => other !== tank && other.alive && !other.buried && Math.abs(other.x - candidateX) < 20)) break;
		tank.x = candidateX;
		tank.y = candidateY;
		tank.fuel -= 1;
		traveled += 1;
	}
	return traveled;
}
function playersAreFour(players) {
	return Array.isArray(players) && players.length === 4;
}
/**
* Burial safety valve (#15): the maximum number of turns a tank may stay trapped under
* dirt before it auto-digs-out, so a player can never be locked out of the match forever.
* A buried tank may be freed EARLIER by terrain cleared over it (a crater / Riot Bomb).
* Tunable; a named constant, not a magic number.
*/
var MAX_BURIED_TURNS = 2;
var FALL_DAMAGE_PER_PIXEL = 1.5;
var PARACHUTE_DAMAGE_FACTOR = .25;
/**
* Master game state machine (SPEC §4.3). Owns the authoritative `GameState` and
* drives the loop. Runs identically in the browser (hot-seat) and on the server
* (networked) — physics is fixed-timestep and deterministic: identical
* (seed, action-sequence, tick-count) always yields identical state.
*
* MVP1 scope: terrain + 2–4 tanks + aim + fire + ballistic flight + crater +
* explosion event + per-blast damage/death + terrain collapse + turn rotation
* over living tanks + per-turn seeded wind + win/draw detection. The turn state
* machine is LOBBY → PLAYER_TURN → FIRING → RESOLVING → NEXT_TURN → GAME_OVER;
* RESOLVING and NEXT_TURN are transient within a single resolving tick(), so the
* resting phase after a resolved shot is PLAYER_TURN (or GAME_OVER).
*/
/**
* Fixed default terrain seed used when `GameOptions.seed` is absent. A literal
* constant — NEVER derived from the clock or a global random source — so a
* seedless construction is still fully reproducible.
*/
var DEFAULT_SEED = 1592594996;
/**
* Derive a per-round terrain/wind seed from the match's base seed and the (1-based)
* round number. Round 1 uses the base seed directly (see the constructor); rounds
* 2..N use this. Pure arithmetic over uint32 (the >>> 0 keeps it a 32-bit unsigned
* value, matching what generate()/createRng() consume) — so every networked client
* replaying the same action log computes the identical seed for every round, with no
* new action and no server involvement. The multiplier is the golden-ratio constant
* (2^32/φ) used widely as a cheap hash mixer, so successive rounds decorrelate.
*/
function deriveRoundSeed(baseSeed, round) {
	return baseSeed + round * 2654435761 >>> 0;
}
/** Push-off distance (px) along the surface normal after a bounce so the next
*  tick does not re-collide with the same solid pixel. */
var BOUNCE_EPS = 1.5;
/** Aim-input clamps (SPEC §6: angle degrees 0=right..180=left; power 0–100). */
var ANGLE_MIN = 0;
var ANGLE_MAX = 180;
var POWER_MIN = 0;
/**
* Sudden-death gravity ramp (SE-parity stalemate-breaker). Once `state.turn` passes the
* room's `suddenDeathTurn`, effective gravity is multiplied by (1 + turnsPast * this), so
* each subsequent turn shrinks max range and forces resolution. A NAMED, playtest-tunable
* constant (12%/turn) — exported so the harness pins the exact value with no magic-number
* drift. Pure arithmetic; sudden death is a function of the turn count only, never a clock.
*/
var SUDDEN_DEATH_GRAVITY_RAMP = .12;
/**
* Effective gravity under sudden death — the SINGLE source of truth, shared by the engine's
* per-tick integration AND the AI shot planner (so bots aim with the gravity the engine will
* actually fly the shot under). Pure: equals `baseGravity` until `turn` passes
* `suddenDeathTurn`, then ramps `baseGravity * (1 + (turn - suddenDeathTurn) * RAMP)`.
* suddenDeathTurn <= 0 disables it (returns base). No clock, no random.
*/
function effectiveGravity(baseGravity, turn, suddenDeathTurn) {
	if (suddenDeathTurn <= 0) return baseGravity;
	const past = turn - suddenDeathTurn;
	if (past <= 0) return baseGravity;
	return baseGravity * (1 + past * SUDDEN_DEATH_GRAVITY_RAMP);
}
/**
* Take ownership of the small construction config retained across rounds. The
* engine copies and freezes the roster plus nested presentation loadouts once;
* live GameState and its terrain buffer follow their separate borrowed-state
* contract and are never copied here per frame.
*/
function ownConstructionOptions(options) {
	if (!options) return void 0;
	const players = options.players?.map((player) => Object.freeze({
		...player,
		...player.loadout ? { loadout: Object.freeze({ ...player.loadout }) } : {}
	}));
	if (players) Object.freeze(players);
	return Object.freeze({
		...options,
		...players ? { players } : {}
	});
}
var GameEngine = class GameEngine {
	state;
	workBudget;
	/** Instrumentation is deliberately outside simulation options/state. All
	* speculative clones consume this same admitted computation's budget. */
	get verificationWorkBudget() {
		return this.workBudget;
	}
	/** Live terrain pixel bitmap (authoritative; returned by ref from getState()). */
	terrain;
	/** Monotonic explosion id source — drives ExplosionEvent.id dedupe. */
	explosionSeq = 0;
	/** Monotonic sidewall-contact id source for renderer/audio dedupe. */
	wallImpactSeq = 0;
	/**
	* Active napalm fire field — working store of burning column x → ticks of burn
	* remaining. A Map (not the GameState array) for O(1) ignite/decay during
	* spread; mirrored to `state.fire` (sorted by x, deterministic) after each
	* mutation. Empty whenever nothing is alight. Only one napalm shot burns at a
	* time (a shot fully resolves before the next turn), so a single field suffices.
	*/
	fire = /* @__PURE__ */ new Map();
	/** The burning napalm's def + impact column, retained while `fire` is non-empty
	*  so processFire() knows the spread bounds/rate. Null when nothing is alight. */
	fireDef = null;
	fireCenter = 0;
	/**
	* Columns this fire has EVER lit. A column burns exactly once: spread never
	* re-ignites a scorched column. Without this, a frontier cell that decays lets
	* the spread retreat then re-extend into the just-burned column, relighting it
	* forever — an oscillating, non-terminating fire. Cleared when the field dies.
	*/
	fireScorched = /* @__PURE__ */ new Set();
	/**
	* Store economy bookkeeping for the in-flight shot: who fired it, and the total
	* EFFECTIVE damage it has dealt to OTHER tanks so far. Set/reset when a shot is
	* fired; read in resolve() to award the shooter credits. Self-damage does not
	* pay. Pure integers — deterministic.
	*/
	shooterId = "";
	shotDamage = 0;
	/**
	* Independent seeded wind RNG stream (SPEC §4.4). Advanced exactly once per
	* turn (once at construction for the opening turn, once per NEXT_TURN). Kept
	* separate from terrain generation so the two streams never correlate. Same
	* game seed + same action sequence => identical wind sequence every turn.
	*/
	windRng;
	/**
	* The seed passed to `createRng()` when the current `windRng` stream was
	* initialised — equal to `this.seed` for the opening round and to
	* `deriveRoundSeed(this.seed, round)` for every subsequent round (set by
	* `startNextRound()`). Retained so `clone()` can reconstruct an identical RNG
	* stream at exactly the same position without having to snapshot the closure's
	* internal state.
	*/
	windRngSeed;
	/**
	* How many times `this.windRng()` has been called since the last
	* `createRng()` invocation (construction or `startNextRound()`). Incremented
	* by `nextWind()`. Used by `clone()` to fast-forward a fresh copy of the RNG
	* to the same stream position as the original.
	*/
	windRngCalls = 0;
	/** Per-room wind cap (defaults to MAX_WIND); tunable via GameOptions. */
	maxWind;
	/** Per-room gravity (defaults to GRAVITY); tunable via GameOptions. */
	gravity;
	/**
	* Base terrain/wind seed for the whole match. The opening round uses it directly;
	* each later round derives its own seed from it + the round index (deriveRoundSeed)
	* so rounds differ yet every networked client regenerates the identical terrain.
	*/
	seed;
	/** Best-of-N match length (>= 1). 1 => single-round / back-compat behavior. */
	totalRounds;
	/**
	* Per-round credit interest rate (SE-parity economy). At each ROUND_OVER boundary every
	* tank earns `floor(credits * interestRate)` on its carried balance. 0 => no interest
	* (back-compat). A non-finite/negative option falls back to 0. Pure integer arithmetic.
	*/
	interestRate;
	/**
	* Sudden-death threshold turn (SE-parity stalemate-breaker). 0 => off (back-compat).
	* Once the PER-ROUND turn (`state.turn - turnAtRoundStart`) exceeds this, `currentGravity()`
	* ramps gravity up per turn. A non-finite/negative option falls back to 0 (off). Pure
	* function of the per-round turn count.
	*/
	suddenDeathTurn;
	/**
	* The match-global `state.turn` value at which the CURRENT round began (0 for the opening
	* round; reset in startNextRound). Subtracted from `state.turn` to get the PER-ROUND turn
	* that drives sudden death, so escalation resets each round and a long earlier round never
	* carries it forward. Deterministic integer; copied by clone().
	*/
	turnAtRoundStart;
	/**
	* Arms-level store cap (SE-parity economy, 0–4). `applyBuy` rejects any weapon whose
	* `armsLevel` exceeds this. Defaults to 4 (everything buyable / back-compat); an
	* out-of-range option is clamped into [0, 4]. Gates purchases only — never the opening
	* loadout or physics. Static config; copied by clone() for next-seat derivation parity.
	*/
	armsLevel;
	/**
	* Starter-weapon interior damage rule. Linear is the compatibility default;
	* hot-seat opts into the decisive curve while network rooms remain linear
	* until their referee contract can enforce a shared ruleset version.
	*/
	starterWeaponFalloff;
	/** Original construction options, retained so startNextRound can re-place tanks
	*  the same way the opening round did (same player roster / layout path). */
	options;
	/** True only for an explicitly opted-in four-seat 2v2 ruleset. */
	teamMode = false;
	/**
	* Pending unsettled column range from the most recent detonation(s), merged
	* across multiple detonations in the same tick (cluster/MIRV/betty chain).
	* Non-null only between the moment FIRING ends (settled, non-game-over) and
	* when the animated RESOLVING settle completes. Null when no settle is pending.
	*
	* During FIRING (projectiles still in flight), detonations settle instantly
	* (flushSettleInstant) and this field is consumed within the same tick.
	* At end-of-turn with no projectiles and no fire, this field is LEFT for the
	* RESOLVING phase to animate one settleStep per tick until converged.
	*
	* Determinism: pure integer xStart/xEnd — no clock, no random.
	*/
	pendingSettle = null;
	/** Accumulated downward movement during the current terrain settle. */
	fallDistances = /* @__PURE__ */ new Map();
	/**
	* Lazily-built per-column surface cache (P2 perf): surfaceAt() is an O(H) top-down
	* scan, and processFire/canSpread/resolveTanksToTerrain call it per burning column
	* EVERY tick — re-scanning a stable bitmap. This memoizes the topmost-solid y per
	* column, keyed on `state.terrainVersion`. Every terrain mutation (deform, each
	* settle step, round-restart rebuild) already bumps terrainVersion, so a version
	* mismatch invalidates the whole cache; entries are computed lazily on first query
	* via the SAME surfaceAt() scan, so cached values are byte-identical to a fresh
	* scan. `-1` marks an uncomputed column (a real surface y is always in [0, H]).
	* Determinism: pure derived data — no clock, no random; a clone rebuilds it lazily.
	*/
	surfaceCache;
	surfaceCacheVersion = -1;
	/**
	* Cached surfaceAt: returns the topmost-solid y for column floor(x), identical to
	* surfaceAt(this.terrain, x). Rebuilds (invalidates) the cache when terrainVersion
	* has changed since the last fill, then memoizes each queried column. The clamp on
	* x mirrors surfaceAt exactly so the cache is keyed on the same column index.
	*/
	surfaceAtCached(x) {
		if (this.surfaceCacheVersion !== this.state.terrainVersion) {
			this.workBudget?.charge("terrainCells", CANVAS_WIDTH);
			this.surfaceCache.fill(-1);
			this.surfaceCacheVersion = this.state.terrainVersion;
		}
		const xi = clamp(Math.floor(x), 0, CANVAS_WIDTH - 1);
		const cached = this.surfaceCache[xi] ?? -1;
		if (cached !== -1) return cached;
		const surf = surfaceAt(this.terrain, xi, this.workBudget);
		this.surfaceCache[xi] = surf;
		return surf;
	}
	constructor(options, workBudget) {
		this.workBudget = workBudget;
		this.workBudget?.charge("engineSteps");
		this.workBudget?.charge("allocatedBytes", CANVAS_WIDTH * Int16Array.BYTES_PER_ELEMENT);
		this.workBudget?.charge("terrainCells", CANVAS_WIDTH);
		this.surfaceCache = new Int16Array(CANVAS_WIDTH).fill(-1);
		this.workBudget?.charge("engineSteps", options?.players?.length ?? 0);
		options = ownConstructionOptions(options);
		const seed = options?.seed ?? DEFAULT_SEED;
		const heightLine = generate(seed, this.workBudget);
		this.terrain = buildBitmap(heightLine, this.workBudget);
		applyTerrainHazards(this.terrain, seed, normalizeTerrainHazardMode(options?.hazards), this.workBudget);
		this.windRng = createRng(seed);
		this.windRngSeed = seed;
		this.maxWind = options?.maxWind ?? 10;
		this.gravity = options?.gravity ?? .15;
		this.seed = seed;
		this.totalRounds = Math.max(1, Math.floor(options?.rounds ?? 1) || 1);
		const rate = options?.interestRate ?? 0;
		this.interestRate = Number.isFinite(rate) && rate > 0 ? rate : 0;
		const sd = options?.suddenDeathTurn ?? 0;
		this.suddenDeathTurn = Number.isFinite(sd) && sd > 0 ? Math.floor(sd) : 0;
		const al = options?.armsLevel;
		this.armsLevel = Number.isFinite(al) ? clamp(Math.floor(al), 0, 4) : 4;
		this.starterWeaponFalloff = options?.starterWeaponFalloff === "decisive" ? "decisive" : "linear";
		const walls = normalizeWallMode(options?.walls);
		this.turnAtRoundStart = 0;
		this.options = options;
		this.workBudget?.charge("allocatedBytes", CANVAS_WIDTH * Float64Array.BYTES_PER_ELEMENT);
		const terrainArr = Array.from({ length: CANVAS_WIDTH }, (_, x) => surfaceAt(this.terrain, x, this.workBudget));
		const players = options?.players;
		this.teamMode = options?.teamMode === true && playersAreFour(players);
		const tanks = players && players.length >= 2 && players.length <= 4 ? placeTanks(terrainArr, players, options) : placeTwoTanks(terrainArr, options);
		this.state = {
			phase: "PLAYER_TURN",
			turn: 0,
			round: 1,
			totalRounds: this.totalRounds,
			lastRoundWinnerId: null,
			lastRoundWinnerTeam: null,
			activePlayerId: tanks[0]?.id ?? "",
			wind: this.nextWind(0),
			walls,
			terrain: this.terrain,
			terrainVersion: 0,
			tanks,
			projectiles: [],
			projectile: null,
			lastExplosion: null,
			explosions: [],
			wallImpacts: [],
			fire: [],
			winner: null,
			winnerTeam: null
		};
	}
	/**
	* Gentle-drift wind (SPEC §4.4): walk the current wind by a deterministic
	* delta in [-WIND_DRIFT_STEP, +WIND_DRIFT_STEP], then clamp into
	* [-maxWind, +maxWind]. Advances the seeded stream by EXACTLY ONE per call
	* (once at construction for the opening wind — drifting from a 0 baseline —
	* and once per NEXT_TURN), so wind stays a pure function of (seed, action
	* sequence). Net effect: |wind| <= maxWind always, and successive winds differ
	* by at most WIND_DRIFT_STEP, so players can range/walk shots in across turns.
	*/
	nextWind(current) {
		this.windRngCalls++;
		return clamp(current + (this.windRng() * 2 - 1) * WIND_DRIFT_STEP, -this.maxWind, this.maxWind);
	}
	/**
	* Effective gravity for the CURRENT turn (SE-parity sudden death). Equal to the base
	* `this.gravity` until `state.turn` passes `suddenDeathTurn`, after which it ramps:
	*   base * (1 + (turn - suddenDeathTurn) * SUDDEN_DEATH_GRAVITY_RAMP).
	* A PURE FUNCTION of (base gravity, state.turn, suddenDeathTurn) — no clock, no random —
	* so every networked client computes the identical value for a given turn. The turn does
	* not change mid-flight (it advances only at resolve()), so a shot uses one fixed gravity
	* for its whole arc. suddenDeathTurn 0 returns base unchanged (back-compat).
	*/
	currentGravity() {
		return effectiveGravity(this.gravity, this.state.turn - this.turnAtRoundStart, this.suddenDeathTurn);
	}
	/**
	* Public read of the engine's effective gravity for the CURRENT turn (SE-parity sudden
	* death). The AI shot planner reads this so a bot aims with the gravity the engine will
	* ACTUALLY fly the shot under — otherwise it plans a flatter arc and lands short once
	* sudden death escalates. Pure read; never mutates. Deterministic (a function of turn).
	*/
	getEffectiveGravity() {
		return this.currentGravity();
	}
	/** Current snapshot of game state for rendering / broadcast. */
	getState() {
		return this.state;
	}
	/**
	* Return a fully-independent deep copy of this engine. Ticking or applying
	* actions on the clone NEVER mutates the original (and vice versa).
	*
	* Every piece of mutable state is deep-copied:
	*   - terrain bitmap (`Uint8Array.slice()`)
	*   - tanks array (each `TankState` including its `inventory` record)
	*   - projectiles array (each `ProjectileState`)
	*   - fire field (`Map` + `Set` + `fireDef` reference — NapalmDef is a
	*     read-only weapon definition constant, not mutated by the engine)
	*   - `GameState.fire` snapshot array (plain objects)
	*   - explosion arrays and `lastExplosion` (plain objects)
	*   - all scalar state fields
	*   - wind RNG stream (re-created from `windRngSeed` and fast-forwarded
	*     `windRngCalls` times so the clone is at the identical stream position)
	*
	* Determinism guarantee: the clone produces the same future sequence of
	* wind values, phase transitions, and seat rotations as a full-log replay
	* would, because every field that influences those transitions is copied.
	*/
	clone() {
		this.workBudget?.charge("engineSteps");
		const c = Object.create(GameEngine.prototype);
		c.workBudget = this.workBudget;
		c.explosionSeq = this.explosionSeq;
		c.wallImpactSeq = this.wallImpactSeq;
		c.fireCenter = this.fireCenter;
		c.shooterId = this.shooterId;
		c.shotDamage = this.shotDamage;
		c.maxWind = this.maxWind;
		c.gravity = this.gravity;
		c.seed = this.seed;
		c.totalRounds = this.totalRounds;
		c.interestRate = this.interestRate;
		c.suddenDeathTurn = this.suddenDeathTurn;
		c.turnAtRoundStart = this.turnAtRoundStart;
		c.armsLevel = this.armsLevel;
		c.starterWeaponFalloff = this.starterWeaponFalloff;
		c.options = this.options;
		c.teamMode = this.teamMode;
		c.pendingSettle = this.pendingSettle !== null ? { ...this.pendingSettle } : null;
		this.workBudget?.charge("engineSteps", this.fallDistances.size);
		c.fallDistances = new Map(this.fallDistances);
		this.workBudget?.charge("allocatedBytes", CANVAS_WIDTH * Int16Array.BYTES_PER_ELEMENT);
		this.workBudget?.charge("terrainCells", CANVAS_WIDTH);
		c.surfaceCache = new Int16Array(CANVAS_WIDTH).fill(-1);
		c.surfaceCacheVersion = -1;
		c.windRngSeed = this.windRngSeed;
		c.windRngCalls = this.windRngCalls;
		const freshRng = createRng(this.windRngSeed);
		for (let i = 0; i < this.windRngCalls; i++) {
			this.workBudget?.charge("engineSteps");
			freshRng();
		}
		c.windRng = freshRng;
		this.workBudget?.charge("allocatedBytes", this.terrain.byteLength);
		this.workBudget?.charge("copiedBytes", this.terrain.byteLength);
		c.terrain = this.terrain.slice();
		this.workBudget?.charge("engineSteps", this.fire.size + this.fireScorched.size);
		c.fire = new Map(this.fire);
		c.fireScorched = new Set(this.fireScorched);
		c.fireDef = this.fireDef;
		const s = this.state;
		const cloneTanks = s.tanks.map((t) => {
			this.workBudget?.charge("engineSteps");
			const inv = {};
			for (const [k, v] of Object.entries(t.inventory)) {
				this.workBudget?.charge("engineSteps");
				inv[k] = {
					count: v.count,
					unlimited: v.unlimited
				};
			}
			return {
				...t,
				inventory: inv,
				accessories: { ...t.accessories },
				loadout: { ...t.loadout }
			};
		});
		this.workBudget?.charge("engineSteps", s.projectiles.length + s.explosions.length + s.fire.length + s.wallImpacts.length);
		const cloneProjectiles = s.projectiles.map((p) => ({ ...p }));
		const cloneProjectile = cloneProjectiles[0] ?? null;
		const cloneExplosions = s.explosions.map((e) => ({ ...e }));
		const cloneLastExp = s.lastExplosion ? { ...s.lastExplosion } : null;
		const cloneFire = s.fire.map((f) => ({ ...f }));
		c.state = {
			phase: s.phase,
			turn: s.turn,
			round: s.round,
			totalRounds: s.totalRounds,
			lastRoundWinnerId: s.lastRoundWinnerId,
			lastRoundWinnerTeam: s.lastRoundWinnerTeam,
			activePlayerId: s.activePlayerId,
			wind: s.wind,
			walls: s.walls,
			terrain: c.terrain,
			terrainVersion: s.terrainVersion,
			tanks: cloneTanks,
			projectiles: cloneProjectiles,
			projectile: cloneProjectile,
			lastExplosion: cloneLastExp,
			explosions: cloneExplosions,
			wallImpacts: s.wallImpacts.map((event) => ({ ...event })),
			fire: cloneFire,
			winner: s.winner,
			winnerTeam: s.winnerTeam
		};
		return c;
	}
	/**
	* Keep the back-compat single-projectile alias in lockstep with the array.
	* Call after EVERY mutation of `state.projectiles`. `projectile` is purely a
	* derived view (`projectiles[0] ?? null`) — never mutate it independently.
	*/
	syncProjectileAlias() {
		this.state.projectile = this.state.projectiles[0] ?? null;
	}
	/** The currently active (aiming) tank, or undefined if none. */
	activeTank() {
		return this.state.tanks.find((t) => t.id === this.state.activePlayerId);
	}
	/**
	* Apply a player input. Aim changes (set_angle/set_power) and fuel-limited
	* movement are honored only while aiming (PLAYER_TURN). `fire` is honored only
	* while aiming and with no projectile in flight; it launches the shot and
	* transitions to FIRING.
	* select_weapon sets the active weapon (no ammo gate here — gating happens on
	* `fire`, which rejects a shot when the selected weapon is out of ammo).
	*/
	applyAction(action) {
		this.workBudget?.charge("engineSteps");
		if (this.state.phase === "ROUND_OVER") {
			if (action.type === "buy") {
				const target = action.tankId ? this.state.tanks.find((t) => t.id === action.tankId) : this.activeTank();
				return target ? this.applyBuy(action, target) : false;
			} else if (action.type === "next_round") {
				this.state.phase = "PLAYER_TURN";
				return true;
			}
			return false;
		}
		if (this.state.phase !== "PLAYER_TURN") return false;
		const tank = this.activeTank();
		if (!tank) return false;
		switch (action.type) {
			case "set_angle":
				tank.angle = clamp(action.angle, ANGLE_MIN, ANGLE_MAX);
				return true;
			case "set_power":
				tank.power = clamp(action.power, POWER_MIN, tank.powerCap);
				return true;
			case "move": return resolveTankMove(tank, this.state.tanks, this.terrain, action.delta) !== 0;
			case "select_weapon":
				tank.selectedWeapon = action.weapon;
				return true;
			case "fire": {
				if (this.state.projectiles.length > 0) return false;
				const ammo = tank.inventory[tank.selectedWeapon];
				if (!ammo.unlimited && ammo.count <= 0) return false;
				this.shooterId = tank.id;
				this.shotDamage = 0;
				const v = launchVelocity(tank.angle, tank.power);
				const tip = barrelTip(tank, 22);
				this.state.explosions = [];
				this.state.wallImpacts = [];
				this.state.projectiles = [{
					x: tip.x,
					y: tip.y,
					vx: v.vx,
					vy: v.vy,
					weaponType: tank.selectedWeapon,
					age: 0,
					hasSplit: false,
					bounces: getWeapon(tank.selectedWeapon).behavior?.bounce?.maxBounces ?? 0
				}];
				if (!ammo.unlimited) ammo.count--;
				this.syncProjectileAlias();
				this.state.phase = "FIRING";
				return true;
			}
			case "buy": return this.applyBuy(action, tank);
			case "next_round": return false;
			case "use_shield": {
				const selectedShield = tank.selectedWeapon === "heavy_shield" ? "heavy_shield" : "shield";
				const shieldWeapon = action.weapon ?? selectedShield;
				const ammo = tank.inventory[shieldWeapon];
				if (!ammo.unlimited && ammo.count <= 0) return false;
				tank.shieldHp = getWeapon(shieldWeapon).behavior?.shield?.capacity ?? 0;
				if (!ammo.unlimited) ammo.count--;
				if (this.endRoundIfDecided()) return true;
				this.advanceTurn();
				this.state.wind = this.nextWind(this.state.wind);
				this.state.turn += 1;
				this.state.phase = "PLAYER_TURN";
				return true;
			}
			default: return false;
		}
	}
	/**
	* Purchase one bundle of a weapon for `target` (shared by the PLAYER_TURN store
	* and the ROUND_OVER between-rounds shop). Rejected for unimplemented or
	* unlimited-stock weapons, or when the tank can't afford it. Turn-neutral — never
	* changes phase or active player. The CPU-seat idempotency guard (P1-7b) collapses
	* staggered duplicate bot buys in networked lockstep to exactly-once.
	*/
	applyBuy(action, target) {
		if (action.weapon && action.accessory) return false;
		if (action.accessory === "battery") {
			if (2 > this.armsLevel) return false;
			if (target.credits < 5e3) return false;
			target.credits -= BATTERY_PRICE;
			target.powerCap += 100;
			return true;
		}
		if (action.accessory === "fuel_tank") {
			if (3 > this.armsLevel) return false;
			if (target.credits < 1e4) return false;
			target.credits -= FUEL_TANK_PRICE;
			target.fuel += 100;
			return true;
		}
		if (action.accessory === "parachute") {
			if (1 > this.armsLevel) return false;
			if (target.credits < 4e3) return false;
			target.credits -= PARACHUTE_PRICE;
			target.accessories.parachute += 1;
			return true;
		}
		if (!action.weapon) return false;
		const def = getWeapon(action.weapon);
		if (!def.implemented) return false;
		if (def.armsLevel > this.armsLevel) return false;
		const slot = target.inventory[action.weapon];
		if (slot.unlimited) return false;
		if (target.ai && slot.count > 0) return false;
		if (target.credits < def.price) return false;
		target.credits -= def.price;
		slot.count += def.bundleSize;
		return true;
	}
	/**
	* Advance one fixed timestep. While FIRING, integrate the projectile one step
	* (with the active wind) then sweep-test for collision. On any resolution
	* (ground/tank hit OR out-of-bounds miss) the shot resolves: crater + damage +
	* collapse + win check, then the turn advances (new wind) to PLAYER_TURN, or
	* the game ends at GAME_OVER.
	*
	* While RESOLVING with a pending settle (AC-02), advances the animated terrain
	* collapse by ONE settleStep (COLLAPSE_PX_PER_TICK pixels per column) and
	* re-derives tank positions. When fully settled, calls resolve() to advance the
	* turn machine. Outside FIRING/RESOLVING this is a no-op.
	*/
	tick() {
		this.workBudget?.charge("engineTicks");
		if (this.state.phase === "RESOLVING") {
			this.tickResolving();
			return;
		}
		if (this.state.phase !== "FIRING") return;
		if (this.state.projectiles.length === 0 && this.fire.size === 0) {
			this.state.phase = "PLAYER_TURN";
			this.syncProjectileAlias();
			return;
		}
		const survivors = this.advanceProjectiles();
		this.state.projectiles = survivors;
		this.syncProjectileAlias();
		this.processFire();
		this.settleAndResolveTurn(survivors);
	}
	/**
	* Extracted verbatim from tick() (#86) — behavior-preserving.
	*
	* RESOLVING branch (AC-02): animate the terrain collapse one step per tick.
	* Only entered when pendingSettle is non-null (set by detonate() during the
	* just-completed FIRING phase). Each call advances the settle by
	* COLLAPSE_PX_PER_TICK px/column; when converged, calls resolve() to finish
	* the turn. If pendingSettle is null (e.g. napalm-only or no deform), this
	* branch is never reached (phase transitions to PLAYER_TURN directly).
	*/
	tickResolving() {
		if (this.pendingSettle !== null) {
			if (!this.settleStepAnimated()) this.resolve();
		} else this.resolve();
	}
	/**
	* Extracted verbatim from tick() (#86) — behavior-preserving.
	*
	* Process EACH in-flight projectile this tick, returning the rebuilt
	* in-flight `survivors` list. A projectile may: keep flying, AIRBURST at apex
	* (replaced by N submunitions), detonate on a ground/tank hit (removed, blast
	* applied), or sail OOB (removed, no blast). Any apex split injects its
	* submunitions into the SAME list so they begin flying next tick.
	*/
	advanceProjectiles() {
		const survivors = [];
		const current = this.state.projectiles;
		for (const p of current) {
			this.workBudget?.charge("engineSteps");
			const sandhog = getWeapon(p.weaponType).behavior?.sandhog;
			if (sandhog !== void 0 && p.burrowTicksRemaining !== void 0) {
				const nextX = p.x + p.vx;
				const nextY = p.y + p.vy;
				p.age++;
				if (nextX < 0 || nextX >= 1200 || nextY < 0 || nextY >= 400) {
					this.detonate(p.x, p.y, p.weaponType, "ground");
					continue;
				}
				p.x = nextX;
				p.y = nextY;
				this.carveSandhogTunnel(p.x, p.y, sandhog.tunnelRadius);
				p.burrowTicksRemaining--;
				if (p.burrowTicksRemaining <= 0) this.detonate(p.x, p.y, p.weaponType, "ground");
				else survivors.push(p);
				continue;
			}
			const vyBefore = p.vy;
			const prevX = p.x;
			const prevY = p.y;
			let collisionStartX = prevX;
			let collisionStartY = prevY;
			stepProjectile(p, this.state.wind, this.currentGravity());
			p.age++;
			if (p.age >= 240) {
				const napalm = getWeapon(p.weaponType).behavior?.napalm;
				if (napalm !== void 0) this.igniteNapalm(p.x, p.y, napalm, p.weaponType);
				else this.detonate(p.x, p.y, p.weaponType);
				continue;
			}
			const airburst = getWeapon(p.weaponType).behavior?.airburst;
			if (airburst !== void 0 && p.hasSplit === false) {
				if (airburst.trigger === "apex" ? vyBefore < 0 && p.vy >= 0 : p.age >= (airburst.ageFrames ?? 0)) {
					for (const sub of this.splitAirburst(p, airburst)) {
						this.workBudget?.charge("engineSteps");
						survivors.push(sub);
					}
					continue;
				}
			}
			let hit = sweepCollide(p, prevX, prevY, this.terrain, this.state.tanks, this.state.walls, this.workBudget);
			if (hit.type === "none") {
				survivors.push(p);
				continue;
			}
			let concreteWallContact = false;
			if (hit.type === "wall") {
				concreteWallContact = this.state.walls === "concrete";
				this.state.wallImpacts.push({
					id: ++this.wallImpactSeq,
					side: hit.side,
					x: hit.x,
					y: hit.y
				});
				if (this.state.walls === "reflective") {
					reflectSideWall(p, hit);
					survivors.push(p);
					continue;
				}
				if (concreteWallContact) {
					p.x = hit.x;
					p.y = hit.y;
					hit = {
						type: "ground",
						x: hit.x,
						y: hit.y,
						material: "ground"
					};
				} else {
					collisionStartX = hit.side === "left" ? CANVAS_WIDTH - WALL_INSET : WALL_INSET;
					collisionStartY = hit.y;
					hit = wrapSideWall(p, hit, this.terrain, this.state.tanks, this.workBudget);
					if (hit.type === "none") {
						survivors.push(p);
						continue;
					}
				}
			}
			if (hit.type === "tank") {
				const napalm = getWeapon(p.weaponType).behavior?.napalm;
				if (napalm !== void 0) this.igniteNapalm(hit.x, hit.y, napalm, p.weaponType, "tank");
				else this.detonate(hit.x, hit.y, p.weaponType, "tank");
			} else if (hit.type === "ground") {
				if (concreteWallContact) {
					const napalm = getWeapon(p.weaponType).behavior?.napalm;
					if (napalm !== void 0) this.igniteNapalm(hit.x, hit.y, napalm, p.weaponType, "ground");
					else this.detonate(hit.x, hit.y, p.weaponType, "ground");
				} else if (sandhog !== void 0) {
					if (hit.y >= 400) {
						const endpointY = 399.99;
						const deltaY = hit.y - collisionStartY;
						const fraction = deltaY > 0 ? clamp((endpointY - collisionStartY) / deltaY, 0, 1) : 0;
						const endpointX = clamp(collisionStartX + (hit.x - collisionStartX) * fraction, 0, CANVAS_WIDTH - .01);
						this.detonate(endpointX, endpointY, p.weaponType, "ground", hit.material);
						continue;
					}
					p.x = hit.x;
					p.y = hit.y;
					p.vx = p.vx < 0 ? -sandhog.horizontalSpeed : sandhog.horizontalSpeed;
					p.vy = sandhog.verticalSpeed;
					p.burrowTicksRemaining = sandhog.ticks;
					survivors.push(p);
				} else if (p.bounces > 0) {
					const bounce = getWeapon(p.weaponType).behavior?.bounce;
					const n = surfaceNormalAt(this.terrain, p.x, this.workBudget);
					const r = reflectVelocity({
						vx: p.vx,
						vy: p.vy
					}, n, bounce?.restitution);
					p.vx = r.vx;
					p.vy = r.vy;
					if (bounce?.hopBoost) p.vy -= bounce.hopBoost;
					p.bounces--;
					p.x += n.vx * BOUNCE_EPS;
					p.y += n.vy * BOUNCE_EPS;
					if (bounce?.detonateEachBounce) this.detonate(hit.x, hit.y, p.weaponType, "ground", hit.material);
					survivors.push(p);
				} else {
					const napalm = getWeapon(p.weaponType).behavior?.napalm;
					if (napalm !== void 0) this.igniteNapalm(hit.x, hit.y, napalm, p.weaponType, "ground");
					else this.detonate(hit.x, hit.y, p.weaponType, "ground", hit.material);
				}
			}
		}
		return survivors;
	}
	/**
	* Extracted verbatim from tick() (#86) — behavior-preserving.
	*
	* POST-FIRE settle + turn-resolution decision (AC-02 deferred-final-settle)
	*
	* The rule:
	*  (A) Projectiles still in flight OR fire still burning → flush instantly so
	*      mid-flight bomblet trajectories/collisions stay byte-identical to today
	*      ACROSS ticks. KNOWN DEVIATION: when two projectiles detonate in the SAME
	*      tick, blast #1 is no longer compacted before blast #2's collide within that
	*      tick (the single flush runs after the whole projectile loop), so a same-tick
	*      #2 may collide an un-compacted overhang. This is deterministic (every client
	*      runs identical deferred logic → no lockstep desync; replay == live); it only
	*      shifts gameplay outcomes for rare same-tick multi-detonation seeds vs pre-
	*      animated-collapse. Accepted as a gameplay-parity trade-off of the deferred
	*      settle (compacting per-blast in-loop would instant-compact the FINAL blast
	*      too and defeat the animation). See sprint-log stabilize-and-juice-2.
	*  (B) Board already down to <= 1 alive → flush instantly and end immediately
	*      (preserves #14: win banner must not wait for dirt).
	*  (C) Settled + alive > 1 + no fire → leave pendingSettle for the RESOLVING
	*      phase to animate one settleStep per tick.
	*  (D) While fire is burning (no projectiles, fire active) → flush instantly
	*      each tick (fire is the visual focus; collapse settles under it).
	*/
	settleAndResolveTurn(survivors) {
		const aliveCount = this.state.tanks.reduce((n, t) => t.alive ? n + 1 : n, 0);
		const settled = survivors.length === 0 && this.fire.size === 0;
		const drilling = survivors.some((projectile) => projectile.burrowTicksRemaining !== void 0);
		if (survivors.length > 0) {
			if (!drilling) this.flushSettleInstant();
		} else if (!settled) this.flushSettleInstant();
		if (aliveCount <= 1) {
			this.state.projectiles = [];
			this.syncProjectileAlias();
			this.fire.clear();
			this.fireDef = null;
			this.fireScorched.clear();
			this.syncFire();
			this.flushSettleInstant();
			this.state.phase = "RESOLVING";
			this.resolve();
		} else if (settled) {
			this.state.phase = "RESOLVING";
			if (this.pendingSettle === null) this.resolve();
		}
	}
	/**
	* Split an airburst shell at apex into a DETERMINISTIC horizontal velocity
	* fan of `count` submunitions, all spawned at the parent's current (x, y).
	*
	* Submunition i (i in [0, count)) inherits the parent's velocity plus a
	* symmetric horizontal offset:
	*   vx_i = parentVx + (i - (count-1)/2) * step,  step = (2*spread)/(count-1)
	* so the bomblets fan out evenly from -spread..+spread px/tick around the
	* parent's vx (a single bomblet just inherits parentVx). vy is inherited
	* unchanged (≈0 at apex). Every submunition carries hasSplit:true so it never
	* re-splits, and age resets to 0. No randomness — purely a function of the
	* parent state + weapon def, preserving determinism.
	*/
	splitAirburst(parent, airburst) {
		const { count, spread } = airburst;
		const subs = [];
		const step = count > 1 ? 2 * spread / (count - 1) : 0;
		for (let i = 0; i < count; i++) {
			this.workBudget?.charge("engineSteps");
			const offset = (i - (count - 1) / 2) * step;
			subs.push({
				x: parent.x,
				y: parent.y,
				vx: parent.vx + offset,
				vy: parent.vy,
				weaponType: parent.weaponType,
				age: 0,
				hasSplit: true,
				bounces: 0
			});
		}
		return subs;
	}
	/**
	* Resolve a fired shot after the blast: count survivors, end the game on a win
	* (1 alive => that tank wins) or draw (0 alive => GAME_OVER, winner null), or
	* else advance to the next living player's turn and regenerate wind.
	*
	* Damage + terrain collapse already happened inside explode(); this is the
	* turn-machine portion (RESOLVING → GAME_OVER | NEXT_TURN → PLAYER_TURN).
	*/
	resolve() {
		const shooter = this.state.tanks.find((t) => t.id === this.shooterId);
		if (shooter) shooter.credits += Math.round(this.shotDamage * 80) + 500;
		if (this.endRoundIfDecided()) return;
		this.advanceTurn();
		this.state.wind = this.nextWind(this.state.wind);
		this.state.turn += 1;
		this.state.phase = "PLAYER_TURN";
	}
	/**
	* Round/match terminator (V1 match structure). If <= 1 tank is alive, record the
	* round result and either end the MATCH (phase=GAME_OVER, winner set) or stage the
	* next round (phase=ROUND_OVER, between-rounds shop) — returning true. If >= 2 are
	* alive the round continues and this returns false (no state change). Carries NO
	* credit/turn side-effects, so it is safe to call from ANY elimination point — the
	* post-shot resolve() and the use_shield turn-advance (#14). With totalRounds === 1
	* this is byte-identical to the old single-round behavior (clinch is 1, so any round
	* win ends the match, and a draw with round >= totalRounds also ends it).
	*/
	endRoundIfDecided() {
		const alive = this.state.tanks.filter((t) => t.alive);
		const aliveTeams = this.teamMode ? [...new Set(alive.map((tank) => tank.team).filter((team) => team === 1 || team === 2))] : [];
		if (this.teamMode ? aliveTeams.length > 1 : alive.length > 1) return false;
		const roundWinner = alive.length > 0 && (!this.teamMode || aliveTeams.length === 1) ? alive[0] ?? null : null;
		const roundWinnerTeam = this.teamMode && aliveTeams.length === 1 ? aliveTeams[0] ?? null : null;
		this.state.lastRoundWinnerId = roundWinner?.id ?? null;
		this.state.lastRoundWinnerTeam = roundWinnerTeam;
		if (roundWinner) {
			if (this.teamMode && roundWinnerTeam !== null) for (const tank of this.state.tanks) {
				this.workBudget?.charge("engineSteps");
				if (tank.team === roundWinnerTeam) tank.roundWins += 1;
			}
			else roundWinner.roundWins += 1;
		}
		const clinch = Math.ceil(this.totalRounds / 2);
		const winningTeamScore = this.teamMode && roundWinnerTeam !== null ? this.state.tanks.filter((tank) => tank.team === roundWinnerTeam).reduce((score, tank) => Math.max(score, tank.roundWins), 0) : roundWinner?.roundWins ?? 0;
		if (roundWinner !== null && winningTeamScore >= clinch || this.state.round >= this.totalRounds) {
			this.state.phase = "GAME_OVER";
			this.state.winner = this.computeMatchWinner();
			this.state.winnerTeam = this.computeMatchWinnerTeam();
			return true;
		}
		this.startNextRound();
		this.state.phase = "ROUND_OVER";
		return true;
	}
	/**
	* Rotate `activePlayerId` to the next tank that can actually take a turn — ALIVE and
	* NOT buried — in stable array order, wrapping around. Dead tanks are skipped; buried
	* tanks are skipped too (they are trapped, #15). Caller guarantees >= 2 are alive.
	*
	* Each call also advances the burial safety valve: every still-buried tank counts one
	* trapped turn, and once it has been trapped MAX_BURIED_TURNS turns it auto-digs-out so
	* a player can never be locked out forever (they may also be freed earlier by terrain
	* cleared over them). If EVERY alive tank is buried, the longest-trapped one is freed so
	* play always progresses.
	*/
	advanceTurn() {
		const tanks = this.state.tanks;
		const n = tanks.length;
		if (n === 0) return;
		for (const t of tanks) {
			this.workBudget?.charge("engineSteps");
			if (t.alive && t.buried) {
				t.buriedTurns += 1;
				if (t.buriedTurns >= MAX_BURIED_TURNS) {
					t.buried = false;
					t.buriedTurns = 0;
				}
			}
		}
		const cur = tanks.findIndex((t) => t.id === this.state.activePlayerId);
		const start = cur < 0 ? 0 : cur;
		for (let step = 1; step <= n; step++) {
			this.workBudget?.charge("engineSteps");
			const cand = tanks[(start + step) % n];
			if (!cand) continue;
			if (cand.alive && !cand.buried) {
				this.state.activePlayerId = cand.id;
				return;
			}
		}
		let pick = -1;
		for (let i = 0; i < n; i++) {
			this.workBudget?.charge("engineSteps");
			const candidate = tanks[i];
			if (!candidate || !candidate.alive) continue;
			const selected = pick < 0 ? void 0 : tanks[pick];
			if (selected === void 0 || candidate.buriedTurns > selected.buriedTurns) pick = i;
		}
		if (pick >= 0) {
			const selected = tanks[pick];
			if (!selected) return;
			selected.buried = false;
			selected.buriedTurns = 0;
			this.state.activePlayerId = selected.id;
		}
	}
	/**
	* Match winner = the tank with the STRICTLY-most round wins; a tie for the lead is
	* a draw (null). For a single-round match this reproduces the old win/draw rule
	* exactly: the sole survivor has 1 win (everyone else 0) => that tank; a mutual kill
	* leaves everyone at 0 => tie => null. Pure read over the roster — deterministic.
	*/
	computeMatchWinner() {
		const tanks = this.state.tanks;
		if (tanks.length === 0) return null;
		if (this.teamMode) {
			const team = this.computeMatchWinnerTeam();
			if (team === null) return null;
			return tanks.find((tank) => tank.team === team)?.id ?? null;
		}
		let best = tanks[0];
		if (!best) return null;
		let tie = false;
		for (let i = 1; i < tanks.length; i++) {
			this.workBudget?.charge("engineSteps");
			const candidate = tanks[i];
			if (!candidate) continue;
			if (candidate.roundWins > best.roundWins) {
				best = candidate;
				tie = false;
			} else if (candidate.roundWins === best.roundWins) tie = true;
		}
		return tie ? null : best.id;
	}
	/** Return the strict-leading team, or null for an unresolved team tie. */
	computeMatchWinnerTeam() {
		if (!this.teamMode) return null;
		const scores = /* @__PURE__ */ new Map();
		for (const tank of this.state.tanks) {
			this.workBudget?.charge("engineSteps");
			if (tank.team === 1 || tank.team === 2) scores.set(tank.team, Math.max(scores.get(tank.team) ?? 0, tank.roundWins));
		}
		const entries = [...scores.entries()];
		if (entries.length === 0) return null;
		entries.sort((a, b) => {
			this.workBudget?.charge("engineSteps");
			return b[1] - a[1] || a[0] - b[0];
		});
		if (entries.length > 1 && entries[0][1] === entries[1][1]) return null;
		return entries[0][0];
	}
	/**
	* Begin the next round of a best-of-N match (V1 match structure). Called from
	* resolve() when a round ended but the match has not been clinched. EVERYTHING here
	* is a pure function of (base seed, the new round number, the carried roster) — no
	* clock, no Math.random — so a fresh-engine replay of the same action log lands on
	* an identical next round on every networked client, needing NO new action.
	*
	* Carried across the round boundary: each tank's credits, purchased inventory, and
	* accumulated roundWins (matched by stable id). Reset: terrain (regenerated from the
	* derived round seed), tank positions (re-placed on the new surface), health, shield,
	* fuel, aim, selected weapon, alive flag, wind stream, projectiles, and the fire field.
	*/
	startNextRound() {
		this.state.round += 1;
		const roundSeed = deriveRoundSeed(this.seed, this.state.round);
		const heightLine = generate(roundSeed, this.workBudget);
		this.terrain = buildBitmap(heightLine, this.workBudget);
		applyTerrainHazards(this.terrain, roundSeed, normalizeTerrainHazardMode(this.options?.hazards), this.workBudget);
		this.state.terrain = this.terrain;
		this.state.terrainVersion += 1;
		this.workBudget?.charge("allocatedBytes", CANVAS_WIDTH * Float64Array.BYTES_PER_ELEMENT);
		const terrainArr = Array.from({ length: CANVAS_WIDTH }, (_, x) => surfaceAt(this.terrain, x, this.workBudget));
		const players = this.options?.players;
		const fresh = players && players.length >= 2 && players.length <= 4 ? placeTanks(terrainArr, players, this.options) : placeTwoTanks(terrainArr, this.options);
		const prior = new Map(this.state.tanks.map((t) => [t.id, t]));
		for (const tank of fresh) {
			this.workBudget?.charge("engineSteps");
			const old = prior.get(tank.id);
			if (old) {
				tank.credits = old.credits + Math.floor(old.credits * this.interestRate);
				tank.inventory = old.inventory;
				tank.accessories = { ...old.accessories };
				tank.powerCap = old.powerCap;
				tank.roundWins = old.roundWins;
				tank.kills = old.kills;
				tank.totalDamage = old.totalDamage;
			}
		}
		this.state.tanks = fresh;
		this.state.activePlayerId = fresh[0]?.id ?? "";
		this.state.projectiles = [];
		this.syncProjectileAlias();
		this.state.explosions = [];
		this.state.wallImpacts = [];
		this.state.lastExplosion = null;
		this.state.fire = [];
		this.fire.clear();
		this.fireScorched.clear();
		this.fireDef = null;
		this.pendingSettle = null;
		this.fallDistances.clear();
		this.windRng = createRng(roundSeed);
		this.windRngSeed = roundSeed;
		this.windRngCalls = 0;
		this.state.wind = this.nextWind(0);
		this.state.turn += 1;
		this.turnAtRoundStart = this.state.turn;
		this.state.phase = "PLAYER_TURN";
	}
	/**
	* THE detonation primitive — the SINGLE place a blast happens. Apply an
	* explosion at (cx, cy) for the given weapon: deform the pixel bitmap (crater
	* or raise) and let the touched columns' dirt fall, apply proximity damage to
	* EVERY alive tank, resolve each surviving tank against the new terrain (drop
	* into a fresh crater, or instakill if buried), and publish a
	* monotonically-id'd ExplosionEvent the client dedupes by id.
	*
	* Every weapon AND every airburst submunition routes through here, reading the
	* weapon's `detonation.*` group — so all blast behavior lives in one place.
	*/
	/**
	* Apply blast/burn damage to a tank, honoring its shield. The shield is a DAMAGE
	* POOL (tank.shieldHp): it absorbs up to its remaining charge of this hit and
	* drains by exactly that much; any OVERFLOW beyond the pool leaks through to the
	* tank's health (so the hit that breaks the shield still wounds). Every blast and
	* burn tick (cluster bomblets, betty hops, napalm ticks) routes through here with
	* its ACTUAL damage, so the field depletes commensurate with incoming magnitude —
	* a nuke drains ~100, a napalm tick ~0.7 — not one-hit-per-particle regardless of
	* size (REVIEW_BACKLOG P1-5). Pure min/subtract — deterministic, no RNG. Burial
	* (terrain) does NOT come through here — being buried bypasses the field by design.
	*/
	applyBlastDamage(tank, amount) {
		if (amount <= 0) return;
		const shooter = this.state.tanks.find((candidate) => candidate.id === this.shooterId);
		if (this.teamMode && tank.id !== this.shooterId && shooter?.team !== null && shooter?.team === tank.team) return;
		if (tank.shieldHp > 0) {
			const absorbed = Math.min(tank.shieldHp, amount);
			tank.shieldHp -= absorbed;
			amount -= absorbed;
			if (amount <= 0) return;
		}
		const before = tank.health;
		Tank.applyDamage(tank, amount);
		if (tank.id !== this.shooterId) {
			const dealt = before - tank.health;
			this.shotDamage += dealt;
			if (shooter) {
				shooter.totalDamage += dealt;
				if (before > 0 && tank.health <= 0) shooter.kills += 1;
			}
		}
	}
	/**
	* Re-derive every alive tank's position and burial state against the CURRENT
	* (post-settle) terrain bitmap. Called after each terrain compaction:
	*   - after flushSettleInstant() completes a full instant settle, and
	*   - after each settleStepAnimated() advances the animated settle one step.
	*
	* Loop body is identical to the original per-blast loop in detonate() — extracted
	* so that progressive settle ticks can re-run it without touching detonate().
	*/
	resolveTanksToTerrain() {
		for (const tank of this.state.tanks) {
			this.workBudget?.charge("engineSteps");
			if (!tank.alive) continue;
			const xi = Math.floor(tank.x);
			const surf = this.surfaceAtCached(tank.x);
			if (surf > tank.y) {
				const distance = surf - tank.y;
				this.fallDistances.set(tank.id, (this.fallDistances.get(tank.id) ?? 0) + distance);
				tank.y = surf;
				tank.buried = false;
			}
			if (pixelAt(this.terrain, xi, Math.floor(tank.y), this.workBudget) === 2) {
				Tank.applyDamage(tank, 100);
				tank.buried = false;
			} else if (pixelAt(this.terrain, xi, Math.floor(tank.y - 6), this.workBudget) > 0) {
				if (!tank.buried) tank.buriedTurns = 0;
				tank.buried = true;
			} else tank.buried = false;
		}
	}
	/** Apply one deterministic fall result after all collapse movement has converged. */
	applyPendingFallDamage() {
		for (const [tankId, distance] of this.fallDistances) {
			this.workBudget?.charge("engineSteps");
			const tank = this.state.tanks.find((candidate) => candidate.id === tankId);
			if (!tank || !tank.alive) continue;
			const rawDamage = Math.floor(Math.max(0, distance - 32) * FALL_DAMAGE_PER_PIXEL);
			if (rawDamage <= 0) continue;
			const hasParachute = tank.accessories.parachute > 0;
			const damage = hasParachute ? Math.floor(rawDamage * PARACHUTE_DAMAGE_FACTOR) : rawDamage;
			if (hasParachute) tank.accessories.parachute -= 1;
			Tank.applyDamage(tank, damage);
		}
		this.fallDistances.clear();
	}
	/**
	* Flush any pending terrain settle to full convergence in a SINGLE synchronous
	* call (instant compaction, identical to the old immediate applyGravity). Used
	* during FIRING (projectiles still in flight, so mid-flight bomblet trajectories
	* and collisions must stay byte-identical to the pre-AC-02 behavior) and on
	* game-ending turns (so the win banner never waits for dirt — preserves #14).
	*
	* After compaction, re-derives every alive tank's position/burial (same call
	* as the per-tick animated path), bumps terrainVersion, and clears pendingSettle.
	* No-op if pendingSettle is null.
	*/
	flushSettleInstant() {
		if (this.pendingSettle === null) return;
		const { xStart, xEnd } = this.pendingSettle;
		while (settleStep(this.terrain, xStart, xEnd, 600, this.workBudget));
		this.state.terrainVersion++;
		this.resolveTanksToTerrain();
		this.pendingSettle = null;
		this.applyPendingFallDamage();
	}
	/**
	* Advance the animated end-of-turn terrain collapse by ONE tick (COLLAPSE_PX_PER_TICK
	* pixels per column). Called once per RESOLVING tick. Re-derives tank positions
	* after each step (tanks sink progressively). Returns `true` if any pixel moved
	* (more settling still to do); `false` once fully converged (settle is done —
	* caller should transition to resolve() on the same tick). Clears pendingSettle
	* when converged.
	*
	* Bumps terrainVersion on every call so the renderer redraws after each step.
	*/
	settleStepAnimated() {
		if (this.pendingSettle === null) return false;
		const { xStart, xEnd } = this.pendingSettle;
		const moved = settleStep(this.terrain, xStart, xEnd, 4, this.workBudget);
		this.state.terrainVersion++;
		this.resolveTanksToTerrain();
		if (!moved) {
			this.pendingSettle = null;
			this.applyPendingFallDamage();
		}
		return moved;
	}
	/** Clear one Sandhog drill disc and defer its column collapse until detonation. */
	carveSandhogTunnel(cx, cy, radius) {
		const range = deform(this.terrain, cx, cy, radius, false, this.workBudget);
		if (range === null) return;
		if (this.pendingSettle === null) this.pendingSettle = {
			xStart: range.xStart,
			xEnd: range.xEnd
		};
		else {
			this.pendingSettle.xStart = Math.min(this.pendingSettle.xStart, range.xStart);
			this.pendingSettle.xEnd = Math.max(this.pendingSettle.xEnd, range.xEnd);
		}
		this.state.terrainVersion++;
	}
	detonate(cx, cy, weaponType, impactType, terrainMaterial) {
		const { radius, maxDamage, falloffExponent, raisesTerrain, preservesTerrain, style, color, durationFrames } = getWeapon(weaponType).detonation;
		const raise = raisesTerrain === true;
		const range = preservesTerrain === true ? null : deform(this.terrain, cx, cy, radius, raise, this.workBudget);
		if (range !== null) {
			if (this.pendingSettle === null) this.pendingSettle = {
				xStart: range.xStart,
				xEnd: range.xEnd
			};
			else {
				this.pendingSettle.xStart = Math.min(this.pendingSettle.xStart, range.xStart);
				this.pendingSettle.xEnd = Math.max(this.pendingSettle.xEnd, range.xEnd);
			}
			this.state.terrainVersion++;
		}
		const damageRadius = blastReachRadius(radius, style);
		for (const tank of this.state.tanks) {
			this.workBudget?.charge("engineSteps");
			if (!tank.alive) continue;
			const scaled = explosionDamage(cx, cy, damageRadius, tank, this.starterWeaponFalloff === "decisive" ? falloffExponent : void 0) / 100 * maxDamage;
			if (scaled > 0) this.applyBlastDamage(tank, scaled);
		}
		const event = {
			id: ++this.explosionSeq,
			weaponType,
			cx,
			cy: clamp(cy, 0, 600),
			radius,
			...impactType === void 0 ? {} : { impactType },
			...terrainMaterial === void 0 ? {} : { terrainMaterial },
			style,
			color,
			durationFrames
		};
		this.state.explosions.push(event);
		this.state.lastExplosion = event;
	}
	/**
	* Napalm impact — IGNITE, do not blast. Seeds a burning puddle of terrain
	* columns ±def.splashRadius around the impact x (no crater, no impact damage)
	* and emits a single ignition flash for visual punch + screen-shake. All of
	* napalm's damage is the per-tick burn applied later in processFire(); the
	* impact itself is harmless. Retains the def + center so the fire can spread.
	*
	* Determinism: ignite writes are pure arithmetic on the integer impact column;
	* the flash id comes from the same monotonic explosionSeq as every other blast.
	*/
	igniteNapalm(cx, cy, def, weaponType, impactType) {
		const center = Math.round(cx);
		this.fireDef = def;
		this.fireCenter = center;
		for (let dx = -def.splashRadius; dx <= def.splashRadius; dx++) {
			this.workBudget?.charge("engineSteps");
			this.ignite(center + dx, def.burnTicks);
		}
		const det = (getWeapon(weaponType) ?? getWeapon("napalm")).detonation;
		const event = {
			id: ++this.explosionSeq,
			weaponType,
			cx,
			cy: clamp(cy, 0, 600),
			radius: det.radius,
			...impactType === void 0 ? {} : { impactType },
			style: det.style,
			color: det.color,
			durationFrames: det.durationFrames
		};
		this.state.explosions.push(event);
		this.state.lastExplosion = event;
		this.syncFire();
	}
	/** Light a single terrain column, clamped in-bounds. A column burns at most
	*  once per fire: an already-scorched column is never relit (caller also guards
	*  this for spread, but igniting the splash is funneled through here too). */
	ignite(x, life) {
		if (x < 0 || x >= 1200) return;
		if (this.fireScorched.has(x)) return;
		this.fireScorched.add(x);
		this.fire.set(x, life);
	}
	/**
	* Advance the napalm fire one tick: SPREAD the front outward (downhill-biased),
	* BURN any tank standing in the flames, then DECAY every column. No-op when
	* nothing is alight. Fully deterministic — surface heights + fixed integer
	* steps, no RNG, no clock.
	*/
	processFire() {
		if (this.fire.size === 0 || this.fireDef === null) {
			if (this.state.fire.length > 0) this.state.fire = [];
			return;
		}
		const def = this.fireDef;
		let minX = Infinity;
		let maxX = -Infinity;
		for (const x of this.fire.keys()) {
			this.workBudget?.charge("engineSteps");
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
		}
		for (let s = 0; s < def.spreadRate; s++) {
			this.workBudget?.charge("engineSteps");
			const rx = maxX + 1;
			if (rx - this.fireCenter <= def.maxSpread && !this.fireScorched.has(rx) && this.canSpread(maxX, rx, def)) {
				this.ignite(rx, def.burnTicks);
				maxX = rx;
			}
			const lx = minX - 1;
			if (this.fireCenter - lx <= def.maxSpread && !this.fireScorched.has(lx) && this.canSpread(minX, lx, def)) {
				this.ignite(lx, def.burnTicks);
				minX = lx;
			}
		}
		const halfW = 10;
		for (const tank of this.state.tanks) {
			this.workBudget?.charge("engineSteps");
			if (!tank.alive) continue;
			const lo = Math.ceil(tank.x - halfW);
			const hi = Math.floor(tank.x + halfW);
			let inFire = false;
			for (let x = lo; x <= hi; x++) {
				this.workBudget?.charge("engineSteps");
				if (!this.fire.has(x)) continue;
				if (Math.abs(this.surfaceAtCached(x) - tank.y) <= 24) {
					inFire = true;
					break;
				}
			}
			if (inFire) this.applyBlastDamage(tank, def.dotPerTick);
		}
		let expired = null;
		for (const [x, life] of this.fire) {
			this.workBudget?.charge("engineSteps");
			const next = life - 1;
			if (next <= 0) (expired ??= []).push(x);
			else this.fire.set(x, next);
		}
		if (expired !== null) for (const x of expired) {
			this.workBudget?.charge("engineSteps");
			this.fire.delete(x);
		}
		if (this.fire.size === 0) {
			this.fireDef = null;
			this.fireScorched.clear();
		}
		this.syncFire();
	}
	/**
	* Whether the fire may spread from column `fromX` into neighbour `toX`. Flows
	* downhill (toX lower, i.e. larger surface y) freely; climbs a higher neighbour
	* only when the rise is within def.climbLimit px. An all-air neighbour column
	* (surfaceAt == CANVAS_HEIGHT) reads as far below => fire pours into the pit.
	*/
	canSpread(fromX, toX, def) {
		if (toX < 0 || toX >= 1200) return false;
		return this.surfaceAtCached(fromX) - this.surfaceAtCached(toX) <= def.climbLimit;
	}
	/** Mirror the working `fire` Map into `state.fire`, sorted by x for a stable,
	*  deterministic snapshot order (renderer + serialization read this array). */
	syncFire() {
		const current = this.state.fire;
		let canReuse = Array.isArray(current) && current.length === this.fire.size;
		let previousX = -1;
		if (canReuse) for (const cell of current) {
			this.workBudget?.charge("engineSteps");
			if (cell == null || !Number.isInteger(cell.x) || cell.x <= previousX || !this.fire.has(cell.x)) {
				canReuse = false;
				break;
			}
			previousX = cell.x;
		}
		if (canReuse) {
			for (const cell of current) {
				this.workBudget?.charge("engineSteps");
				cell.life = this.fire.get(cell.x);
			}
			return;
		}
		const cells = [];
		for (const [x, life] of this.fire) {
			this.workBudget?.charge("engineSteps");
			cells.push({
				x,
				life
			});
		}
		cells.sort((a, b) => {
			this.workBudget?.charge("engineSteps");
			return a.x - b.x;
		});
		this.state.fire = cells;
	}
};
/** Opt-in deterministic accounting. Infrastructure time and host memory are
* separate limits: these units describe source work, not elapsed milliseconds.
* Call before each unit/bulk allocation. An exhausted computation cannot resume.
* The trusted retained-artifact adapter owns the complete limits, never a wire
* descriptor or caller-supplied partial override. No defaults imply admission. */
var VERIFICATION_WORK_KINDS = Object.freeze([
	"engineTicks",
	"cpuProbes",
	"cpuCandidates",
	"sweepSegments",
	"sweepSamples",
	"collisionChecks",
	"terrainCells",
	"terrainSteps",
	"engineSteps",
	"allocatedBytes",
	"copiedBytes"
]);
function workIndex(kind) {
	switch (kind) {
		case "terrainCells": return 6;
		case "engineTicks": return 0;
		case "cpuProbes": return 1;
		case "cpuCandidates": return 2;
		case "sweepSegments": return 3;
		case "sweepSamples": return 4;
		case "collisionChecks": return 5;
		case "terrainSteps": return 7;
		case "engineSteps": return 8;
		case "allocatedBytes": return 9;
		case "copiedBytes": return 10;
		default: return -1;
	}
}
var VerificationWorkLimitError = class extends Error {
	kind;
	code = "work_limit";
	constructor(kind) {
		super("verification_work_limit");
		this.kind = kind;
		this.name = "VerificationWorkLimitError";
	}
};
var VerificationWorkBudget = class {
	limits;
	used = new Float64Array(VERIFICATION_WORK_KINDS.length);
	totalLimit;
	totalUsed = 0;
	exhausted = null;
	constructor(limits) {
		const keys = [...VERIFICATION_WORK_KINDS, "totalUnits"];
		if (!limits || typeof limits !== "object" || Array.isArray(limits) || Object.keys(limits).length !== keys.length || keys.some((key) => !Object.hasOwn(limits, key) || !Number.isSafeInteger(limits[key]) || limits[key] < 0)) throw new Error("invalid_verification_work_limits");
		this.limits = Float64Array.from(VERIFICATION_WORK_KINDS, (key) => limits[key]);
		this.totalLimit = limits.totalUnits;
	}
	charge(kind, units = 1) {
		if (this.exhausted) throw this.exhausted;
		const index = workIndex(kind);
		if (index < 0 || !Number.isSafeInteger(units) || units < 0) throw new Error("invalid_verification_work_charge");
		const failed = units > this.limits[index] - this.used[index] ? kind : units > this.totalLimit - this.totalUsed ? "totalUnits" : null;
		if (failed) {
			this.exhausted = new VerificationWorkLimitError(failed);
			throw this.exhausted;
		}
		this.used[index] = this.used[index] + units;
		this.totalUsed += units;
	}
	snapshot() {
		return Object.freeze({
			...Object.fromEntries(VERIFICATION_WORK_KINDS.map((key, index) => [key, this.used[index]])),
			totalUnits: this.totalUsed
		});
	}
};
/** cq1 internal source-work limits v1. No request/descriptor overrides exist.
* Derivation: docs/compatibility/cq1-work-limits.md. These finite logical-work
* caps do not certify affordable elapsed time; admission stays disabled until
* strict corpus timing and separately authorized hosted resource proof pass. */
var limits = {
	engineTicks: 30055,
	cpuProbes: 120,
	cpuCandidates: 480,
	sweepSegments: 60110,
	sweepSamples: 751375,
	collisionChecks: 781430,
	terrainCells: 93382502,
	terrainSteps: 282672,
	engineSteps: 1689583,
	allocatedBytes: 87438792,
	copiedBytes: 864e5
};
var VERIFIED_CHALLENGE_WORK_LIMITS = Object.freeze({
	...limits,
	totalUnits: Object.values(limits).reduce((sum, count) => sum + count, 0)
});
/** cq1 names the reviewed V3 policy independently of deployment tuples. */
function selectVerifiedChallengeCpuFire(engine, policyId = "cq1-hard-v3") {
	if (policyId !== "cq1-hard-v3") throw new Error("unsupported_verified_challenge_cpu_policy");
	return selectVerifiedCpuFireV3(engine);
}
function settled$1(state) {
	return state.phase !== "FIRING" && state.phase !== "RESOLVING";
}
function targetFor(state, shooter) {
	return state.tanks.find((tank) => tank.id !== shooter.id);
}
function simulateProbe(engine, shot) {
	engine.verificationWorkBudget?.charge("cpuProbes");
	const clone = engine.clone();
	const before = clone.getState();
	const shooter = before.tanks.find((tank) => tank.id === before.activePlayerId);
	if (!shooter) return null;
	const target = targetFor(before, shooter);
	if (!target) return null;
	const priorTargetHealth = target.health;
	const priorShooterHealth = shooter.health;
	clone.applyAction({
		type: "select_weapon",
		weapon: "baby_missile"
	});
	clone.applyAction({
		type: "set_angle",
		angle: shot.angle
	});
	clone.applyAction({
		type: "set_power",
		power: shot.power
	});
	if (!clone.applyAction({ type: "fire" })) return null;
	let ticks = 0;
	let closestDistance = Number.POSITIVE_INFINITY;
	while (!settled$1(clone.getState()) && ticks < 240) {
		const projectile = clone.getState().projectile;
		if (projectile) closestDistance = Math.min(closestDistance, Math.hypot(projectile.x - target.x, projectile.y - target.y));
		clone.tick();
		ticks += 1;
	}
	if (!settled$1(clone.getState())) return {
		completed: false,
		opponentDamage: 0,
		selfDamage: 0,
		closestDistance,
		ticks
	};
	const after = clone.getState();
	const afterTarget = after.tanks.find((tank) => tank.id === target.id);
	const afterShooter = after.tanks.find((tank) => tank.id === shooter.id);
	return {
		completed: true,
		opponentDamage: Math.max(0, priorTargetHealth - (afterTarget?.health ?? 0)),
		selfDamage: Math.max(0, priorShooterHealth - (afterShooter?.health ?? 0)),
		closestDistance,
		ticks
	};
}
function isBetter(candidate, best) {
	if (!best) return true;
	if (candidate.completed !== best.completed) return candidate.completed;
	if (!candidate.completed) return false;
	const candidateHits = candidate.opponentDamage > 0;
	if (candidateHits !== best.opponentDamage > 0) return candidateHits;
	if (candidate.opponentDamage !== best.opponentDamage) return candidate.opponentDamage > best.opponentDamage;
	if (candidate.selfDamage !== best.selfDamage) return candidate.selfDamage < best.selfDamage;
	return candidate.closestDistance < best.closestDistance;
}
function uniqueShots(shots, work) {
	const seen = /* @__PURE__ */ new Set();
	return shots.filter((shot) => {
		work?.charge("cpuCandidates");
		const key = `${shot.angle}:${shot.power}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
function selectVerifiedCpuFireV3(engine) {
	const state = engine.getState();
	const cpu = state.tanks.find((tank) => tank.id === state.activePlayerId);
	const target = cpu ? targetFor(state, cpu) : void 0;
	if (!cpu || !target) return Object.freeze({
		angle: 90,
		power: 20,
		weapon: "baby_missile",
		probeCount: 0,
		simulationTicks: 0,
		probes: Object.freeze([]),
		coarseBest: Object.freeze({
			angle: 90,
			power: 20
		})
	});
	const coarse = (target.x < cpu.x ? [
		90,
		105,
		120,
		135,
		150,
		165,
		175
	] : [
		5,
		20,
		35,
		50,
		65,
		80,
		90
	]).flatMap((angle) => [
		20,
		40,
		60,
		80,
		100
	].map((power) => {
		engine.verificationWorkBudget?.charge("cpuCandidates");
		return {
			angle,
			power
		};
	}));
	let simulationTicks = 0;
	let best = coarse[0] ?? {
		angle: 90,
		power: 20
	};
	let bestResult = null;
	for (const shot of coarse) {
		engine.verificationWorkBudget?.charge("cpuCandidates");
		const result = simulateProbe(engine, shot);
		simulationTicks += result?.ticks ?? 0;
		if (result && isBetter(result, bestResult)) {
			best = shot;
			bestResult = result;
		}
	}
	const coarseBest = Object.freeze({ ...best });
	const refinement = [
		-6,
		-3,
		0,
		3,
		6
	].flatMap((angleOffset) => [
		-8,
		-4,
		0,
		4,
		8
	].map((powerOffset) => {
		engine.verificationWorkBudget?.charge("cpuCandidates");
		return {
			angle: Math.max(0, Math.min(180, best.angle + angleOffset)),
			power: Math.max(0, Math.min(100, best.power + powerOffset))
		};
	}));
	const probes = uniqueShots([...coarse, ...refinement], engine.verificationWorkBudget).slice(0, 60);
	for (const shot of probes.slice(coarse.length)) {
		engine.verificationWorkBudget?.charge("cpuCandidates");
		const result = simulateProbe(engine, shot);
		simulationTicks += result?.ticks ?? 0;
		if (result && isBetter(result, bestResult)) {
			best = shot;
			bestResult = result;
		}
	}
	return Object.freeze({
		...best,
		weapon: "baby_missile",
		probeCount: probes.length,
		simulationTicks,
		probes: Object.freeze(probes.map((probe) => {
			engine.verificationWorkBudget?.charge("cpuCandidates");
			return Object.freeze({ ...probe });
		})),
		coarseBest
	});
}
Object.freeze([
	[
		"R-01",
		"Cadet",
		1,
		"◇",
		"single hollow diamond"
	],
	[
		"R-02",
		"Gunner",
		2,
		"◆",
		"single diamond"
	],
	[
		"R-03",
		"Bombardier",
		3,
		"◆◆",
		"double diamond"
	],
	[
		"R-04",
		"Artillerist",
		5,
		"▲",
		"single chevron"
	],
	[
		"R-05",
		"Battery Captain",
		7,
		"▲◆",
		"chevron and diamond"
	],
	[
		"R-06",
		"Siege Major",
		10,
		"▲▲",
		"double chevron"
	],
	[
		"R-07",
		"Field Colonel",
		14,
		"★",
		"single star"
	],
	[
		"R-08",
		"War Commander",
		20,
		"★◆",
		"star and diamond"
	],
	[
		"R-09",
		"Terra Marshal",
		30,
		"★▲",
		"star and chevron"
	],
	[
		"R-10",
		"Scorched Legend",
		50,
		"★★",
		"double star"
	]
].map(([code, title, level, mark, label]) => Object.freeze({
	code,
	title,
	level,
	insignia: Object.freeze({
		mark,
		label
	})
})));
/** Exact public cq1 contract. Parsing establishes shape, never server authority. */
var VERIFIED_CHALLENGE_RULES = Object.freeze({
	maxPlayers: 2,
	humanSeat: 0,
	rounds: 1,
	walls: "wrap",
	hazards: "none",
	gravity: .15,
	maxWind: 6,
	interestRate: 0,
	suddenDeathTurn: 0,
	teamMode: false,
	armsLevel: 0,
	starterWeaponFalloff: "decisive",
	weapon: "baby_missile"
});
var VERIFIED_CHALLENGE_LIMITS = Object.freeze({
	humanSalvos: 3,
	cpuSalvos: 3,
	angle: Object.freeze({
		min: 0,
		max: 180
	}),
	power: Object.freeze({
		min: 0,
		max: 100
	}),
	sessionSeconds: 1800,
	computeAttempts: 3
});
var VERIFIED_CHALLENGE_CQ1 = Object.freeze({
	descriptorVersion: 1,
	trialId: "crosswind-qualification",
	editionId: "cq1",
	entitlementId: "crosswind-qualification",
	objectiveVersion: 1,
	verifierArtifactId: "cq1",
	cpuPolicyId: "cq1-hard-v3",
	rewardVersion: 1,
	reward: Object.freeze({
		medalId: "crosswind-qualification",
		xp: 200
	}),
	seed: 42,
	rules: VERIFIED_CHALLENGE_RULES,
	limits: VERIFIED_CHALLENGE_LIMITS
});
function record(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function exactKeys(value, keys) {
	return Reflect.ownKeys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function parseVerifiedChallengeTranscript(value) {
	if (!Array.isArray(value) || value.length < 1 || value.length > VERIFIED_CHALLENGE_LIMITS.humanSalvos) return null;
	const result = [];
	for (const entry of value) {
		if (!record(entry) || !exactKeys(entry, ["angle", "power"]) || typeof entry.angle !== "number" || !Number.isInteger(entry.angle) || entry.angle < 0 || entry.angle > 180 || typeof entry.power !== "number" || !Number.isInteger(entry.power) || entry.power < 0 || entry.power > 100) return null;
		result.push(Object.freeze({
			angle: entry.angle === 0 ? 0 : entry.angle,
			power: entry.power === 0 ? 0 : entry.power
		}));
	}
	return Object.freeze(result);
}
var LIVE_TICKS_PER_SALVO = 391;
var LIVE_TICKS_TOTAL = 2346;
var CONSTRUCTION = Symbol("verified-challenge-controller");
var settled = (state) => state.phase !== "FIRING" && state.phase !== "RESOLVING";
var terminal = (state) => state.phase === "GAME_OVER" || state.phase === "ROUND_OVER";
/** Pure objective transition. The prior CPU is captured before accepted HUMAN
* fire, never inferred from the surviving post-salvo roster or damage statistics. */
function evaluateVerifiedChallengeSalvo(actor, before, after, humanSalvos) {
	if (!settled(after)) throw new Error("unsettled_verified_challenge_salvo");
	if (actor !== "human" && actor !== "cpu") throw new Error("invalid_verified_challenge_actor");
	if (!Number.isInteger(humanSalvos) || humanSalvos < 1 || humanSalvos > VERIFIED_CHALLENGE_LIMITS.humanSalvos) throw new Error("invalid_verified_challenge_salvo_count");
	if (actor === "human") {
		if (!before || !before.id || !Number.isFinite(before.health) || before.health <= 0 || before.health > 100) throw new Error("invalid_verified_challenge_cpu_snapshot");
		const cpu = after.tanks.find((tank) => tank.id === before.id);
		if (before.health - (cpu?.health ?? 0) > 0) return "objective_cleared";
	}
	if (terminal(after)) return "terminal_without_clear";
	if (actor === "human" && humanSalvos === VERIFIED_CHALLENGE_LIMITS.humanSalvos) return "objective_not_cleared";
	return null;
}
/** Fixed authored cq1 adapter. No descriptor can inject game options here. */
function createVerifiedChallengeOptions(editionId = "cq1") {
	if (editionId !== "cq1") throw new Error("unsupported_verified_challenge_edition");
	return {
		maxPlayers: 2,
		players: [{
			name: "Commander",
			color: "#e84d4d",
			loadout: {
				treads: "foundry",
				hull: "foundry",
				turret: "foundry",
				barrel: "foundry"
			}
		}, {
			name: "CPU",
			color: "#4d8ce8",
			ai: "hard",
			loadout: {
				treads: "foundry",
				hull: "foundry",
				turret: "foundry",
				barrel: "foundry"
			}
		}],
		seed: 42,
		maxWind: 6,
		gravity: .15,
		walls: "wrap",
		hazards: "none",
		rounds: 1,
		interestRate: 0,
		suddenDeathTurn: 0,
		armsLevel: 0,
		teamMode: false,
		starterWeaponFalloff: "decisive",
		rulesetVersion: 4
	};
}
var VerifiedChallengeController = class VerifiedChallengeController {
	workBudget;
	engineValue;
	humanId;
	cpuId;
	commitments = [];
	history = [];
	priorCpu = null;
	activeSalvo = null;
	currentSalvoTicks = 0;
	humanSalvos = 0;
	cpuSalvos = 0;
	liveTicks = 0;
	cpuSimulationTicks = 0;
	maximumProbeCount = 0;
	terminalReason = null;
	static create(editionId = "cq1") {
		const options = createVerifiedChallengeOptions(editionId);
		const work = new VerificationWorkBudget(VERIFIED_CHALLENGE_WORK_LIMITS);
		let engine;
		try {
			engine = new GameEngine(options, work);
		} catch (error) {
			if (!(error instanceof VerificationWorkLimitError)) throw error;
			return new VerifiedChallengeController(CONSTRUCTION, null, work);
		}
		return new VerifiedChallengeController(CONSTRUCTION, engine, work);
	}
	constructor(construction, engine, workBudget) {
		this.workBudget = workBudget;
		if (construction !== CONSTRUCTION) throw new Error("private_verified_challenge_controller_constructor");
		this.engineValue = engine;
		if (!engine) {
			this.humanId = "";
			this.cpuId = "";
			this.finish("work_limit");
			return;
		}
		const [human, cpu] = engine.getState().tanks;
		if (!human || !cpu || human.ai || cpu.ai !== "hard" || engine.getState().activePlayerId !== human.id) throw new Error("invalid_verified_challenge_roster");
		this.humanId = human.id;
		this.cpuId = cpu.id;
	}
	get engine() {
		if (!this.engineValue) throw new Error("discarded_verified_challenge_engine");
		return this.engineValue;
	}
	get work() {
		return this.workBudget.snapshot();
	}
	get complete() {
		return this.terminalReason !== null;
	}
	get awaitingHuman() {
		if (this.complete) return false;
		const state = this.engine.getState();
		return !this.complete && this.activeSalvo === null && state.phase === "PLAYER_TURN" && state.activePlayerId === this.humanId;
	}
	get transcript() {
		return Object.freeze(this.commitments.map((shot) => Object.freeze({ ...shot })));
	}
	get events() {
		return Object.freeze([...this.history]);
	}
	applyHumanAction(action) {
		if (this.complete) return false;
		try {
			return this.applyHumanActionChecked(action);
		} catch (error) {
			if (!(error instanceof VerificationWorkLimitError)) throw error;
			this.finish("work_limit");
			return false;
		}
	}
	applyHumanActionChecked(action) {
		const state = this.engine.getState();
		const human = state.tanks.find((tank) => tank.id === this.humanId);
		if (!this.awaitingHuman || !human?.alive || human.health <= 0) return false;
		if (action.type === "set_angle") return Number.isInteger(action.angle) && action.angle >= 0 && action.angle <= 180 ? this.engine.applyAction(action) : false;
		if (action.type === "set_power") return Number.isInteger(action.power) && action.power >= 0 && action.power <= 100 ? this.engine.applyAction(action) : false;
		if (action.type !== "fire" || this.humanSalvos >= VERIFIED_CHALLENGE_LIMITS.humanSalvos) return false;
		const cpu = state.tanks.find((tank) => tank.id === this.cpuId);
		if (!cpu?.alive || cpu.health <= 0) return false;
		const shot = parseVerifiedChallengeTranscript([{
			angle: human.angle,
			power: human.power
		}])?.[0];
		if (!shot) return false;
		this.engine.applyAction({
			type: "select_weapon",
			weapon: "baby_missile"
		});
		const before = Object.freeze({
			id: cpu.id,
			health: cpu.health
		});
		if (!this.engine.applyAction({ type: "fire" })) return false;
		this.priorCpu = before;
		this.commitments.push(shot);
		this.humanSalvos += 1;
		this.activeSalvo = "human";
		this.currentSalvoTicks = 0;
		return true;
	}
	finish(reason) {
		this.terminalReason = reason;
		this.activeSalvo = null;
		this.history.push(Object.freeze({
			type: "terminal",
			terminal: reason
		}));
		if (reason === "work_limit") {
			try {
				this.workBudget.charge("engineTicks", VERIFIED_CHALLENGE_WORK_LIMITS.engineTicks + 1);
			} catch (error) {
				if (!(error instanceof VerificationWorkLimitError)) throw error;
			}
			this.engineValue = null;
			this.priorCpu = null;
		}
	}
	tick() {
		if (this.complete || this.activeSalvo === null) return;
		try {
			this.tickChecked();
		} catch (error) {
			if (!(error instanceof VerificationWorkLimitError)) throw error;
			this.finish("work_limit");
		}
	}
	tickChecked() {
		if (!settled(this.engine.getState())) {
			if (this.currentSalvoTicks >= LIVE_TICKS_PER_SALVO || this.liveTicks >= LIVE_TICKS_TOTAL) {
				this.finish("work_limit");
				return;
			}
			this.engine.tick();
			this.currentSalvoTicks += 1;
			this.liveTicks += 1;
		}
		const state = this.engine.getState();
		if (!settled(state)) return;
		const actor = this.activeSalvo;
		const humanHealth = state.tanks.find((tank) => tank.id === this.humanId)?.health ?? 0;
		const cpuHealth = state.tanks.find((tank) => tank.id === this.cpuId)?.health ?? 0;
		const reason = evaluateVerifiedChallengeSalvo(actor, this.priorCpu, state, this.humanSalvos);
		this.history.push(Object.freeze({
			type: "salvo_settled",
			actor,
			salvo: actor === "human" ? this.humanSalvos : this.cpuSalvos,
			ticks: this.currentSalvoTicks,
			humanHealth,
			cpuHealth,
			damageToCpu: actor === "human" ? Math.max(0, (this.priorCpu?.health ?? cpuHealth) - cpuHealth) : 0,
			phase: state.phase
		}));
		this.priorCpu = null;
		this.activeSalvo = null;
		this.currentSalvoTicks = 0;
		if (reason) {
			this.finish(reason);
			return;
		}
		if (actor === "cpu") {
			if (state.activePlayerId !== this.humanId) throw new Error("verified_challenge_turn_mismatch");
			return;
		}
		if (state.activePlayerId !== this.cpuId) throw new Error("verified_challenge_turn_mismatch");
		if (this.cpuSalvos >= VERIFIED_CHALLENGE_LIMITS.cpuSalvos) {
			this.finish("work_limit");
			return;
		}
		const plan = selectVerifiedChallengeCpuFire(this.engine);
		this.cpuSimulationTicks += plan.simulationTicks;
		this.maximumProbeCount = Math.max(this.maximumProbeCount, plan.probeCount);
		this.engine.applyAction({
			type: "select_weapon",
			weapon: "baby_missile"
		});
		this.engine.applyAction({
			type: "set_angle",
			angle: plan.angle
		});
		this.engine.applyAction({
			type: "set_power",
			power: plan.power
		});
		if (!this.engine.applyAction({ type: "fire" })) throw new Error("verified_challenge_illegal_cpu_fire");
		this.cpuSalvos += 1;
		this.history.push(Object.freeze({
			type: "cpu_selected",
			salvo: this.cpuSalvos,
			angle: plan.angle,
			power: plan.power,
			probeCount: plan.probeCount,
			simulationTicks: plan.simulationTicks,
			coarseBest: Object.freeze({ ...plan.coarseBest })
		}));
		this.activeSalvo = "cpu";
	}
	result() {
		if (!this.terminalReason) throw new Error("incomplete_verified_challenge");
		const state = this.engineValue?.getState();
		return Object.freeze({
			editionId: VERIFIED_CHALLENGE_CQ1.editionId,
			seed: VERIFIED_CHALLENGE_CQ1.seed,
			terminal: this.terminalReason,
			humanSalvos: this.humanSalvos,
			cpuSalvos: this.cpuSalvos,
			humanHealth: state?.tanks.find((tank) => tank.id === this.humanId)?.health ?? 0,
			cpuHealth: state?.tanks.find((tank) => tank.id === this.cpuId)?.health ?? 0,
			liveTicks: this.liveTicks,
			cpuSimulationTicks: this.cpuSimulationTicks,
			maximumProbeCount: this.maximumProbeCount,
			transcript: this.transcript,
			events: this.events
		});
	}
};
/** The diagnostic work envelope is internal to the retained artifact and checks;
* it never expands the public descriptor or gives a caller a budget override. */
function replayVerifiedChallengeWithWork(rawTranscript, editionId = "cq1") {
	const transcript = parseVerifiedChallengeTranscript(rawTranscript);
	if (!transcript) throw new Error("invalid_verified_challenge_transcript");
	const controller = VerifiedChallengeController.create(editionId);
	for (const shot of transcript) {
		if (controller.complete) {
			if (controller.result().terminal === "work_limit") break;
			throw new Error("trailing_verified_challenge_action");
		}
		if (!controller.applyHumanAction({
			type: "set_angle",
			angle: shot.angle
		}) || !controller.applyHumanAction({
			type: "set_power",
			power: shot.power
		}) || !controller.applyHumanAction({ type: "fire" })) {
			if (controller.complete && controller.result().terminal === "work_limit") break;
			throw new Error("verified_challenge_illegal_human_fire");
		}
		while (!controller.complete && !controller.awaitingHuman) controller.tick();
	}
	return Object.freeze({
		result: controller.result(),
		work: controller.work
	});
}
var artifactApiVersion = 1;
var editionId = "cq1";
var catalog = VERIFIED_CHALLENGE_CQ1;
var workLimits = VERIFIED_CHALLENGE_WORK_LIMITS;
function replayWithWork(transcript) {
	return replayVerifiedChallengeWithWork(transcript, "cq1");
}
function freezeSnapshot(value) {
	if (!value || typeof value !== "object" || ArrayBuffer.isView(value)) return value;
	for (const child of Object.values(value)) freezeSnapshot(child);
	return Object.freeze(value);
}
function createController() {
	const controller = VerifiedChallengeController.create("cq1");
	return Object.freeze({
		get complete() {
			return controller.complete;
		},
		get awaitingHuman() {
			return controller.awaitingHuman;
		},
		get transcript() {
			return controller.transcript;
		},
		get events() {
			return controller.events;
		},
		get work() {
			return controller.work;
		},
		getState() {
			if (controller.complete && controller.result().terminal === "work_limit") return null;
			return freezeSnapshot(structuredClone(controller.engine.getState()));
		},
		applyHumanAction(action) {
			if (!action || typeof action !== "object" || Array.isArray(action)) return false;
			const keys = Object.keys(action).sort().join(",");
			if (action.type === "fire" ? keys !== "type" : action.type === "set_angle" ? keys !== "angle,type" : action.type === "set_power" ? keys !== "power,type" : true) return false;
			return controller.applyHumanAction(action);
		},
		tick() {
			controller.tick();
		},
		result() {
			return controller.result();
		}
	});
}
export { artifactApiVersion, catalog, createController, editionId, replayWithWork, workLimits };
