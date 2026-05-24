import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format, isAfter, isBefore } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeDate(date: string | null | undefined): string {
  if (!date) return "Never";
  return formatDistanceToNow(new Date(date), { addSuffix: true });
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  return format(new Date(date), "MMMM d, yyyy");
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return "—";
  return format(new Date(date), "MMM d, yyyy 'at' h:mm a");
}

export function isExpired(date: string | null | undefined): boolean {
  if (!date) return false;
  return isBefore(new Date(date), new Date());
}

export function isUpcoming(date: string | null | undefined): boolean {
  if (!date) return false;
  return isAfter(new Date(date), new Date());
}

export function getDaysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function getHoursUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60));
}

export function getTimeOfDay(): "morning" | "afternoon" | "evening" {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "…";
}

export function entryTypeIcon(type: string): string {
  const icons: Record<string, string> = {
    login: "🔑",
    note: "📝",
    file: "📎",
    contact: "👤",
    financial: "🏦",
    card: "💳",
    identity: "🪪",
    crypto: "🪙",
    custom: "⚙️",
  };
  return icons[type] ?? "📄";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function copyToClipboard(text: string, clearAfterMs = 30000): void {
  navigator.clipboard.writeText(text);
  if (clearAfterMs > 0) {
    setTimeout(() => navigator.clipboard.writeText(""), clearAfterMs);
  }
}
