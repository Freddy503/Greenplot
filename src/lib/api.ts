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

export function clearAuth() {
  localStorage.removeItem('greenplot_token')
  localStorage.removeItem('greenplot_tenant')
  localStorage.removeItem('greenplot_nickname')
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
