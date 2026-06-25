import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Lightweight auth proxy.
 *
 * - Public routes: pass through (login, register, health checks)
 * - Protected routes: require a valid JWT Bearer token
 *
 * Actual JWT validation happens on the backend; this proxy provides a first
 * line of defense by rejecting obviously unauthenticated requests.
 */

const PROTECTED_PREFIXES = [
  '/api/activity',
  '/api/admin',
  '/api/agents',
  '/api/api-keys',
  '/api/seeds',
  '/api/thoughts',
  '/api/calendar',
  '/api/canvas',
  '/api/chat',
  '/api/coherence-report',
  '/api/comments',
  '/api/debug',
  '/api/design-vision',
  '/api/email',
  '/api/garden',
  '/api/github',
  '/api/graph',
  '/api/ingest',
  '/api/insights',
  '/api/links',
  '/api/me',
  '/api/nodes',
  '/api/outcomes',
  '/api/papers',
  '/api/products',
  '/api/profile',
  '/api/push',
  '/api/relationships',
  '/api/research',
  '/api/schedule',
  '/api/scheduler',
  '/api/search',
  '/api/sessions',
  '/api/spaces',
  '/api/specs',
  '/api/wiki',
  '/chat',
  '/garden',
  '/library',
  '/links',
  '/notifications',
  '/settings',
  '/studio',
  '/wiki',
  '/workflows',
]

const PUBLIC_EXACT_PATHS = [
  '/',
  '/impressum',
  '/invite',
  '/login',
  '/onboarding',
  '/privacy',
  '/reset-password',
  '/setup',
]

const PUBLIC_API_PREFIXES = [
  '/api/auth',
  '/api/feedback/feature-request',
  '/api/login',
  '/api/register',
  '/api/waitlist',
  '/api/wiki/images',
]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icon') ||
    pathname.startsWith('/manifest') ||
    pathname.startsWith('/sw.js') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
  const isPublic =
    PUBLIC_EXACT_PATHS.includes(pathname) ||
    PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    (pathname === '/api/push/subscribe' && request.method === 'GET')

  if (!isProtected || isPublic) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
