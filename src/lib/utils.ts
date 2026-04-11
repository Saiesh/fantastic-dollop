import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Why: Combines clsx conditional class logic with tailwind-merge's
// conflict resolution so later utility classes override earlier ones.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Why: Centralises INR display with the rupee symbol and Indian grouping (lakhs/crores)
// via Intl instead of concatenating a 3-letter code with toLocaleString.
export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

// Why: Match and ledger timestamps are stored in UTC but must display as IST for IPL,
// independent of server region or the viewer's browser timezone.
export function formatMatchDate(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Date(date).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    ...options,
  });
}

// Why: Same fixed Asia/Kolkata interpretation for time-only labels (kickoff, deadlines).
export function formatMatchTime(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Date(date).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  });
}

// Why: Some UI needs a single combined string (dateStyle/timeStyle or default locale
// datetime); wrapping toLocaleString keeps IST consistent with the helpers above.
export function formatMatchDateTime(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    ...options,
  });
}
