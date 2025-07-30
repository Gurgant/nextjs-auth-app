import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { RegistrationForm } from '@/components/auth/registration-form'

interface Props {
  params: Promise<{ locale: string }>
}

export default async function RegisterPage({ params }: Props) {
  const session = await auth()
  const { locale } = await params
  
  // If user is already logged in, redirect to dashboard
  if (session?.user) {
    redirect(`/${locale}/dashboard`)
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4 py-8">
        <div className="w-full max-w-md">
          <RegistrationForm locale={locale} />
        </div>
      </div>
    </div>
  )
}