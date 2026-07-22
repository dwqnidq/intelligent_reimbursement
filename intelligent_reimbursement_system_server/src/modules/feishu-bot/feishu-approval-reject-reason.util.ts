/**
 * 从飞书卡片回调 body 提取审批驳回原因（trim；缺失/空白返回空串）。
 */
export function extractApprovalRejectReason(
  body: Record<string, unknown>,
): string {
  const event = (body.event as Record<string, unknown>) ?? body;
  const action = (event.action ?? body.action) as
    | { form_value?: Record<string, unknown> }
    | undefined;
  const raw = action?.form_value?.reject_reason;
  if (typeof raw !== 'string') return '';
  return raw.trim();
}
