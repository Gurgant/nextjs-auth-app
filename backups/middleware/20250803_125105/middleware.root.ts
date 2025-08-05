import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  
  // Handle OAuth/Auth errors by redirecting to our error page
  if (searchParams.has('error')) {
    const error = searchParams.get('error')
    
    // Check if this is an auth-related URL with an error parameter
    if (pathname.includes('/auth/signin') || pathname.includes('/auth/callback') || pathname.includes('/api/auth/')) {
      console.log('🚨 Middleware: Redirecting auth error to error page:', error)
      const locale = pathname.split('/')[1] || 'en'
      return NextResponse.redirect(
        new URL(`/${locale}/auth/error?error=${error}`, request.url)
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (but include api/auth errors)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}