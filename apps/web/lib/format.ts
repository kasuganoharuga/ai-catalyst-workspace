/** en-AU datetime for tables and connection status rows. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** en-AU date-only for profile and account rows. */
export function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * en-AU date-only, abbreviated — "4 Aug 2026". For narrow tabular columns
 * where formatDate's full month name would either wrap or force the column
 * wider than the data deserves.
 */
export function formatShortDate(value: Date | string): string {
  return new Date(value).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
