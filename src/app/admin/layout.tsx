import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { adminLogout } from "@/lib/actions/admin-auth";
import { isAdminAuthenticated } from "@/lib/auth/admin-session";
import { cn } from "@/lib/utils";

interface AdminLayoutProps {
  children: React.ReactNode;
}

/**
 * Returns true when the request targets the admin login screen (including trailing segments).
 * Why: login must stay outside the authenticated chrome so unauthenticated users are not stuck in redirect loops.
 */
function isAdminLoginPath(pathname: string): boolean {
  return pathname === "/admin/login" || pathname.startsWith("/admin/login/");
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "";
  const authenticated = await isAdminAuthenticated();
  const onLogin = isAdminLoginPath(pathname);

  // Why: signed-in admins should land on the dashboard, not the password form.
  if (authenticated && onLogin) {
    redirect("/admin");
  }

  // Why: every other admin URL is sensitive; unauthenticated visitors must authenticate first.
  if (!authenticated && !onLogin) {
    redirect("/admin/login");
  }

  // Why: login page is rendered without the admin chrome so the form stays the only focus.
  if (!authenticated && onLogin) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-full">
      <nav
        className={cn(
          "sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur",
          "supports-[backdrop-filter]:bg-background/60",
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <Link
            href="/"
            className="shrink-0 text-xs font-semibold uppercase tracking-widest text-accent transition-colors hover:text-accent/90"
          >
            IPL FanBet
          </Link>
          <span className="text-sm font-medium text-muted-foreground">Admin</span>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/admin"
              className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground"
            >
              Dashboard
            </Link>
            <form action={adminLogout}>
              <button
                type="submit"
                className="rounded-md border border-border bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/80"
              >
                Log out
              </button>
            </form>
          </div>
        </div>
      </nav>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
