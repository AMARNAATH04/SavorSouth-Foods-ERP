export function toSafeNumber(value: bigint | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'bigint' ? Number(value) : value;
}

export function rupeesToPaisa(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paisaToRupees(paisa: bigint | number): number {
  return toSafeNumber(paisa) / 100;
}

export function formatINR(paisa: bigint | number): string {
  const rupees = paisaToRupees(paisa);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
}

/**
 * Exact integer-paisa proportional share:
 * round((totalValuePaisa * partQty) / totalQty)
 */
export function proportionalPaisa(
  totalValuePaisa: bigint | number,
  partQty: bigint | number,
  totalQty: bigint | number,
): number {
  const tv = BigInt(totalValuePaisa);
  const pq = BigInt(partQty);
  const tq = BigInt(totalQty);
  if (tq === 0n || pq === 0n) return 0;
  // Half-up rounding using BigInt arithmetic
  const numerator = tv * pq * 2n + tq;
  return Number(numerator / (2n * tq));
}

/**
 * Exact basis-points calculation:
 * round((amountPaisa * bps) / 10000)
 */
export function applyBps(amountPaisa: bigint | number, bps: number): number {
  const amt = BigInt(amountPaisa);
  const b = BigInt(bps);
  const numerator = amt * b * 2n + 10000n;
  return Number(numerator / 20000n);
}
