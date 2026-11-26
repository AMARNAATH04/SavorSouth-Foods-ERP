import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CompanySettings, Invoice } from '../types/erp';

export function formatINR(paisa: number | undefined | null): string {
  const value = (paisa ?? 0) / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function generateInvoicePdf(invoice: Invoice, company: CompanySettings): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header band
  doc.setFillColor(24, 61, 50); // #183D32
  doc.rect(0, 0, pageWidth, 88, 'F');

  doc.setTextColor(255, 248, 237);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(company.companyName, 40, 38);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${company.tagline} | FSSAI: ${company.fssaiLicense}`, 40, 56);
  doc.text(`${company.address}, ${company.city}, ${company.state} (${company.stateCode})`, 40, 71);

  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(217, 164, 65); // #D9A441
  doc.text(invoice.status === 'CANCELLED' ? 'CANCELLED INVOICE' : 'TAX INVOICE', pageWidth - 40, 38, {
    align: 'right',
  });
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(`No: ${invoice.invoiceNumber}`, pageWidth - 40, 56, { align: 'right' });
  doc.text(`Date: ${formatDate(invoice.invoiceDate)}`, pageWidth - 40, 71, { align: 'right' });

  // GSTIN & Customer blocks
  doc.setTextColor(37, 43, 41);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Supplier GSTIN: ${company.gstin}`, 40, 112);
  doc.text(`Financial Year: ${invoice.financialYear}`, pageWidth - 40, 112, { align: 'right' });

  doc.setFillColor(255, 248, 237);
  doc.roundedRect(40, 124, pageWidth - 80, 74, 6, 6, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('BILL TO:', 54, 144);
  doc.setFont('helvetica', 'bold');
  doc.text(invoice.customer.name, 54, 160);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`${invoice.customer.address}, ${invoice.customer.city}`, 54, 174);
  doc.text(
    `State: ${invoice.customer.state} (Code: ${invoice.customer.stateCode}) | GSTIN: ${
      invoice.customer.gstin || 'Unregistered'
    }`,
    54,
    188,
  );

  doc.setFont('helvetica', 'bold');
  doc.text('Supply Type:', pageWidth - 200, 144);
  doc.setFont('helvetica', 'normal');
  doc.text(
    invoice.isInterState ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)',
    pageWidth - 200,
    160,
  );
  if (invoice.creditNoteNumber) {
    doc.setTextColor(184, 92, 56);
    doc.setFont('helvetica', 'bold');
    doc.text(`Credit Note: ${invoice.creditNoteNumber}`, pageWidth - 200, 178);
  }

  // Line items table
  autoTable(doc, {
    startY: 215,
    head: [
      [
        '#',
        'Product Description',
        'HSN',
        'Qty (Pkts)',
        'Rate (INR)',
        'Taxable (INR)',
        'GST %',
        invoice.isInterState ? 'IGST (INR)' : 'CGST + SGST (INR)',
        'Total (INR)',
      ],
    ],
    body: invoice.items.map((item, idx) => [
      idx + 1,
      item.productName,
      item.hsnCode,
      item.quantityPackets,
      (item.unitPricePaisa / 100).toFixed(2),
      (item.taxableAmountPaisa / 100).toFixed(2),
      `${(item.gstRateBps / 100).toFixed(1)}%`,
      invoice.isInterState
        ? (item.igstPaisa / 100).toFixed(2)
        : `${(item.cgstPaisa / 100).toFixed(2)} + ${(item.sgstPaisa / 100).toFixed(2)}`,
      (item.totalAmountPaisa / 100).toFixed(2),
    ]),
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [24, 61, 50], textColor: 255 },
    alternateRowStyles: { fillColor: [255, 251, 245] },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;

  // Tax Summary Box
  const boxX = pageWidth - 260;
  doc.setDrawColor(217, 164, 65);
  doc.roundedRect(boxX, finalY, 220, 128, 6, 6);

  const row = (label: string, val: string, y: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 11 : 9.5);
    doc.setTextColor(37, 43, 41);
    doc.text(label, boxX + 12, y);
    doc.text(val, boxX + 208, y, { align: 'right' });
  };

  row('Taxable Amount:', formatINR(invoice.taxableAmountPaisa), finalY + 22);
  if (invoice.isInterState) {
    row('IGST:', formatINR(invoice.igstPaisa), finalY + 42);
  } else {
    row('CGST (2.5%):', formatINR(invoice.cgstPaisa), finalY + 42);
    row('SGST (2.5%):', formatINR(invoice.sgstPaisa), finalY + 60);
  }
  doc.line(boxX + 12, finalY + 72, boxX + 208, finalY + 72);
  row('Invoice Total:', formatINR(invoice.totalAmountPaisa), finalY + 90, true);
  row('Paid:', formatINR(invoice.paidAmountPaisa), finalY + 108);
  row('Balance Due:', formatINR(invoice.totalAmountPaisa - invoice.paidAmountPaisa), finalY + 122, true);

  doc.setFontSize(8.5);
  doc.setTextColor(100);
  doc.text(
    'This is a computer-generated GST Tax Invoice from SavorSouth Foods ERP.',
    40,
    finalY + 145,
  );

  doc.save(`${invoice.invoiceNumber.replace(/\//g, '-')}.pdf`);
}
