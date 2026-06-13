/**
 * Authenticated API fetch wrapper.
 *
 * - Attaches the Bearer token from localStorage automatically.
 * - On 401: clears the stored token and redirects to /login so the
 *   user can re-authenticate. Avoids silent failures across all pages.
 */
export function getToken(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem('greenplot_token') || ''
}

/**
 * Wipe all locally-cached chat state.
 *
 * Chat conversations, sessions, sources and ratings are persisted in
 * localStorage under GLOBAL (non-user-scoped) keys so they survive refresh.
 * That means they MUST be cleared whenever the signed-in account changes —
 * otherwise a different user on the same browser would see the previous
 * user's conversations restored from cache. The user's real chats are always
 * re-synced from the backend (which is tenant-scoped) after login.
 */
export function clearChatCache() {
  if (typeof window === 'undefined') return
  const prefixes = [
    'greenplot_conv_',
    'greenplot_session_',
    'greenplot_sources_',
    'greenplot_rating_',
  ]
  const exact = [
    'greenplot_conversations',
    'greenplot_active_conv',
    'greenplot_chat_messages',
    'greenplot_spec_prefill',
  ]
  for (const key of Object.keys(localStorage)) {
    if (exact.includes(key) || prefixes.some((p) => key.startsWith(p))) {
      localStorage.removeItem(key)
    }
  }
}

export function clearAuth() {
  localStorage.removeItem('greenplot_token')
  localStorage.removeItem('greenplot_tenant')
  localStorage.removeItem('greenplot_nickname')
  clearChatCache()
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const token = getToken()

  const headers = new Headers(init.headers ?? {})
  if (!headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(input, { ...init, headers })

  if (res.status === 401) {
    clearAuth()
    if (typeof window !== 'undefined') {
      window.location.href = '/login'
    }
  }

  return res
}
