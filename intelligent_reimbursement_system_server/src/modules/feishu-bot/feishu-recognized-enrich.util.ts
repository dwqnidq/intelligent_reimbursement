export type RecognizedAmountItem = {
  invoice_number?: string;
  amount?: number;
};

/** 重复发票条目继承同发票号首条已识别金额 */
export function enrichRecognizedAmounts<T extends RecognizedAmountItem>(
  items: T[],
): T[] {
  const amountByInvoice = new Map<string, number>();
  for (const item of items) {
    const invoiceNumber = String(item.invoice_number ?? '').trim();
    if (!invoiceNumber) continue;
    const amount = item.amount ?? 0;
    if (amount > 0 && !amountByInvoice.has(invoiceNumber)) {
      amountByInvoice.set(invoiceNumber, amount);
    }
  }

  return items.map((item) => {
    const invoiceNumber = String(item.invoice_number ?? '').trim();
    if (!invoiceNumber || (item.amount ?? 0) > 0) return item;
    const inherited = amountByInvoice.get(invoiceNumber);
    if (inherited == null) return item;
    return { ...item, amount: inherited };
  });
}
