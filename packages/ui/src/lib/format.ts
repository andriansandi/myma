/**
 * Human-readable format helpers used across the MyMA dashboard.
 */

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB", "PB"] as const;

export function formatBytes(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return "—";
  if (bytes === 0) return "0 B";

  const sign = bytes < 0 ? "-" : "";
  const abs = Math.abs(bytes);
  const i = Math.min(
    Math.floor(Math.log(abs) / Math.log(1024)),
    BYTE_UNITS.length - 1
  );
  const value = Number((abs / 1024 ** i).toFixed(2));
  return `${sign}${value} ${BYTE_UNITS[i]}`;
}

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 31536000000],
  ["month", 2628000000],
  ["week", 604800000],
  ["day", 86400000],
  ["hour", 3600000],
  ["minute", 60000],
  ["second", 1000],
];

export function formatRelativeTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  for (const [unit, ms] of UNITS) {
    if (abs >= ms) {
      const value = Math.round(diff / ms);
      return RELATIVE_TIME_FORMATTER.format(value, unit);
    }
  }
  return "just now";
}

const LOCAL_TIME_FORMATTER = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatLocalTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return LOCAL_TIME_FORMATTER.format(date);
}
