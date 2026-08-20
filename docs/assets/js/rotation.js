// Deterministic PRNG using Mulberry32
function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

// Generate a daily seed based on UTC date string and topic ID
function generateSeed(topicId, dateString) {
  let hash = 0;
  const str = topicId + "|" + dateString;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  }
  return hash;
}

// Get today's UTC date string (YYYY-MM-DD)
function todayUtcDateString() {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

// Pick the deterministically random question ID for a given topic
function todaysQuestionId(pool, topicId, dateString) {
  if (!pool || pool.length === 0) return null;
  const seed = generateSeed(topicId, dateString);
  const prng = mulberry32(seed);
  const index = Math.floor(prng() * pool.length);
  return pool[index].id;
}
