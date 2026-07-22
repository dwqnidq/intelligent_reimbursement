import { extractApprovalRejectReason } from './feishu-approval-reject-reason.util';

describe('extractApprovalRejectReason', () => {
  it('returns trimmed reason from event.action.form_value', () => {
    expect(
      extractApprovalRejectReason({
        event: {
          action: { form_value: { reject_reason: '  材料不全  ' } },
        },
      }),
    ).toBe('材料不全');
  });

  it('returns empty string when missing or blank', () => {
    expect(extractApprovalRejectReason({})).toBe('');
    expect(
      extractApprovalRejectReason({
        action: { form_value: { reject_reason: '   ' } },
      }),
    ).toBe('');
  });

  it('reads top-level action.form_value (HTTP card callback shape)', () => {
    expect(
      extractApprovalRejectReason({
        action: { form_value: { reject_reason: '金额超标' } },
      }),
    ).toBe('金额超标');
  });
});
