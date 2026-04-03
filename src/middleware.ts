import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Lightweight auth middleware.
 *
 * - Public routes: pass through (login, register, health checks)
 * - Protected routes: require a valid JWT Bearer token
 *
 * Actual JWT validation happens on the backend; this middleware provides
 * a first line of defense by rejecting obviously unauthenticated requests.
 */

// Routes that require auth
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

// Routes that are always public
const PUBLIC_PREFIXES = [
  '/api/login',
  '/api/register',
  '/api/push/notifications',  // GET is called by PWA before auth
  '/login',
  '/onboarding',
  '/setup',
  '/',
]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow static assets and Next.js internals
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

  // Check if route needs auth
  const isProtected = PROTECTED_PREFIXES.some(p => pathname.startsWith(p))
  const isPublic = PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p))

  if (!isProtected || isPublic) {
    return NextResponse.next()
  }

  // For protected API routes, check for Authorization header
  if (pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }
    // Token present — let it through (backend validates the JWT)
    return NextResponse.next()
  }

  // For protected page routes, we can't check localStorage from middleware
  // (it's client-side only), so just pass through — the client handles redirects
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
