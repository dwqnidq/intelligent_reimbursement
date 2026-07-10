export type CompanyOption = { id: string; name: string };

export type ConfirmCardStats = {
  recognizable: number;
  zipCount: number;
  skipCount: number;
};

export type FileChip = { name: string; kind: 'image' | 'pdf' | 'zip' | 'other' };

export type ResultCardItem = {
  file_name: string;
  category_label?: string;
  matched: boolean;
  amount?: number;
  invoice_number?: string;
  invoice_title?: string;
  invoice_date?: string;
  issuer?: string;
  duplicate?: boolean;
};

export type ResultCardMode = 'ready' | 'has_unmatched' | 'has_duplicate';

type CardActionValue = Record<string, string>;

function actionValue(action: string, sessionId: string, extra?: Record<string, string>): CardActionValue {
  return { action, session_id: sessionId, ...extra };
}

function header(title: string, template: string) {
  return {
    title: { tag: 'plain_text', content: title },
    template,
  };
}

function plainText(content: string) {
  return { tag: 'plain_text', content };
}

function markdown(content: string) {
  return { tag: 'markdown', content };
}

function button(text: string, type: 'primary' | 'default' | 'danger', value: CardActionValue) {
  return {
    tag: 'button',
    text: plainText(text),
    type,
    value,
  };
}

function actionRow(buttons: ReturnType<typeof button>[]) {
  return { tag: 'action', actions: buttons };
}

function cardBody(elements: unknown[]) {
  return {
    schema: '2.0',
    config: { wide_screen_mode: true },
    body: { elements },
  };
}

export function buildConfirmCard(
  sessionId: string,
  stats: ConfirmCardStats,
  chips: FileChip[],
) {
  const chipLines = chips
    .map((c) => `- ${c.name} (${c.kind})`)
    .join('\n');

  return {
    msg_type: 'interactive',
    card: {
      ...cardBody([
        markdown(
          `**检测到可报销文件**\n\n可识别：${stats.recognizable} · 压缩包：${stats.zipCount} · 将跳过：${stats.skipCount}\n\n${chipLines}\n\n确认后将解压 zip，并仅对图片与 PDF 进行识别。`,
        ),
        actionRow([
          button('需要报销', 'primary', actionValue('confirm_reimburse', sessionId)),
          button('不需要', 'default', actionValue('cancel_reimburse', sessionId)),
        ]),
      ]),
      header: header('待确认', 'turquoise'),
    },
  };
}

export function buildProgressCard(sessionId: string, done: number, total: number) {
  return {
    msg_type: 'interactive',
    card: {
      ...cardBody([
        markdown(`**正在识别发票**\n\n进度：${done} / ${total}\n\n请稍候，识别完成后会推送结果卡片。`),
      ]),
      header: header('处理中', 'blue'),
    },
  };
}

export function buildNoRecognizableCard(skippedNames: string[]) {
  const skipped = skippedNames.length
    ? `**已跳过：** ${skippedNames.join('、')}`
    : '请发送图片、PDF，或包含它们的 zip 压缩包。';

  return {
    msg_type: 'interactive',
    card: {
      ...cardBody([
        markdown(`**未发现可识别文件**\n\n${skipped}`),
        actionRow([button('我知道了', 'default', { action: 'dismiss' })]),
      ]),
      header: header('未开始识别', 'grey'),
    },
  };
}

export function buildResultCard(
  sessionId: string,
  items: ResultCardItem[],
  skippedNames: string[],
  mode: ResultCardMode,
) {
  const itemBlocks = items.map((item) => {
    const status = item.duplicate
      ? '重复'
      : item.matched
        ? '已匹配'
        : '未匹配';
    const lines = [
      `**${item.category_label ?? '未知类型'}** · ¥${(item.amount ?? 0).toFixed(2)} · ${status}`,
      `文件：${item.file_name}`,
    ];
    if (item.invoice_number) lines.push(`发票号：${item.invoice_number}`);
    if (item.issuer) lines.push(`开票方：${item.issuer}`);
    if (item.invoice_date) lines.push(`日期：${item.invoice_date}`);
    return markdown(lines.join('\n'));
  });

  const skipped =
    skippedNames.length > 0
      ? [markdown(`**未处理文件：** ${skippedNames.join('、')}`)]
      : [];

  const actions =
    mode === 'has_unmatched'
      ? actionRow([
          button('仅提交已匹配', 'primary', actionValue('submit_all_matched', sessionId)),
          button('取消', 'default', actionValue('cancel_submit', sessionId)),
        ])
      : mode === 'has_duplicate'
        ? actionRow([
            button('跳过重复并提交', 'primary', actionValue('submit_skip_duplicates', sessionId)),
            button('取消', 'danger', actionValue('cancel_submit', sessionId)),
          ])
        : actionRow([
            button('确认报销', 'primary', actionValue('submit_all_matched', sessionId)),
            button('取消', 'default', actionValue('cancel_submit', sessionId)),
          ]);

  const matchedCount = items.filter((i) => i.matched && !i.duplicate).length;
  const total = items.reduce((sum, i) => sum + (i.amount ?? 0), 0);

  return {
    msg_type: 'interactive',
    card: {
      ...cardBody([
        markdown(`**识别完成** · 可提交 ${matchedCount} 张 · 合计 ¥${total.toFixed(2)}`),
        ...itemBlocks,
        ...skipped,
        actions,
      ]),
      header: header('识别结果', mode === 'ready' ? 'turquoise' : 'orange'),
    },
  };
}

export function buildProfileCard(
  sessionId: string,
  missing: string[],
  companies: CompanyOption[],
) {
  const elements: unknown[] = [
    markdown(`**资料待完善**\n\n缺少：${missing.join('、')}`),
    {
      tag: 'select_static',
      name: 'company_id',
      placeholder: plainText('请选择公司'),
      options: companies.map((c) => ({
        text: plainText(c.name),
        value: c.id,
      })),
    },
    {
      tag: 'input',
      name: 'payment_account',
      placeholder: plainText('请输入收款账户'),
    },
    actionRow([
      button('保存并继续', 'primary', actionValue('save_profile', sessionId)),
      button('稍后处理', 'default', actionValue('cancel_submit', sessionId)),
    ]),
  ];

  return {
    msg_type: 'interactive',
    card: {
      ...cardBody(elements),
      header: header('资料待完善', 'grey'),
    },
  };
}

export function buildSuccessCard(count: number, totalAmount: number, listUrl: string) {
  return {
    msg_type: 'interactive',
    card: {
      ...cardBody([
        markdown(
          `**报销申请已创建**\n\n${count} 笔 · 合计 ¥${totalAmount.toFixed(2)} · 已进入审批流程`,
        ),
        actionRow([
          button('查看报销单', 'primary', { action: 'open_list', url: listUrl }),
          button('完成', 'default', { action: 'dismiss' }),
        ]),
      ]),
      header: header('已提交', 'green'),
    },
  };
}
