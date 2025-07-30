import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n.ts')

const nextConfig: NextConfig = {
  experimental: {
    typedRoutes: true,
  },
  images: {
    domains: ['lh3.googleusercontent.com'], // For Google profile images
  },
}

export default withNextIntl(nextConfig)