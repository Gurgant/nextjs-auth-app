import { NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { locales } from '@/i18n'

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale: 'en',
  localePrefix: 'always'
})

export default function middleware(req: NextRequest) {
  // Skip internationalization for API routes
  if (req.nextUrl.pathname.startsWith('/api')) {
    return
  }

  // Apply internationalization to all other routes
  return intlMiddleware(req)
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|robots.txt|sitemap.xml).*)', '/']
}