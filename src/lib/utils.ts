import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** All times are shown in the merchant's local zone, on the server and the client. */
export const DISPLAY_TIME_ZONE = "Europe/Dublin";
const LOCALE = "en-IE";

export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(minor / 100);
}

const dateTimeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateTimeSecondsFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dateFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const timeFormat = new Intl.DateTimeFormat(LOCALE, {
  timeZone: DISPLAY_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: DateInput, withSeconds = false): string {
  const date = toDate(value);
  if (!date) return "—";
  return (withSeconds ? dateTimeSecondsFormat : dateTimeFormat).format(date);
}

export function formatDate(value: DateInput): string {
  const date = toDate(value);
  return date ? dateFormat.format(date) : "—";
}

export function formatTime(value: DateInput): string {
  const date = toDate(value);
  return date ? timeFormat.format(date) : "—";
}

/** "3 days", "5 hours", "12 minutes": the gap between two instants. */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms);
  const seconds = Math.round(abs / 1000);
  if (seconds < 90) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function formatRelative(value: DateInput, now: Date = new Date()): string {
  const date = toDate(value);
  if (!date) return "—";
  const diff = date.getTime() - now.getTime();
  const text = formatDuration(diff);
  return diff <= 0 ? `${text} ago` : `in ${text}`;
}

/** First characters of a hash, for display next to a "verify" action. */
export function shortHash(hash: string | null | undefined, length = 10): string {
  return hash ? hash.slice(0, length) : "—";
}

export function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function sentenceCase(value: string): string {
  const spaced = value.replace(/[_-]+/g, " ").trim();
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : spaced;
}

export function formatAddress(
  address:
    | {
        name?: string | null;
        line1?: string | null;
        line2?: string | null;
        city?: string | null;
        state?: string | null;
        postalCode?: string | null;
        country?: string | null;
      }
    | null
    | undefined,
): string[] {
  if (!address) return [];
  const cityLine = [address.city, address.state, address.postalCode].filter(Boolean).join(", ");
  return [address.name, address.line1, address.line2, cityLine, address.country].filter(
    (line): line is string => Boolean(line && line.trim()),
  );
}

export function pluralise(count: number, singular: string, plural = singular + "s"): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
