export type CardActionToast = {
  type: 'info' | 'success' | 'error' | 'warning';
  content: string;
  i18n: { zh_cn: string; en_us: string };
};

export type ParsedCardAction = {
  actionName?: string;
  sessionId?: string;
  openId?: string;
  approvalRecordId?: string;
};

export function parseCardActionBody(
  body: Record<string, unknown>,
): ParsedCardAction {
  const event = (body.event as Record<string, unknown>) ?? body;
  const openId =
    (event.open_id as string) ??
    (event.operator as { open_id?: string })?.open_id ??
    (body.open_id as string) ??
    (body.operator as { open_id?: string })?.open_id;
  const action = (event.action ?? body.action) as {
    value?: Record<string, string>;
  };
  const value = action?.value ?? {};
  return {
    actionName: value.action,
    sessionId: value.session_id,
    approvalRecordId: value.approval_record_id,
    openId,
  };
}

export function buildCardActionToast(
  actionName?: string,
  options?: { rejected?: boolean; syncPending?: boolean },
): CardActionToast {
  if (
    options?.syncPending &&
    (actionName === 'upload_complete' || actionName === 'confirm_reimburse')
  ) {
    return {
      type: 'warning',
      content: '清单同步中，请稍候',
      i18n: { zh_cn: '清单同步中，请稍候', en_us: 'Syncing file list…' },
    };
  }

  if (
    options?.rejected &&
    (actionName === 'upload_complete' || actionName === 'confirm_reimburse')
  ) {
    return {
      type: 'warning',
      content: '本次已取消',
      i18n: { zh_cn: '本次已取消', en_us: 'Cancelled' },
    };
  }

  switch (actionName) {
    case 'cancel_reimburse':
    case 'cancel_submit':
      return {
        type: 'info',
        content: '已取消',
        i18n: { zh_cn: '已取消', en_us: 'Cancelled' },
      };
    case 'confirm_reimburse':
    case 'upload_complete':
      return {
        type: 'info',
        content: '开始识别…',
        i18n: { zh_cn: '开始识别…', en_us: 'Recognizing…' },
      };
    case 'save_profile':
      return {
        type: 'success',
        content: '资料已保存',
        i18n: { zh_cn: '资料已保存', en_us: 'Profile saved' },
      };
    case 'submit_all_matched':
    case 'submit_skip_duplicates':
    case 'submit_with_selection':
      return {
        type: 'info',
        content: '提交中…',
        i18n: { zh_cn: '提交中…', en_us: 'Submitting…' },
      };
    case 'dismiss':
      return {
        type: 'info',
        content: '好的',
        i18n: { zh_cn: '好的', en_us: 'OK' },
      };
    default:
      return {
        type: 'info',
        content: '处理中…',
        i18n: { zh_cn: '处理中…', en_us: 'Processing…' },
      };
  }
}

/** 飞书 card.action.trigger 回调中更新卡片须使用 raw 包装 */
export function wrapCallbackCard(card: unknown) {
  return {
    type: 'raw' as const,
    data: card,
  };
}

export function buildCardActionResponse(
  actionName?: string,
  card?: unknown,
  options?: { rejected?: boolean; syncPending?: boolean },
) {
  return {
    toast: buildCardActionToast(actionName, options),
    ...(card ? { card: wrapCallbackCard(card) } : {}),
  };
}
