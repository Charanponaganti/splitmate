export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  /** Number of digits after the decimal point in the smallest currency unit (ISO 4217). */
  decimals: number;
  locale: string;
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  INR: { code: "INR", name: "Indian Rupee", symbol: "₹", decimals: 2, locale: "en-IN" },
  USD: { code: "USD", name: "US Dollar", symbol: "$", decimals: 2, locale: "en-US" },
  EUR: { code: "EUR", name: "Euro", symbol: "€", decimals: 2, locale: "de-DE" },
  GBP: { code: "GBP", name: "British Pound", symbol: "£", decimals: 2, locale: "en-GB" },
  AUD: { code: "AUD", name: "Australian Dollar", symbol: "A$", decimals: 2, locale: "en-AU" },
  CAD: { code: "CAD", name: "Canadian Dollar", symbol: "C$", decimals: 2, locale: "en-CA" },
  SGD: { code: "SGD", name: "Singapore Dollar", symbol: "S$", decimals: 2, locale: "en-SG" },
  AED: { code: "AED", name: "UAE Dirham", symbol: "AED", decimals: 2, locale: "en-AE" },
  CHF: { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimals: 2, locale: "de-CH" },
  CNY: { code: "CNY", name: "Chinese Yuan", symbol: "¥", decimals: 2, locale: "zh-CN" },
  THB: { code: "THB", name: "Thai Baht", symbol: "฿", decimals: 2, locale: "th-TH" },
  NPR: { code: "NPR", name: "Nepalese Rupee", symbol: "Rs", decimals: 2, locale: "en-NP" },
  LKR: { code: "LKR", name: "Sri Lankan Rupee", symbol: "Rs", decimals: 2, locale: "en-LK" },
  JPY: { code: "JPY", name: "Japanese Yen", symbol: "¥", decimals: 0, locale: "ja-JP" },
  KRW: { code: "KRW", name: "South Korean Won", symbol: "₩", decimals: 0, locale: "ko-KR" },
  IDR: { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", decimals: 2, locale: "id-ID" },
  KWD: { code: "KWD", name: "Kuwaiti Dinar", symbol: "KD", decimals: 3, locale: "en-KW" },
  BHD: { code: "BHD", name: "Bahraini Dinar", symbol: "BD", decimals: 3, locale: "en-BH" },
  OMR: { code: "OMR", name: "Omani Rial", symbol: "OMR", decimals: 3, locale: "en-OM" },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as [string, ...string[]];

export const DEFAULT_CURRENCY = "INR";

/**
 * Upper bound for any single amount in minor units. Keeps every intermediate sum
 * comfortably below Number.MAX_SAFE_INTEGER even across thousands of expenses.
 */
export const MAX_AMOUNT_MINOR = 100_000_000_000; // 1e11 minor units

export function isSupportedCurrency(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, code);
}

export function getCurrency(code: string): CurrencyInfo {
  const info = CURRENCIES[code];
  if (!info) throw new Error(`Unsupported currency: ${code}`);
  return info;
}

/**
 * Parses a user-entered decimal string into integer minor units without ever
 * going through floating point. Returns null when the input is not a valid
 * non-negative amount for the currency (e.g. too many decimal places).
 */
export function parseToMinor(input: string, currency: string): number | null {
  return parseScaledDecimal(input, getCurrency(currency).decimals);
}

/**
 * Parses a non-negative decimal string into an integer scaled by 10^decimals,
 * e.g. ("33.33", 2) -> 3333. Exact: never uses floating point.
 */
export function parseScaledDecimal(input: string, decimals: number): number | null {
  const cleaned = input.replace(/[\s,_]/g, "");
  if (cleaned === "") return null;
  const match = /^(\d+)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return null;
  const whole = match[1];
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) {
    // Allow trailing zeros beyond the precision (e.g. "10.500" for INR).
    if (!/^0*$/.test(fraction.slice(decimals))) return null;
  }
  const paddedFraction = (fraction.slice(0, decimals) + "0".repeat(decimals)).slice(0, decimals);
  const digits = (whole + paddedFraction).replace(/^0+(?=\d)/, "");
  if (digits.length > 15) return null;
  const value = Number(digits);
  if (!Number.isSafeInteger(value)) return null;
  return value;
}

/** Inverse of parseScaledDecimal with trailing zeros trimmed, e.g. (3350, 2) -> "33.5". */
export function scaledToDecimalString(value: number, decimals: number): string {
  if (decimals === 0) return String(value);
  const padded = Math.abs(value).toString().padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals);
  const fraction = padded.slice(padded.length - decimals).replace(/0+$/, "");
  return `${value < 0 ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** Converts minor units to a plain decimal string, e.g. 120050 INR -> "1200.50". */
export function minorToDecimalString(minor: number, currency: string): string {
  const { decimals } = getCurrency(currency);
  const negative = minor < 0;
  const abs = Math.abs(minor).toString();
  if (decimals === 0) return (negative ? "-" : "") + abs;
  const padded = abs.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals);
  const fraction = padded.slice(padded.length - decimals);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}:${compact}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    const info = getCurrency(currency);
    formatter = new Intl.NumberFormat(info.locale, {
      style: "currency",
      currency: info.code,
      minimumFractionDigits: compact ? 0 : info.decimals,
      maximumFractionDigits: compact ? 1 : info.decimals,
      notation: compact ? "compact" : "standard",
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/** Formats minor units for display using the currency's locale conventions. */
export function formatMoney(
  minor: number,
  currency: string,
  options: { signed?: boolean; compact?: boolean } = {},
): string {
  const { decimals } = getCurrency(currency);
  const major = minor / 10 ** decimals;
  const formatted = getFormatter(currency, options.compact ?? false).format(Math.abs(major));
  if (minor < 0) return `−${formatted}`;
  if (options.signed && minor > 0) return `+${formatted}`;
  return formatted;
}

/** Converts minor units to a JS number in major units. Display/charting only. */
export function minorToMajorNumber(minor: number, currency: string): number {
  return minor / 10 ** getCurrency(currency).decimals;
}
