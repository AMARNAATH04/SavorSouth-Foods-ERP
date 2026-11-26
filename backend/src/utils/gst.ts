import { applyBps } from './money.js';

export interface GstSplitResult {
  isInterState: boolean;
  taxableAmountPaisa: number;
  cgstPaisa: number;
  sgstPaisa: number;
  igstPaisa: number;
  totalTaxPaisa: number;
  totalAmountPaisa: number;
}

/**
 * Indian GST calculation using integer paisa and basis points (5% = 500 bps).
 * Intra-state (customerStateCode === companyStateCode): split equally into CGST + SGST.
 * Inter-state (customerStateCode !== companyStateCode): full IGST.
 */
export function calculateGstLine(
  taxableAmountPaisa: number,
  gstRateBps: number,
  customerStateCode: string,
  companyStateCode = '33',
): GstSplitResult {
  const isInterState = customerStateCode.trim() !== companyStateCode.trim();
  const totalTaxPaisa = applyBps(taxableAmountPaisa, gstRateBps);

  if (isInterState) {
    return {
      isInterState: true,
      taxableAmountPaisa,
      cgstPaisa: 0,
      sgstPaisa: 0,
      igstPaisa: totalTaxPaisa,
      totalTaxPaisa,
      totalAmountPaisa: taxableAmountPaisa + totalTaxPaisa,
    };
  }

  // Split total tax equally between CGST and SGST
  const cgstPaisa = Math.floor(totalTaxPaisa / 2);
  const sgstPaisa = totalTaxPaisa - cgstPaisa;

  return {
    isInterState: false,
    taxableAmountPaisa,
    cgstPaisa,
    sgstPaisa,
    igstPaisa: 0,
    totalTaxPaisa,
    totalAmountPaisa: taxableAmountPaisa + totalTaxPaisa,
  };
}

/**
 * Returns Indian Financial Year string e.g. "2026-27" for dates from April 1 to March 31.
 */
export function getFinancialYear(date: Date = new Date()): string {
  const month = date.getMonth(); // 0-indexed (0 = Jan, 3 = Apr)
  const year = date.getFullYear();
  const startYear = month >= 3 ? year : year - 1;
  const endShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endShort}`;
}
