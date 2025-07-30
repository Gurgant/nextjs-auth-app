import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { AccountManagement } from '@/components/account/account-management'

interface Props {
  params: Promise<{ locale: string }>
}

export default async function AccountPage({ params }: Props) {
  const session = await auth()
  const { locale } = await params
  
  // If user is not logged in, redirect to home
  if (!session?.user) {
    redirect(`/${locale}`)
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50 via-white to-purple-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <AccountManagement user={session.user} locale={locale} />
      </div>
    </div>
  )
}