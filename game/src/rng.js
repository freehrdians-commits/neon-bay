// A small seeded random number generator: the same seed gives the same city life, which is
// what makes the screenshot scenes repeatable. Mulberry32, written here from its definition.

// Mulberry32: a 32-bit state advanced by a fixed odd increment, then mixed.
export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A gaussian-ish value around 0 with spread 1, from two uniform draws (Box-Muller). */
export function gauss(random) {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Pick one of `entries` [{value, weight}] in proportion to weight, using `random`. */
export function weightedPick(random, entries) {
  let total = 0;
  for (const entry of entries) total += entry.weight;
  let roll = random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
}

/** An integer in [min, max] from `random`. */
export function intBetween(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

/** Pick one element of `list` uniformly. */
export function choice(random, list) {
  return list[Math.floor(random() * list.length)];
}
