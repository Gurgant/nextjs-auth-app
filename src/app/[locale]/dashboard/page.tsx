import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Role } from "@/lib/types/prisma";

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function DashboardPage({ params }: Props) {
  const session = await auth();
  const { locale } = await params;

  // Redirect to role-specific dashboard
  if (session?.user) {
    const userRole = ((session.user as any).role as Role) || "USER";

    switch (userRole) {
      case "ADMIN":
        redirect(`/${locale}/admin`);
      case "PRO_USER":
        redirect(`/${locale}/dashboard/pro`);
      case "USER":
      default:
        redirect(`/${locale}/dashboard/user`);
    }
  }

  // If no session, redirect to login
  redirect(`/${locale}/auth/signin`);
}
