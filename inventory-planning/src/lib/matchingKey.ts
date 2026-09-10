/**
 * Some exports (observed in real "Order on the way" and SA79 files) carry the
 * SKU matching key as a 13-digit EAN — the 12-digit Item Code used elsewhere
 * (INV01, SA79's own Item Code/Line) with a standard EAN-13 check digit
 * appended, e.g. Item Code `406354967677` -> EAN `4063549676774`. Left as-is,
 * these never match INV01's 12-digit Item Code at all. Only strip when the
 * 13th digit is verified to be the correct checksum for the first 12 — never
 * a blind slice, since not every 13-digit value is one of these derived codes.
 */
function ean13CheckDigit(twelveDigits: string): string {
  let sumOdd = 0;
  let sumEven = 0;
  for (let i = 0; i < 12; i++) {
    const d = twelveDigits.charCodeAt(i) - 48;
    if (i % 2 === 0) sumOdd += d;
    else sumEven += d;
  }
  return String((10 - ((sumOdd + sumEven * 3) % 10)) % 10);
}

export function normalizeMatchingKey(code: string): string {
  const trimmed = code.trim();
  if (trimmed.length === 13 && /^\d{13}$/.test(trimmed)) {
    const base = trimmed.slice(0, 12);
    if (ean13CheckDigit(base) === trimmed[12]) return base;
  }
  return trimmed;
}
