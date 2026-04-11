"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import {
  clearAdminCookie,
  setAdminCookie,
  verifyAdminPassword,
} from "@/lib/auth/admin-session";

const AdminLoginSchema = z.object({
  password: z.string().min(1, "Enter the admin password."),
});

export type AdminLoginResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Validates the password against the `ADMIN_PASSWORD` env var and issues an admin JWT cookie.
 * Why: keeps admin auth separate from both player sessions and DB credentials.
 */
export async function adminLogin(input: unknown): Promise<AdminLoginResult> {
  const parsed = AdminLoginSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Invalid input.";
    return { success: false, error: first };
  }

  if (!verifyAdminPassword(parsed.data.password)) {
    return { success: false, error: "Incorrect password." };
  }

  await setAdminCookie();
  return { success: true };
}

/**
 * Clears the admin session and sends the browser back to the login screen.
 * Why: explicit logout avoids relying on clients to discard httpOnly cookies.
 */
export async function adminLogout(): Promise<never> {
  await clearAdminCookie();
  redirect("/admin/login");
}
