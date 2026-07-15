import { enrichRecognizedAmounts } from './feishu-recognized-enrich.util';

describe('enrichRecognizedAmounts', () => {
  it('inherits amount for duplicate invoice number from first item', () => {
    const result = enrichRecognizedAmounts([
      {
        invoice_number: '123',
        amount: 88.5,
        file_name: 'a.pdf',
      },
      {
        invoice_number: '123',
        amount: 0,
        file_name: 'a.jpeg',
      },
    ]);

    expect(result[1].amount).toBe(88.5);
  });

  it('does not overwrite positive amount on source item', () => {
    const result = enrichRecognizedAmounts([
      { invoice_number: '123', amount: 10 },
      { invoice_number: '456', amount: 20 },
    ]);

    expect(result).toEqual([
      { invoice_number: '123', amount: 10 },
      { invoice_number: '456', amount: 20 },
    ]);
  });
});
