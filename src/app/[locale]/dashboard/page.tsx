import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { DashboardContent } from '@/components/dashboard-content'

interface Props {
  params: Promise<{ locale: string }>
}

export default async function DashboardPage({ params }: Props) {
  const session = await auth()
  const { locale } = await params
  
  if (!session?.user) {
    redirect(`/${locale}`)
  }

  return (
    <DashboardContent user={session.user} />
  )
}