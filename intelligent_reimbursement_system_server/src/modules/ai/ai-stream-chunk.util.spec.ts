import { buildNonFinalSsePayload } from './ai-stream-chunk.util';

describe('buildNonFinalSsePayload', () => {
  it('maps progress token', () => {
    const token = JSON.stringify({
      type: 'progress',
      progress: { done: 1, total: 3 },
    });
    expect(
      JSON.parse(
        buildNonFinalSsePayload({
          node: 'reimbursement_form_extract',
          token,
        }),
      ),
    ).toEqual({
      done: false,
      type: 'progress',
      node: 'reimbursement_form_extract',
      progress: { done: 1, total: 3 },
    });
  });

  it('maps progress token with stage and message', () => {
    const token = JSON.stringify({
      type: 'progress',
      progress: {
        done: 1,
        total: 3,
        stage: 'extract',
        message: '字段提取中 · 第 2/3 张 · a.pdf',
      },
    });
    expect(
      JSON.parse(
        buildNonFinalSsePayload({
          node: 'reimbursement_form_extract',
          token,
        }),
      ),
    ).toEqual({
      done: false,
      type: 'progress',
      node: 'reimbursement_form_extract',
      progress: {
        done: 1,
        total: 3,
        stage: 'extract',
        message: '字段提取中 · 第 2/3 张 · a.pdf',
      },
    });
  });

  it('maps progress token with file_index', () => {
    const token = JSON.stringify({
      type: 'progress',
      progress: {
        done: 2,
        total: 4,
        stage: 'match',
        message: '类型匹配中 · 第 3/4 张 · a.pdf',
        file_index: 3,
      },
    });
    expect(
      JSON.parse(
        buildNonFinalSsePayload({
          node: 'reimbursement_form_extract',
          token,
        }),
      ),
    ).toEqual({
      done: false,
      type: 'progress',
      node: 'reimbursement_form_extract',
      progress: {
        done: 2,
        total: 4,
        stage: 'match',
        message: '类型匹配中 · 第 3/4 张 · a.pdf',
        file_index: 3,
      },
    });
  });

  it('ignores non-positive file_index', () => {
    const token = JSON.stringify({
      type: 'progress',
      progress: { done: 1, total: 2, file_index: 0 },
    });
    expect(
      JSON.parse(
        buildNonFinalSsePayload({
          node: 'reimbursement_form_extract',
          token,
        }),
      ),
    ).toEqual({
      done: false,
      type: 'progress',
      node: 'reimbursement_form_extract',
      progress: { done: 1, total: 2 },
    });
  });

  it('passes through chat tokens', () => {
    expect(
      JSON.parse(buildNonFinalSsePayload({ node: 'chat', token: '你' })),
    ).toEqual({
      done: false,
      token: '你',
      node: 'chat',
    });
  });
});
