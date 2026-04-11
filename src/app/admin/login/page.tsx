import type { Metadata } from "next";

import { AdminLoginForm } from "@/app/admin/login/admin-login-form";

export const metadata: Metadata = {
  title: "Admin sign in | IPL FanBet",
};

/**
 * Standalone admin login route so admin JWT cookies can be issued before visiting other `/admin` pages.
 * Why: admin auth is separate from player sessions and is verified in the admin layout (when added).
 */
export default function AdminLoginPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Admin sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the database password from your deployment configuration.
        </p>
      </div>
      <AdminLoginForm />
    </div>
  );
}
