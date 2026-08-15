// Deterministic daily rotation engine. No AI, no network, no storage.
// Same UTC calendar day -> same "today" question for every visitor.
// See SPEC.md §7.

// mulberry32 seeded by summing char codes of a string — small, dependency-free PRNG.
function seededShuffle(items, seedStr) {
  let seed = 0;
  for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const ROTATION_EPOCH_UTC = Date.UTC(2026, 0, 1);

function utcDayIndex(todayUtcString) {
  return Math.floor((Date.parse(todayUtcString + "T00:00:00Z") - ROTATION_EPOCH_UTC) / 86400000);
}

// pool: array of question objects (already filtered to status === "answered")
// Returns the id of today's featured question for this pool, or null if empty.
function todaysQuestionId(pool, topic, todayUtcString) {
  if (!pool.length) return null;
  const cycleSeed = `${topic}`;
  const order = seededShuffle(
    pool.map((q) => q.id),
    cycleSeed
  );
  const dayIndex = utcDayIndex(todayUtcString);
  const position = ((dayIndex % order.length) + order.length) % order.length;
  return order[position];
}

function todayUtcDateString(date) {
  const d = date || new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { seededShuffle, todaysQuestionId, todayUtcDateString };
}
