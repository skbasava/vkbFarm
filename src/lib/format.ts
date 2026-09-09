const INR_LOCALE = "en-IN";
const KOLKATA_TIME_ZONE = "Asia/Kolkata";

const currencyFormatter = new Intl.NumberFormat(INR_LOCALE, {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat(INR_LOCALE, {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: KOLKATA_TIME_ZONE,
});

const weightFormatter = new Intl.NumberFormat(INR_LOCALE, {
  maximumFractionDigits: 2,
});

/** Formats an integer paise value as Indian rupees. */
export function formatINR(paise: number): string {
  return currencyFormatter.format(paise / 100);
}

/** Formats an integer paise value in Indian lakh/crore notation. */
export function formatCompactINR(paise: number): string {
  const rupees = paise / 100;
  const compactFormatter = new Intl.NumberFormat(INR_LOCALE, {
    maximumFractionDigits: 2,
  });

  if (Math.abs(rupees) >= 10_000_000) {
    return `₹${compactFormatter.format(rupees / 10_000_000)} Cr`;
  }
  if (Math.abs(rupees) >= 100_000) {
    return `₹${compactFormatter.format(rupees / 100_000)} L`;
  }
  return formatINR(paise);
}

/** Displays an ISO local calendar date without shifting it through UTC. */
export function formatDate(date: string): string {
  return dateFormatter.format(new Date(`${date}T00:00:00+05:30`));
}

export function formatWeight(weightKg: number): string {
  return `${weightFormatter.format(weightKg)} kg`;
}
