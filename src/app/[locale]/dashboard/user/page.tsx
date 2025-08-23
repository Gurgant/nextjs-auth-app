/**
 * User Dashboard Page
 * Accessible to all authenticated users (USER, PRO_USER, ADMIN)
 */

import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  getRoleDisplayName,
  getRoleFeatures,
  getRoleBadgeColor,
} from "@/lib/auth/rbac";
import { Role } from "@/lib/types/prisma";

export default async function UserDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect(`/${locale}/auth/signin`);
  }

  const t = await getTranslations();
  const userRole = (session.user.role as Role) || "USER";
  const features = getRoleFeatures(userRole);
  const badgeColor = getRoleBadgeColor(userRole);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900">User Dashboard</h1>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${badgeColor}`}
            >
              {getRoleDisplayName(userRole)}
            </span>
          </div>
          <p className="text-gray-600">
            Welcome back, {session.user.name || session.user.email}!
          </p>
        </div>

        {/* User Info Card */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Account Information</h2>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">Email</span>
              <span className="font-medium">{session.user.email}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">Name</span>
              <span className="font-medium">
                {session.user.name || "Not set"}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">Role</span>
              <span className="font-medium">
                {getRoleDisplayName(userRole)}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-600">Email Verified</span>
              <span className="font-medium">
                {session.user.emailVerified ? (
                  <span className="text-green-600">✓ Verified</span>
                ) : (
                  <span className="text-yellow-600">⚠ Not Verified</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Available Features */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Available Features</h2>
          <ul className="space-y-2">
            {features.map((feature, index) => (
              <li key={index} className="flex items-center">
                <svg
                  className="w-5 h-5 text-green-500 mr-2"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a
              href={`/${locale}/settings`}
              className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <h3 className="font-medium mb-1">Edit Profile</h3>
              <p className="text-sm text-gray-600">
                Update your personal information
              </p>
            </a>
            <a
              href={`/${locale}/settings/security`}
              className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <h3 className="font-medium mb-1">Security Settings</h3>
              <p className="text-sm text-gray-600">
                Manage your password and 2FA
              </p>
            </a>
            {userRole === "USER" && (
              <a
                href={`/${locale}/upgrade`}
                className="block p-4 border border-blue-200 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <h3 className="font-medium mb-1 text-blue-700">
                  Upgrade to Pro
                </h3>
                <p className="text-sm text-blue-600">
                  Unlock advanced features
                </p>
              </a>
            )}
            <a
              href={`/${locale}/help`}
              className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <h3 className="font-medium mb-1">Help & Support</h3>
              <p className="text-sm text-gray-600">
                Get assistance when you need it
              </p>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
