import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Skip auth if env vars are missing (avoids MIDDLEWARE_INVOCATION_FAILED)
  if (!supabaseUrl || !supabaseKey) {
    return response
  }

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    })

    // Refresh session if expired
    await supabase.auth.getUser()
  } catch {
    // Auth check failed — allow through without auth
  }

  return response
}

export const config = {
  matcher: ['/chat/:path*', '/api/:path*'],
}
