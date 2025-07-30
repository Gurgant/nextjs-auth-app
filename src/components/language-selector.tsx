'use client'

import { usePathname } from 'next/navigation'
import { useRouter } from 'next/navigation'

export function LanguageSelector({ locale }: { locale: string }) {
  const pathname = usePathname()
  const router = useRouter()

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = e.target.value
    const segments = pathname.split('/')
    segments[1] = newLocale
    router.push(segments.join('/') as any)
  }

  return (
    <select 
      className="border rounded px-2 py-1"
      value={locale}
      onChange={handleChange}
    >
      <option value="en">English</option>
      <option value="es">Español</option>
      <option value="fr">Français</option>
    </select>
  )
}