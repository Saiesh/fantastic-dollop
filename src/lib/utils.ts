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
