export type ExtractResultRow = {
  label?: string;
  fields?: { key: string; value?: unknown; is_calculate?: boolean }[];
  invoice_number?: string;
  invoice_duplicate?: boolean;
  fill_error?: string;
};

const INVOICE_NUMBER_VALID_RE = /^[0-9]{8,20}$/;

export function isValidInvoiceNumber(invoiceNumber: string): boolean {
  return INVOICE_NUMBER_VALID_RE.test(invoiceNumber.trim());
}

export function isRecognizableExtractGroup(
  group: ExtractResultRow[],
): boolean {
  if (!group?.length) return false;

  const head =
    group.find((row) => row.invoice_duplicate) ??
    group.find((row) => (row.fields?.length ?? 0) > 0) ??
    group[0];

  const invoiceNumber = String(head.invoice_number ?? '').trim();
  return isValidInvoiceNumber(invoiceNumber);
}

export function formatExtractSkipReason(
  group: ExtractResultRow[],
  fileName: string,
): string {
  const head = group[0];
  const fillError = String(head?.fill_error ?? '').trim();
  if (fillError) return `${fileName}: ${fillError}`;
  return `${fileName}: 未识别到有效发票号码`;
}
