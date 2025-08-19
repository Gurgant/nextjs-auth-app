import { auth } from '@/lib/auth'
import { DashboardContent } from '@/components/dashboard-content'
import { AuthGuard } from '@/components/layouts'

interface Props {
  params: Promise<{ locale: string }>
}

export default async function DashboardPage({ params }: Props) {
  const session = await auth()
  const { locale } = await params
  
  return (
    <AuthGuard locale={locale} requireAuth>
      {session?.user ? (
        <DashboardContent user={session.user} />
      ) : null}
    </AuthGuard>
  )
}