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
  '/api/seeds',
  '/api/thoughts',
  '/api/calendar',
  '/api/images',
  '/api/chat',
  '/api/push',
  '/api/debug',
  '/chat',
  '/garden',
  '/settings',
]

const PUBLIC_PREFIXES = [
  '/api/login',
  '/api/register',
  '/api/push/notifications',
  '/api/push/subscribe',
  '/login',
  '/onboarding',
  '/setup',
  '/',
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
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))

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
