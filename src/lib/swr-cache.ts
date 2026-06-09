/**
 * Tiny stale-while-revalidate cache on sessionStorage.
 *
 * The backend sits behind a Cloudflare tunnel, so every page load paying a
 * full round-trip makes the web app feel slow. Pages render the cached
 * payload instantly and refresh it in the background.
 */

const PREFIX = 'gp_swr:'

export function readCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeCache(key: string, data: unknown) {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(data))
  } catch {
    // storage full or unavailable — caching is best-effort
  }
}
