const ISO_LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Returns true only for a real ISO local calendar date. */
export function isIsoLocalDate(value: string): boolean {
  const match = ISO_LOCAL_DATE.exec(value);
  if (!match) return false;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function requireIsoLocalDate(value: string): string {
  if (!isIsoLocalDate(value)) {
    throw new TypeError("Date must be an ISO local calendar date");
  }
  return value;
}
