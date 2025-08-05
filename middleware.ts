import { NextRequest, NextResponse } from 'next/server'
import { getSafeLocale, isValidLocale, type Locale, ALLOWED_LOCALES, DEFAULT_LOCALE } from '@/config/i18n'
import { getClientIP } from '@/lib/utils/request'

/**
 * Check if the request is for a static asset
 */
function isStaticAsset(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname.startsWith('/robots.txt') ||
    pathname.startsWith('/sitemap.xml') ||
    pathname.match(/\.(jpg|jpeg|png|gif|svg|ico|webp|css|js|woff|woff2|ttf|otf)$/i) !== null
  )
}

/**
 * Check if path is auth-related
 */
function isAuthRelatedPath(pathname: string): boolean {
  return (
    pathname.includes('/auth/signin') ||
    pathname.includes('/auth/callback') ||
    pathname.includes('/api/auth/')
  )
}

/**
 * Extract locale from request with multiple fallback strategies
 */
function extractLocaleFromRequest(request: NextRequest): {
  locale: Locale
  isValid: boolean
  source: 'path' | 'cookie' | 'header' | 'default'
} {
  const pathname = request.nextUrl.pathname
  
  // Strategy 1: Try to extract from path
  const pathMatch = pathname.match(/^\/([a-z]{2})(?:\/|$)/)
  if (pathMatch) {
    const possibleLocale = pathMatch[1]
    if (isValidLocale(possibleLocale)) {
      return { locale: possibleLocale, isValid: true, source: 'path' }
    }
    
    // Log invalid locale attempts in production
    if (process.env.NODE_ENV === 'production') {
      console.error('[Security] Invalid locale in path:', {
        attempted: possibleLocale,
        path: pathname,
        ip: getClientIP(request),
        userAgent: request.headers.get('user-agent')
      })
    }
  }
  
  // Strategy 2: Try locale cookie
  const cookieLocale = request.cookies.get('NEXT_LOCALE')?.value
  if (cookieLocale && isValidLocale(cookieLocale)) {
    return { locale: cookieLocale, isValid: true, source: 'cookie' }
  }
  
  // Strategy 3: Try Accept-Language header
  const acceptLanguage = request.headers.get('accept-language')
  if (acceptLanguage) {
    // Parse accept-language header (e.g., "en-US,en;q=0.9,es;q=0.8")
    const languages = acceptLanguage
      .split(',')
      .map(lang => lang.split(';')[0].trim().toLowerCase())
      .map(lang => lang.split('-')[0]) // Get language without region
    
    for (const lang of languages) {
      if (isValidLocale(lang)) {
        return { locale: lang as Locale, isValid: true, source: 'header' }
      }
    }
  }
  
  // Default fallback
  return { locale: DEFAULT_LOCALE, isValid: false, source: 'default' }
}

/**
 * Handle i18n routing - ensure locale is in path
 */
function handleI18nRouting(request: NextRequest, locale: Locale): NextResponse | null {
  const pathname = request.nextUrl.pathname
  
  // Skip API routes and static assets
  if (pathname.startsWith('/api') || isStaticAsset(pathname)) {
    return null
  }
  
  // Check if locale is already in path
  const hasLocaleInPath = ALLOWED_LOCALES.some(
    l => pathname === `/${l}` || pathname.startsWith(`/${l}/`)
  )
  
  // Special handling for root path
  if (pathname === '/') {
    const response = NextResponse.redirect(new URL(`/${locale}`, request.url))
    response.cookies.set('NEXT_LOCALE', locale, { 
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365 // 1 year
    })
    return response
  }
  
  // Redirect to localized path if locale not present
  if (!hasLocaleInPath) {
    const response = NextResponse.redirect(new URL(`/${locale}${pathname}`, request.url))
    response.cookies.set('NEXT_LOCALE', locale, { 
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365 // 1 year
    })
    return response
  }
  
  return null
}

/**
 * Handle OAuth/Auth error redirects
 */
function handleAuthErrors(request: NextRequest, locale: Locale): NextResponse | null {
  const { pathname, searchParams } = request.nextUrl
  
  if (searchParams.has('error')) {
    const error = searchParams.get('error')
    
    // Log for debugging
    console.log('[Middleware] Auth error check:', {
      pathname,
      error,
      isAuthPath: isAuthRelatedPath(pathname)
    })
    
    if (isAuthRelatedPath(pathname)) {
      // Log auth errors for security monitoring
      console.log('[Security] Auth error redirect:', {
        error,
        locale,
        path: pathname,
        timestamp: new Date().toISOString()
      })
      
      // Create secure redirect URL
      const errorUrl = new URL(`/${locale}/auth/error`, request.url)
      if (error) {
        errorUrl.searchParams.set('error', error)
      }
      
      return NextResponse.redirect(errorUrl)
    }
  }
  
  return null
}

/**
 * Handle NextAuth hardcoded locale paths
 * NextAuth has hardcoded /en/auth/* paths - we intercept and redirect to correct locale
 */
function handleAuthLocaleRedirect(request: NextRequest, locale: Locale): NextResponse | null {
  const pathname = request.nextUrl.pathname
  
  // Check if this is a hardcoded English auth path
  if (pathname.startsWith('/en/auth/') && locale !== 'en') {
    console.log('[Middleware] Intercepting hardcoded auth path:', {
      originalPath: pathname,
      userLocale: locale,
      timestamp: new Date().toISOString()
    })
    
    // Replace /en/ with the user's actual locale
    const correctedPath = pathname.replace('/en/', `/${locale}/`)
    const correctedUrl = new URL(correctedPath, request.url)
    
    // Preserve query parameters
    request.nextUrl.searchParams.forEach((value, key) => {
      correctedUrl.searchParams.set(key, value)
    })
    
    console.log('[Middleware] Redirecting to correct locale:', {
      from: pathname,
      to: correctedPath,
      locale
    })
    
    return NextResponse.redirect(correctedUrl)
  }
  
  return null
}

/**
 * Add security headers to any response
 */
function addSecurityHeaders(response: NextResponse, locale: Locale): NextResponse {
  // Add locale header for downstream services
  response.headers.set('X-Locale', locale)
  
  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  
  return response
}

/**
 * Main middleware function
 */
export function middleware(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname
  
  // Early return for static assets
  if (isStaticAsset(pathname)) {
    return NextResponse.next()
  }
  
  // Extract and validate locale
  const { locale, isValid, source } = extractLocaleFromRequest(request)
  
  // Log security events for invalid locale attempts
  if (!isValid && source === 'path' && process.env.NODE_ENV === 'production') {
    console.error('[Security] Invalid locale attempt detected:', {
      path: pathname,
      source,
      ip: getClientIP(request),
      userAgent: request.headers.get('user-agent'),
      timestamp: new Date().toISOString()
    })
  }
  
  // Handle i18n routing first (for proper locale setup)
  const i18nResponse = handleI18nRouting(request, locale)
  if (i18nResponse) {
    return addSecurityHeaders(i18nResponse, locale)
  }
  
  // Handle NextAuth hardcoded locale paths
  const authLocaleResponse = handleAuthLocaleRedirect(request, locale)
  if (authLocaleResponse) {
    return addSecurityHeaders(authLocaleResponse, locale)
  }
  
  // Handle auth errors with validated locale
  const authResponse = handleAuthErrors(request, locale)
  if (authResponse) {
    return addSecurityHeaders(authResponse, locale)
  }
  
  // Default response with security headers
  const response = NextResponse.next()
  return addSecurityHeaders(response, locale)
}

/**
 * Middleware configuration
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:jpg|jpeg|png|gif|svg|ico|webp|css|js|woff|woff2|ttf|otf)$).*)',
    '/',
  ],
}