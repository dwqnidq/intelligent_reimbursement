import { canAccessReimbursementDetail } from './reimbursement-access.util';

describe('canAccessReimbursementDetail', () => {
  it('allows applicant', () => {
    expect(
      canAccessReimbursementDetail({
        userId: 'u1',
        canViewAll: false,
        applicantId: 'u1',
        viewerEmployeeId: null,
        approverEmployeeIds: [],
      }),
    ).toBe(true);
  });

  it('allows canViewAll', () => {
    expect(
      canAccessReimbursementDetail({
        userId: 'u2',
        canViewAll: true,
        applicantId: 'u1',
        viewerEmployeeId: null,
        approverEmployeeIds: [],
      }),
    ).toBe(true);
  });

  it('allows viewer who is an approver on the flow', () => {
    expect(
      canAccessReimbursementDetail({
        userId: 'u2',
        canViewAll: false,
        applicantId: 'u1',
        viewerEmployeeId: 'emp-9',
        approverEmployeeIds: ['emp-1', 'emp-9'],
      }),
    ).toBe(true);
  });

  it('denies unrelated user', () => {
    expect(
      canAccessReimbursementDetail({
        userId: 'u2',
        canViewAll: false,
        applicantId: 'u1',
        viewerEmployeeId: 'emp-2',
        approverEmployeeIds: ['emp-1'],
      }),
    ).toBe(false);
  });
});
