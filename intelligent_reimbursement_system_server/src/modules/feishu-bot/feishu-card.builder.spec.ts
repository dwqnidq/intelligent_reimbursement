import {
  buildConfirmCard,
  buildProfileCard,
  buildResultCard,
} from './feishu-card.builder';

describe('feishu-card.builder', () => {
  it('buildConfirmCard includes confirm action and session id', () => {
    const card = buildConfirmCard('sess-1', { recognizable: 2, zipCount: 1, skipCount: 1 }, [
      { name: 'a.pdf', kind: 'pdf' },
    ]);
    const body = JSON.stringify(card);
    expect(body).toContain('confirm_reimburse');
    expect(body).toContain('sess-1');
    expect(body).toContain('需要报销');
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
});
