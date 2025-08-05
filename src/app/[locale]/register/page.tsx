import { RegistrationForm } from '@/components/auth/registration-form'
import { AuthGuard, FormPageLayout } from '@/components/layouts'
import { type Locale } from '@/config/i18n'

interface Props {
  params: Promise<{ locale: string }>
}

export default async function RegisterPage({ params }: Props) {
  const { locale: localeParam } = await params
  const locale = localeParam as Locale
  
  return (
    <AuthGuard locale={locale} requireAuth={false}>
      <FormPageLayout>
        <RegistrationForm locale={locale} />
      </FormPageLayout>
    </AuthGuard>
  )
}