import { buildApprovalSkippedCard } from '../feishu-bot/feishu-card.builder';

describe('withdrawn approval card', () => {
  it('renders withdrawn disabled copy', () => {
    const card = buildApprovalSkippedCard({
      resolve: { kind: 'withdrawn' },
      applicantName: '张三',
      category: '差旅',
      amount: 100,
      applyDate: '2026-07-01',
    });
    const raw = JSON.stringify(card);
    expect(raw).toContain('已撤回');
    expect(raw).toContain('需重新审批');
  });
});
