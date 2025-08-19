import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations } from 'next-intl/server'
import { locales } from '@/i18n'
import { type Locale } from '@/config/i18n'
import { AuthSessionProvider } from '@/components/auth/session-provider'
import { LanguageSelector } from '@/components/language-selector'
import Link from 'next/link'
import '../globals.css'

const inter = Inter({ subsets: ['latin'] })

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Layout' })
  const tHome = await getTranslations({ locale, namespace: 'Home' })
  
  return {
    title: t('appTitle'),
    description: tHome('subtitle'),
  }
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale: localeParam } = await params
  
  if (!locales.includes(localeParam as any)) {
    notFound()
  }
  
  const locale = localeParam as Locale

  const messages = await getMessages()
  const t = await getTranslations('Layout')

  return (
    <html lang={locale}>
      <body className={inter.className} suppressHydrationWarning>
        <AuthSessionProvider>
          <NextIntlClientProvider messages={messages}>
            <div className="min-h-screen flex flex-col bg-gray-50">
              <nav className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-200/50 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                  <div className="flex justify-between h-16 items-center">
                    <Link href={`/${locale}`} className="flex items-center space-x-3 hover:opacity-80 transition-opacity duration-200">
                      <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                        {t('appTitle')}
                      </h1>
                    </Link>
                    <div className="flex items-center gap-4">
                      <LanguageSelector locale={locale} />
                    </div>
                  </div>
                </div>
              </nav>
              <main className="flex-1">
                {children}
              </main>
            </div>
          </NextIntlClientProvider>
        </AuthSessionProvider>
      </body>
    </html>
  )
}