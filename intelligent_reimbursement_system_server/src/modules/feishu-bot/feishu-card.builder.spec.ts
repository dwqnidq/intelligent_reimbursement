import {
  buildApprovalPendingCard,
  buildApprovalSkippedCard,
  buildConfirmCard,
  buildProfileCard,
  buildResultCard,
} from './feishu-card.builder';

describe('feishu-card.builder', () => {
  it('buildConfirmCard includes upload_complete action and session id', () => {
    const card = buildConfirmCard('sess-1', { recognizable: 2, zipCount: 1, folderCount: 0, skipCount: 1 }, [
      { name: 'a.pdf', kind: 'pdf' },
    ]);
    const body = JSON.stringify(card);
    expect(body).toContain('upload_complete');
    expect(body).toContain('sess-1');
    expect(body).toContain('已全部上传，开始识别');
    expect(body).toContain('文件上传确认');
    expect(body).toContain('"width_mode":"compact"');
    expect(body).toContain('text_tag_list');
    expect(body).toContain('primary_filled');
    expect(body).toContain('background_style');
    expect(body).not.toContain('"tag":"note"');
  });

  it('buildConfirmCard cancelled state disables buttons', () => {
    const card = buildConfirmCard(
      'sess-cancel',
      { recognizable: 4, zipCount: 0, folderCount: 0, skipCount: 0 },
      [{ name: 'a.pdf', kind: 'pdf' }],
      { cancelled: true },
    );
    const body = JSON.stringify(card);
    expect(body).toContain('"disabled":true');
    expect(body).toContain('已取消');
    expect(body).not.toContain('upload_complete');
  });

  it('buildProfileCard includes company options', () => {
    const card = buildProfileCard('sess-2', ['收款账户', '报销公司'], [
      { id: 'c1', name: '某某科技' },
      { id: 'c2', name: '某某贸易' },
    ]);
    const body = JSON.stringify(card);
    expect(body).toContain('select_static');
    expect(body).toContain('某某科技');
    expect(body).toContain('payment_account');
    expect(body).toContain('save_profile');
    expect(body).toContain('"tag":"form"');
    expect(body).toContain('form_action_type');
    expect(body).toContain('btn_save_profile');
  });

  it('buildResultCard cancelled state disables both action buttons', () => {
    const card = buildResultCard(
      'sess-locked',
      [
        {
          file_name: 'a.pdf',
          category_label: '差旅',
          matched: true,
          amount: 10,
          duplicate: true,
        },
      ],
      [],
      'has_duplicate',
      { cancelled: true },
    );
    const body = JSON.stringify(card);
    expect(body).toContain('"disabled":true');
    expect(body).not.toContain('submit_skip_duplicates');
    expect(body).not.toContain('cancel_submit');
  });

  it('buildResultCard locked state disables submit but keeps cancel', () => {
    const card = buildResultCard(
      'sess-locked',
      [
        {
          file_name: 'a.pdf',
          category_label: '差旅',
          matched: true,
          amount: 10,
          duplicate: true,
        },
      ],
      [],
      'has_duplicate',
      { locked: true, lockedReason: '正在识别补传文件…' },
    );
    const body = JSON.stringify(card);
    expect(body).toContain('正在识别补传文件');
    expect(body).not.toContain('submit_skip_duplicates');
    expect(body).toContain('cancel_submit');
  });

  it('buildResultCard cancelled state disables submit buttons', () => {
    const card = buildResultCard(
      'sess-result',
      [
        {
          file_name: 'a.pdf',
          category_label: '差旅',
          matched: true,
          amount: 10,
        },
      ],
      [],
      'ready',
      { cancelled: true },
    );
    const body = JSON.stringify(card);
    expect(body).toContain('"disabled":true');
    expect(body).toContain('已取消');
    expect(body).not.toContain('submit_all_matched');
  });

  it('buildConfirmCard processing state disables both buttons', () => {
    const card = buildConfirmCard(
      'sess-processing',
      { recognizable: 1, zipCount: 0, folderCount: 0, skipCount: 0 },
      [{ name: 'a.pdf', kind: 'pdf' }],
      { processing: true },
    );
    const body = JSON.stringify(card);
    expect(body).toContain('"disabled":true');
    expect(body).toContain('识别进行中');
    expect(body).not.toContain('upload_complete');
    expect(body).not.toContain('cancel_reimburse');
  });

  it('buildConfirmCard keeps upload enabled while syncing', () => {
    const card = buildConfirmCard(
      'sess-sync',
      { recognizable: 2, zipCount: 0, folderCount: 0, skipCount: 0 },
      [{ name: 'a.pdf', kind: 'pdf' }],
    );
    const body = JSON.stringify(card);
    expect(body).toContain('upload_complete');
    expect(body).toContain('cancel_reimburse');
    expect(body).not.toContain('"disabled":true');
  });

  it('buildProfileCard saved state disables form buttons', () => {
    const card = buildProfileCard('sess-saved', ['收款账户'], [], {
      saved: true,
    });
    const body = JSON.stringify(card);
    expect(body).toContain('"disabled":true');
    expect(body).toContain('已保存');
    expect(body).not.toContain('save_profile');
  });

  it('buildResultCard lists skipped file names', () => {
    const card = buildResultCard(
      'sess-3',
      [
        {
          file_name: 'a.pdf',
          category_label: '差旅交通',
          matched: true,
          amount: 100,
          invoice_number: '123',
        },
      ],
      ['note.docx'],
      'ready',
    );
    const body = JSON.stringify(card);
    expect(body).toContain('note.docx');
    expect(body).toContain('submit_all_matched');
  });

  it('shows 重复发票 instead of 未识别到报销类型 for unmatched duplicates', () => {
    const card = buildResultCard(
      'sess-unmatched',
      [
        {
          file_name: 'a.pdf',
          category_label: '未识别到报销类型',
          matched: false,
          duplicate: true,
          amount: 100,
          invoice_number: '123',
        },
      ],
      [],
      'has_duplicate',
    );
    const body = JSON.stringify(card);
    expect(body).toContain('重复发票');
    expect(body).not.toContain('未识别到报销类型');
    expect(body).not.toContain('建议：未识别到报销类型');
    expect(body).toContain('¥100.00');
  });

  it('does not prefix 建议 for unrecognized type label in unmatched section', () => {
    const card = buildResultCard(
      'sess-unmatched-type',
      [
        {
          file_name: 'a.pdf',
          category_label: '未识别到报销类型',
          matched: false,
          amount: 100,
          invoice_number: '123',
        },
      ],
      [{ id: 't1', label: '差旅费' }],
      'has_unmatched',
    );
    const body = JSON.stringify(card);
    expect(body).toContain('未识别到报销类型');
    expect(body).not.toContain('建议：未识别到报销类型');
    expect(body).toContain('¥100.00');
  });

  it('prefixes 建议 for ai suggested unmatched type', () => {
    const card = buildResultCard(
      'sess-suggest',
      [
        {
          file_name: 'a.pdf',
          category_label: '差旅费',
          matched: false,
          amount: 50,
        },
      ],
      [],
      'has_unmatched',
    );
    expect(JSON.stringify(card)).toContain('建议：差旅费');
  });

  it('shows 金额未识别 when amount is zero', () => {
    const card = buildResultCard(
      'sess-zero',
      [
        {
          file_name: 'a.pdf',
          category_label: '未识别到报销类型',
          matched: false,
          duplicate: true,
          amount: 0,
        },
      ],
      [],
      'has_duplicate',
    );
    expect(JSON.stringify(card)).toContain('金额未识别');
  });

  it('groups duplicate invoice numbers into one card block', () => {
    const card = buildResultCard(
      'sess-group',
      [
        {
          file_name: '12.2.jpeg',
          category_label: '未识别到报销类型',
          matched: false,
          duplicate: true,
          amount: 88,
          invoice_number: '123',
        },
        {
          file_name: '12.2.pdf',
          category_label: '未识别到报销类型',
          matched: false,
          duplicate: true,
          amount: 88,
          invoice_number: '123',
        },
        {
          file_name: 'travel.pdf',
          category_label: '差旅费',
          matched: true,
          duplicate: false,
          amount: 120,
          invoice_number: '456',
        },
        {
          file_name: 'food.pdf',
          category_label: '餐费',
          matched: false,
          duplicate: false,
          amount: 30,
          invoice_number: '789',
        },
      ],
      [],
      'has_duplicate',
      { typeOptions: [{ id: 't1', label: '餐费' }] },
    );
    const body = JSON.stringify(card);
    expect(body).toContain('🔴 重复发票');
    expect(body).toContain('🟢 已匹配');
    expect(body).toContain('🟠 未匹配');
    expect(body).toContain('共 2 张 · 与已提交记录或本次其他文件重复');
    expect(body).toContain('重复发票');
    expect(body).toContain('文件（2）');
    expect(body).toContain('12.2.jpeg');
    expect(body).toContain('12.2.pdf');
    expect(body).toContain('travel.pdf');
    expect(body).toContain('food.pdf');
    expect(body).toContain('type_3');
    // 重复区不沿用未匹配语义文案
    const duplicateSection = body.slice(
      body.indexOf('重复发票'),
      body.indexOf('已匹配'),
    );
    expect(duplicateSection).not.toContain('未识别到报销类型');
  });

  const approvalSummary = {
    applicantName: '张三',
    category: '差旅费',
    amount: 1280.5,
    applyDate: '2026-07-15',
    companyName: '某某科技',
    paymentAccount: '招行6222',
    detailFields: [
      { label: '出差事由', value: '客户拜访' },
      { label: '天数', value: '3' },
    ],
    attachments: [
      { name: '机票.pdf', url: 'https://cdn.example.com/ticket.pdf' },
      { name: '酒店发票.jpg', url: 'https://cdn.example.com/hotel.jpg' },
    ],
  };

  it('buildApprovalPendingCard shows type detail fields and attachment links', () => {
    const card = buildApprovalPendingCard({
      approvalRecordId: 'ar-1',
      ...approvalSummary,
    });
    const body = JSON.stringify(card);
    expect(body).toContain('张三');
    expect(body).toContain('差旅费');
    expect(body).toContain('1280.50');
    expect(body).toContain('2026-07-15');
    expect(body).toContain('某某科技');
    expect(body).toContain('招行6222');
    expect(body).toContain('出差事由');
    expect(body).toContain('客户拜访');
    expect(body).toContain('天数');
    expect(body).toContain('3');
    expect(body).toContain('[机票.pdf](https://cdn.example.com/ticket.pdf)');
    expect(body).toContain(
      '[酒店发票.jpg](https://cdn.example.com/hotel.jpg)',
    );
    expect(body).toContain('approval_approve');
    expect(body).toContain('approval_reject');
    expect(body).toContain('ar-1');
    expect(body).toContain('"name":"reject_reason"');
    expect(body).toContain('"required":true');
    expect(body).toContain('"form_action_type":"submit"');
    expect(body).toContain('"name":"approval_form"');
    // 通过按钮不走表单 submit
    const approveIdx = body.indexOf('"action":"approval_approve"');
    const rejectIdx = body.indexOf('"action":"approval_reject"');
    expect(approveIdx).toBeGreaterThan(-1);
    expect(rejectIdx).toBeGreaterThan(-1);
    const approveSlice = body.slice(Math.max(0, approveIdx - 200), approveIdx + 80);
    expect(approveSlice).not.toContain('form_action_type');
  });

  it('buildApprovalSkippedCard approved keeps summary and disables buttons', () => {
    const card = buildApprovalSkippedCard({
      resolve: { kind: 'approved', byName: '李四' },
      ...approvalSummary,
    });
    const body = JSON.stringify(card);
    expect(body).toContain('审批已结束');
    expect(body).toContain('李四');
    expect(body).toContain('张三');
    expect(body).toContain('[机票.pdf](https://cdn.example.com/ticket.pdf)');
    expect(body).toContain('"disabled":true');
    expect(body).not.toContain('approval_approve');
  });

  it('buildApprovalSkippedCard self_done uses personal copy', () => {
    const card = buildApprovalSkippedCard({
      resolve: { kind: 'self_done', byName: '李四' },
      ...approvalSummary,
    });
    const body = JSON.stringify(card);
    expect(body).toContain('你已审批');
    expect(body).toContain('"disabled":true');
  });

  it('buildApprovalSkippedCard rejected shows reject state', () => {
    const card = buildApprovalSkippedCard({
      resolve: { kind: 'rejected', byName: '李四' },
      ...approvalSummary,
    });
    const body = JSON.stringify(card);
    expect(body).toContain('已驳回');
    expect(body).toContain('李四');
    expect(body).toContain('"disabled":true');
  });

  it('does not duplicate 金额 when detail already contains it', () => {
    const card = buildApprovalPendingCard({
      approvalRecordId: 'ar-2',
      ...approvalSummary,
      detailFields: [
        { label: '金额', value: '100' },
        { label: '出差事由', value: '客户拜访' },
      ],
    });
    const body = JSON.stringify(card);
    const amountLabelCount = body.split('**金额**：').length - 1;
    expect(amountLabelCount).toBe(1);
    expect(body).toContain('**金额**：100');
    expect(body).not.toContain('1280.50');
  });
});
