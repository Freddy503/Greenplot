/**
 * Lightweight reflection detection — keyword + structure heuristics.
 * Returns true if the message reads like a mental thought / reflection.
 */
export function isReflection(text: string): boolean {
  const lower = text.toLowerCase().trim()

  // Too short to be a reflection
  if (lower.length < 40) return false

  // Strong reflection indicators (any one is enough)
  const strongPatterns = [
    /i('ve| have) been thinking/,
    /i('ve| have) been wondering/,
    /i('m| am) realizing/,
    /it('s| is) interesting (how|that|because)/,
    /what if (we|i|you|there)/,
    /i feel like/,
    /it makes me think/,
    /it('s| is) fascinating (how|that|because)/,
    /i just realized/,
    /something (i|that) ('ve|have) noticed/,
    /i wonder (if|whether|how|why)/,
    /it('s| is) becoming clear/,
    /here('s| is) (a|my) thought/,
    /random thought/,
    /shower thought/,
    /brain dump/,
    /stream of consciousness/,
  ]

  for (const pat of strongPatterns) {
    if (pat.test(lower)) return true
  }

  // Moderate indicators — need 2+ to count
  const moderatePatterns = [
    /i think/,
    /i believe/,
    /maybe (it|we|this)/,
    /perhaps/,
    /it seems like/,
    /i('d| would) argue/,
    /on (one|the) hand/,
    /the way i see it/,
    /in my (opinion|view|experience)/,
    /connecting (the|these) dots/,
    /there('s| is) (a|this) pattern/,
  ]

  let moderateHits = 0
  for (const pat of moderatePatterns) {
    if (pat.test(lower)) moderateHits++
    if (moderateHits >= 2) return true
  }

  // Structural heuristic: long message + few question marks = reflective
  const questionMarks = (lower.match(/\?/g) || []).length
  if (lower.length > 200 && questionMarks <= 1) {
    // Check for introspective language
    const introspective = /\b(i|my|me|myself|we|our)\b/g
    const matches = lower.match(introspective) || []
    if (matches.length >= 5) return true
  }

  return false
}
