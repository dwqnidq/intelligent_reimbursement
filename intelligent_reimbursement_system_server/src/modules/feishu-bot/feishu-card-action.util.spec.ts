import {
  buildCardActionResponse,
  parseCardActionBody,
} from './feishu-card-action.util';

describe('feishu-card-action.util', () => {
  it('parses cancel action from card callback body', () => {
    const parsed = parseCardActionBody({
      event: {
        operator: { open_id: 'ou_test' },
        action: {
          value: { action: 'cancel_reimburse', session_id: 'sess-1' },
        },
      },
    });
    expect(parsed.actionName).toBe('cancel_reimburse');
    expect(parsed.sessionId).toBe('sess-1');
    expect(parsed.openId).toBe('ou_test');
  });

  it('builds cancel toast', () => {
    const res = buildCardActionResponse('cancel_reimburse');
    expect(res.toast.i18n.zh_cn).toBe('已取消');
  });

  it('builds rejected recognition toast', () => {
    const res = buildCardActionResponse('upload_complete', undefined, {
      rejected: true,
    });
    expect(res.toast.i18n.zh_cn).toBe('本次已取消');
  });

  it('builds sync pending toast', () => {
    const res = buildCardActionResponse('upload_complete', undefined, {
      syncPending: true,
    });
    expect(res.toast.i18n.zh_cn).toBe('清单同步中，请稍候');
  });

  it('wraps card payload for feishu callback raw format', () => {
    const card = { schema: '2.0', body: { elements: [] } };
    const res = buildCardActionResponse('confirm_reimburse', card);
    expect(res.card).toEqual({ type: 'raw', data: card });
  });
});
