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

/** Returns "Xh Ym" when < 24h remaining, "X days" otherwise. Returns "overdue" if past. */
export function formatDeadlineCountdown(date: string | null | undefined): string {
  if (!date) return "—";
  const diffMs = new Date(date).getTime() - Date.now();
  if (diffMs < 0) return "overdue";
  const totalMinutes = Math.floor(diffMs / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** Formats an hour (0–23) as a human-readable time, e.g. 9 → "9:00 AM". */
export function formatHour(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return format(d, "h:mm a");
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
