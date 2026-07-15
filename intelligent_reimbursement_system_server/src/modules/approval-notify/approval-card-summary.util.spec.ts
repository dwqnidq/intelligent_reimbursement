import {
  resolveApprovalDetailFields,
  toApprovalCardSummary,
} from './approval-card-summary.util';

describe('resolveApprovalDetailFields', () => {
  it('maps detail keys to type field labels in sort order and skips empty', () => {
    const fields = resolveApprovalDetailFields(
      { days: 3, reason: '客户拜访', note: '', unused: 'x' },
      [
        { key: 'reason', label: '出差事由', sort: 1 },
        { key: 'days', label: '天数', sort: 0 },
        { key: 'note', label: '备注', sort: 2 },
      ],
    );
    expect(fields).toEqual([
      { label: '天数', value: '3' },
      { label: '出差事由', value: '客户拜访' },
    ]);
  });

  it('falls back to raw detail keys when type fields missing', () => {
    expect(
      resolveApprovalDetailFields({ 事由: '开会', 空白: '' }, undefined),
    ).toEqual([{ label: '事由', value: '开会' }]);
  });
});

describe('toApprovalCardSummary', () => {
  it('builds summary with resolved type detail fields and attachments', () => {
    const summary = toApprovalCardSummary(
      {
        category_name: '差旅费',
        amount: 100,
        apply_date: '2026-07-15T00:00:00.000Z',
        company_name: '某某科技',
        payment_account: '招行6222',
        detail: { reason: '出差' },
        attachments: [
          { url: 'https://cdn/a.pdf', original_name: 'a.pdf' },
          'legacy-id',
        ],
        applicant: { _id: { toString: () => 'u1' }, real_name: '张三' },
        reject_reason: '不合理',
      },
      [{ key: 'reason', label: '出差事由', sort: 0 }],
    );

    expect(summary.applicantName).toBe('张三');
    expect(summary.applicantId).toBe('u1');
    expect(summary.category).toBe('差旅费');
    expect(summary.applyDate).toBe('2026-07-15');
    expect(summary.companyName).toBe('某某科技');
    expect(summary.paymentAccount).toBe('招行6222');
    expect(summary.detailFields).toEqual([
      { label: '出差事由', value: '出差' },
    ]);
    expect(summary.attachments).toEqual([
      { name: 'a.pdf', url: 'https://cdn/a.pdf' },
    ]);
    expect(summary.reject_reason).toBe('不合理');
  });
});
