import type { ResultCardDisplayGroup } from './feishu-result-group.util';
import {
  groupIndexedResultCardItemsByInvoice,
  partitionResultCardItems,
} from './feishu-result-group.util';

export type CompanyOption = { id: string; name: string };

export type ConfirmCardStats = {
  recognizable: number;
  zipCount: number;
  folderCount: number;
  skipCount: number;
};

export type FileChip = {
  name: string;
  kind: 'image' | 'pdf' | 'zip' | 'folder' | 'other';
};

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
  /** 可点击预览的附件 URL（七牛等） */
  attachment_url?: string;
};

export type SystemTypeOption = { id: string; label: string };

export type ResultCardMode =
  | 'ready'
  | 'has_unmatched'
  | 'all_unmatched'
  | 'has_duplicate';

type CardActionValue = Record<string, string>;

type StatusTag = { text: string; color: string };

function actionValue(
  action: string,
  sessionId: string,
  extra?: Record<string, string>,
): CardActionValue {
  return { action, session_id: sessionId, ...extra };
}

function plainText(content: string) {
  return { tag: 'plain_text', content };
}

function markdown(
  content: string,
  options?: {
    align?: 'left' | 'center' | 'right';
    size?: string;
  },
) {
  return {
    tag: 'markdown',
    content,
    text_align: options?.align ?? 'left',
    text_size: options?.size ?? 'normal',
  };
}

function divText(
  content: string,
  options?: {
    align?: 'left' | 'center' | 'right';
    size?: string;
    color?: string;
  },
) {
  return {
    tag: 'div',
    text: {
      tag: 'plain_text',
      content,
      text_align: options?.align ?? 'left',
      text_size: options?.size ?? 'normal',
      text_color: options?.color ?? 'default',
    },
  };
}

function header(
  title: string,
  template: string,
  subtitle?: string,
  statusTag?: StatusTag,
) {
  return {
    title: plainText(title),
    ...(subtitle ? { subtitle: plainText(subtitle) } : {}),
    ...(statusTag
      ? {
          text_tag_list: [
            {
              tag: 'text_tag',
              text: plainText(statusTag.text),
              color: statusTag.color,
            },
          ],
        }
      : {}),
    template,
    padding: '12px',
  };
}

function hr() {
  return { tag: 'hr' };
}

function button(
  text: string,
  type: 'primary' | 'default' | 'danger',
  value: CardActionValue,
  options?: {
    name?: string;
    formActionType?: 'submit' | 'reset';
    disabled?: boolean;
    disabledTips?: string;
  },
) {
  const typeMap = {
    primary: 'primary_filled',
    default: 'default',
    danger: 'danger_filled',
  } as const;
  return {
    tag: 'button',
    text: plainText(text),
    type: typeMap[type],
    size: 'medium',
    ...(options?.name ? { name: options.name } : {}),
    ...(options?.formActionType
      ? { form_action_type: options.formActionType }
      : {}),
    ...(options?.disabled ? { disabled: true } : {}),
    ...(options?.disabledTips
      ? { disabled_tips: plainText(options.disabledTips) }
      : {}),
    ...(!options?.disabled
      ? { behaviors: [{ type: 'callback', value }] }
      : {}),
  };
}

function disabledButton(text: string, tips: string) {
  return {
    tag: 'button',
    text: plainText(text),
    type: 'default',
    size: 'medium',
    disabled: true,
    disabled_tips: plainText(tips),
  };
}

function linkButton(text: string, url: string) {
  return {
    tag: 'button',
    text: plainText(text),
    type: 'primary_filled',
    size: 'medium',
    behaviors: [
      {
        type: 'open_url',
        default_url: url,
        pc_url: url,
        ios_url: url,
        android_url: url,
      },
    ],
  };
}

function buttonRow(buttons: Array<Record<string, unknown>>) {
  if (buttons.length === 1) {
    return {
      tag: 'column_set',
      flex_mode: 'flow',
      horizontal_align: 'right',
      columns: [
        {
          tag: 'column',
          width: 'auto',
          elements: buttons,
        },
      ],
    };
  }
  return {
    tag: 'column_set',
    flex_mode: 'bisect',
    horizontal_spacing: 'medium',
    columns: buttons.map((btn) => ({
      tag: 'column',
      width: 'weighted',
      weight: 1,
      elements: [btn],
    })),
  };
}

function statCell(value: number, label: string) {
  return {
    tag: 'column',
    width: 'weighted',
    weight: 1,
    background_style: 'grey',
    padding: '10px 8px',
    vertical_align: 'center',
    elements: [
      divText(String(value), { align: 'center', size: 'heading' }),
      divText(label, { align: 'center', size: 'notation', color: 'grey' }),
    ],
  };
}

function statRow(stats: Array<{ label: string; value: number }>) {
  return {
    tag: 'column_set',
    flex_mode: 'trisect',
    horizontal_spacing: 'medium',
    columns: stats.map((stat) => statCell(stat.value, stat.label)),
  };
}

function chipKindTag(kind: FileChip['kind']) {
  if (kind === 'image' || kind === 'pdf') {
    return "<text_tag color='turquoise'>可识别</text_tag>";
  }
  if (kind === 'zip') {
    return "<text_tag color='blue'>压缩包</text_tag>";
  }
  if (kind === 'folder') {
    return "<text_tag color='blue'>文件夹</text_tag>";
  }
  return "<text_tag color='neutral'>将跳过</text_tag>";
}

function formatFileChips(chips: FileChip[]) {
  if (chips.length === 0) return '暂无文件';
  return chips
    .map((chip) => `📄 ${chip.name} ${chipKindTag(chip.kind)}`)
    .join('\n');
}

function statusTag(item: ResultCardItem) {
  if (item.duplicate) return "<text_tag color='red'>重复</text_tag>";
  if (item.matched) return "<text_tag color='green'>已匹配</text_tag>";
  return "<text_tag color='orange'>未匹配</text_tag>";
}

function formatResultItemLabel(item: ResultCardItem) {
  if (item.matched) return item.category_label ?? '未知类型';
  const label = String(item.category_label ?? '').trim();
  if (
    !label ||
    label === '未知类型' ||
    label === '未识别到报销类型'
  ) {
    return '未识别到报销类型';
  }
  return `建议：${label}`;
}

/** 重复项标题：不展示「未识别到报销类型」（那是未匹配区的语义） */
function formatDuplicateItemLabel(item: ResultCardItem) {
  if (item.matched) return item.category_label ?? '重复发票';
  const label = String(item.category_label ?? '').trim();
  if (
    label &&
    label !== '未知类型' &&
    label !== '未识别到报销类型'
  ) {
    return `建议：${label}`;
  }
  return '重复发票';
}

function formatAmountDisplay(item: ResultCardItem): string {
  const amount = item.amount ?? 0;
  if (amount > 0) return `¥${amount.toFixed(2)}`;
  return "<font color='grey'>金额未识别</font>";
}

function groupStatusTag(group: ResultCardDisplayGroup): string {
  const fileCount = group.items.length;
  if (fileCount > 1) {
    return `<text_tag color='red'>重复 · ${fileCount} 个文件</text_tag>`;
  }
  return statusTag({ ...group.representative, duplicate: true });
}

function appendInvoiceMetaLines(lines: string[], item: ResultCardItem) {
  if (item.invoice_number) {
    lines.push(`<font color='grey'>发票号</font>　${item.invoice_number}`);
  }
  if (item.issuer) {
    lines.push(`<font color='grey'>开票方</font>　${item.issuer}`);
  }
  if (item.invoice_date) {
    lines.push(`<font color='grey'>日期</font>　${item.invoice_date}`);
  }
}

function formatFileLink(fileName: string, url?: string): string {
  const name = String(fileName ?? '').trim() || '附件';
  const href = String(url ?? '').trim();
  if (href) return `[${name}](${href})`;
  return name;
}

function appendFileLines(
  lines: string[],
  files: { name: string; url?: string }[],
) {
  if (files.length === 1) {
    lines.push(
      `<font color='grey'>文件</font>　${formatFileLink(files[0].name, files[0].url)}`,
    );
    return;
  }
  lines.push(
    `<font color='grey'>文件（${files.length}）</font>`,
    files
      .map((f) => `· ${formatFileLink(f.name, f.url)}`)
      .join('\n'),
  );
}

function formatDuplicateGroup(group: ResultCardDisplayGroup) {
  const item = group.representative;
  const files = group.items.map((entry) => ({
    name: entry.file_name,
    url: entry.attachment_url,
  }));
  const lines = [
    `**${formatDuplicateItemLabel(item)}**　${formatAmountDisplay(item)}　${groupStatusTag(group)}`,
  ];
  appendInvoiceMetaLines(lines, item);
  appendFileLines(lines, files);
  return markdown(lines.join('\n'));
}

function formatMatchedItem(item: ResultCardItem) {
  const lines = [
    `**${formatResultItemLabel(item)}**　${formatAmountDisplay(item)}　${statusTag(item)}`,
  ];
  appendInvoiceMetaLines(lines, item);
  appendFileLines(lines, [
    { name: item.file_name, url: item.attachment_url },
  ]);
  return markdown(lines.join('\n'));
}

function formatUnmatchedItem(item: ResultCardItem) {
  const lines = [
    `**${formatResultItemLabel(item)}**　${formatAmountDisplay(item)}　${statusTag(item)}`,
  ];
  appendInvoiceMetaLines(lines, item);
  appendFileLines(lines, [
    { name: item.file_name, url: item.attachment_url },
  ]);
  lines.push(`<font color='grey'>原因</font>　系统中无对应报销类型`);
  return markdown(lines.join('\n'));
}

function appendResultSection(
  blocks: unknown[],
  title: string,
  subtitle: string,
  entries: unknown[],
) {
  if (entries.length === 0) return;
  if (blocks.length > 0) blocks.push(hr());
  blocks.push(
    markdown(
      `**${title}**\n<font color='grey'>${subtitle}</font>`,
      { size: 'normal' },
    ),
  );
  entries.forEach((entry, index) => {
    blocks.push(entry);
    if (index < entries.length - 1) blocks.push(hr());
  });
}

function buildPartitionedResultBlocks(
  items: ResultCardItem[],
  typeOptions: SystemTypeOption[],
): { itemBlocks: unknown[]; formSelects: unknown[] } {
  const { duplicate, matched, unmatched } = partitionResultCardItems(items);
  const duplicateGroups = groupIndexedResultCardItemsByInvoice(duplicate);
  const itemBlocks: unknown[] = [];

  appendResultSection(
    itemBlocks,
    '🔴 重复发票',
    duplicate.length > 0
      ? `共 ${duplicate.length} 张 · 与已提交记录或本次其他文件重复，提交时将自动跳过`
      : '',
    duplicateGroups.map((group) => formatDuplicateGroup(group)),
  );

  appendResultSection(
    itemBlocks,
    '🟢 已匹配',
    matched.length > 0
      ? `共 ${matched.length} 张 · 已匹配系统报销类型，可直接提交`
      : '',
    matched.map(({ item }) => formatMatchedItem(item)),
  );

  const unmatchedBlocks: unknown[] = [];
  unmatched.forEach(({ index, item }) => {
    unmatchedBlocks.push(formatUnmatchedItem(item));
    if (typeOptions.length > 0) {
      unmatchedBlocks.push(typeSelectForItem(index, typeOptions));
    }
  });
  appendResultSection(
    itemBlocks,
    '🟠 未匹配',
    unmatched.length > 0
      ? `共 ${unmatched.length} 张 · 系统中无对应报销类型，请手动选择后再提交`
      : '',
    unmatchedBlocks,
  );

  return { itemBlocks, formSelects: [] };
}

function typeSelectForItem(
  index: number,
  typeOptions: SystemTypeOption[],
) {
  return {
    tag: 'column_set',
    horizontal_spacing: 'medium',
    columns: [
      {
        tag: 'column',
        width: 'weighted',
        weight: 1,
        elements: [markdown('**请选择报销类型**', { size: 'normal' })],
      },
      {
        tag: 'column',
        width: 'weighted',
        weight: 3,
        elements: [
          {
            tag: 'select_static',
            name: `type_${index}`,
            required: true,
            width: 'fill',
            placeholder: plainText('未识别到报销类型，请手动选择'),
            options: typeOptions.map((t) => ({
              text: plainText(t.label),
              value: t.id,
            })),
          },
        ],
      },
    ],
  };
}

function buildCard(headerConfig: ReturnType<typeof header>, elements: unknown[]) {
  return {
    schema: '2.0',
    config: {
      update_multi: true,
      width_mode: 'compact',
    },
    header: headerConfig,
    body: {
      padding: '12px',
      vertical_spacing: 'large',
      horizontal_spacing: 'medium',
      elements,
    },
  };
}

export function buildConfirmCard(
  sessionId: string,
  stats: ConfirmCardStats,
  chips: FileChip[],
  options?: {
    cancelled?: boolean;
    processing?: boolean;
  },
) {
  const cancelled = options?.cancelled ?? false;
  const processing = options?.processing ?? false;
  const uploadLocked = cancelled || processing;

  const cardContent = buildCard(
    cancelled
      ? header(
          '文件上传确认',
          'grey',
          '本次报销已取消',
          { text: '已取消', color: 'neutral' },
        )
      : processing
        ? header(
            '文件上传确认',
            'blue',
            '正在准备识别…',
            { text: '识别中', color: 'blue' },
          )
        : header(
            '文件上传确认',
            'turquoise',
            '确认是否已全部上传完成',
            { text: '待确认', color: 'turquoise' },
          ),
    [
      statRow([
        { label: '可识别', value: stats.recognizable },
        {
          label: '压缩包/文件夹',
          value: stats.zipCount + stats.folderCount,
        },
        { label: '将跳过', value: stats.skipCount },
      ]),
      divText('文件清单', { size: 'heading-4' }),
      markdown(formatFileChips(chips)),
      markdown(
        cancelled
          ? "<font color='grey'>你已取消本次报销，如需重新提交请重新发送文件。</font>"
          : processing
            ? "<font color='grey'>正在识别，请稍候…</font>"
            : "<font color='grey'>可继续发送文件，清单会自动更新。确认后将解压 zip 内的图片与 PDF；飞书文件夹请改为 zip 发送；其他格式会在结果中提示。</font>",
        { size: 'notation' },
      ),
      buttonRow([
        uploadLocked
          ? disabledButton(
              '已全部上传，开始识别',
              cancelled ? '已取消，无法提交' : '识别进行中',
            )
          : button(
              '已全部上传，开始识别',
              'primary',
              actionValue('upload_complete', sessionId),
            ),
        cancelled || processing
          ? disabledButton(
              '取消',
              cancelled ? '已取消' : '识别进行中',
            )
          : button(
              '取消',
              'default',
              actionValue('cancel_reimburse', sessionId),
            ),
      ]),
    ],
  );

  return {
    msg_type: 'interactive',
    card: cardContent,
  };
}

/** 供 PATCH / 卡片回调即时更新使用 */
export function buildConfirmCardContent(
  sessionId: string,
  stats: ConfirmCardStats,
  chips: FileChip[],
  options?: {
    cancelled?: boolean;
    processing?: boolean;
  },
) {
  return buildConfirmCard(sessionId, stats, chips, options).card;
}

const PROGRESS_STAGE_PIPELINE: { id: string; label: string }[] = [
  { id: 'prepare', label: '准备' },
  { id: 'ocr', label: 'OCR' },
  { id: 'extract', label: '提取' },
  { id: 'match', label: '匹配' },
  { id: 'done', label: '完成' },
];

function formatProgressStagePipeline(stage?: string): string {
  const current = String(stage ?? '').trim().toLowerCase();
  const idx = PROGRESS_STAGE_PIPELINE.findIndex((s) => s.id === current);
  return PROGRESS_STAGE_PIPELINE.map((step, i) => {
    if (idx < 0) {
      return i === 0
        ? `**${step.label}**`
        : `<font color='grey'>${step.label}</font>`;
    }
    if (i < idx) return `✅ ${step.label}`;
    if (i === idx) return `**▶ ${step.label}**`;
    return `<font color='grey'>${step.label}</font>`;
  }).join(' → ');
}

export function buildProgressCard(
  sessionId: string,
  done: number,
  total: number,
  hint?: string,
  options?: { stage?: string; message?: string },
) {
  void sessionId;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const stage = options?.stage;
  const message = options?.message?.trim();
  const statusHint =
    message ||
    hint ||
    (done >= total && total > 0
      ? '识别完成，正在生成结果…'
      : '请稍候，识别完成后会推送结果卡片。');
  const progressLabel =
    done === 0 && (hint?.includes('AI') || stage === 'extract' || stage === 'ocr')
      ? stage === 'ocr'
        ? 'OCR 识别中…'
        : 'AI 识别中…'
      : `识别进度 ${percent}%`;
  return {
    msg_type: 'interactive',
    card: buildCard(
      header('正在识别发票', 'blue', `进度 ${done}/${total}`, {
        text: '处理中',
        color: 'blue',
      }),
      [
        divText(progressLabel, { size: 'heading-3' }),
        markdown(formatProgressStagePipeline(stage), { size: 'notation' }),
        markdown(`<font color='grey'>${statusHint}</font>`, { size: 'notation' }),
      ],
    ),
  };
}

export function buildNoRecognizableCard(skippedNames: string[]) {
  const skipped = skippedNames.length
    ? skippedNames
        .map((name) => `⏭️ ${name}`)
        .join('\n')
    : '请发送图片、PDF，或包含它们的 zip 压缩包（飞书文件夹需先压缩为 zip）。';

  return {
    msg_type: 'interactive',
    card: buildCard(
      header('未发现可识别文件', 'grey', '请检查附件格式', {
        text: '未开始',
        color: 'neutral',
      }),
      [
        divText(skippedNames.length ? '已跳过文件' : '支持格式', {
          size: 'heading-4',
        }),
        markdown(skipped),
        markdown(
          "<font color='grey'>本次报销已结束，如需重新提交请重新发送文件。</font>",
          { size: 'notation' },
        ),
      ],
    ),
  };
}

export function buildResultCard(
  sessionId: string,
  items: ResultCardItem[],
  skippedNames: string[],
  mode: ResultCardMode,
  options?: {
    cancelled?: boolean;
    locked?: boolean;
    lockedReason?: string;
    typeOptions?: SystemTypeOption[];
  },
) {
  const typeOptions = options?.typeOptions ?? [];
  const submittable = items.filter((i) => !i.duplicate);
  const matchedCount = submittable.filter((i) => i.matched).length;
  const unmatchedCount = submittable.filter((i) => !i.matched).length;
  const total = submittable.reduce((sum, i) => sum + (i.amount ?? 0), 0);
  const cancelled = options?.cancelled ?? false;
  const locked = options?.locked ?? false;
  const hasUnmatchedSelect = unmatchedCount > 0 && typeOptions.length > 0;

  const { itemBlocks, formSelects } = buildPartitionedResultBlocks(
    items,
    typeOptions,
  );

  const skipped =
    skippedNames.length > 0
      ? [
          hr(),
          divText('已跳过文件', { size: 'heading-4' }),
          markdown(skippedNames.map((name) => `⏭️ ${name}`).join('\n')),
        ]
      : [];

  const unmatchedAlert =
    unmatchedCount > 0
      ? [
          markdown(
            "<font color='orange'>**未识别到报销类型。** 请为未匹配的发票手动选择类型后再提交。</font>",
            { size: 'notation' },
          ),
        ]
      : [];

  const primaryLabel =
    mode === 'has_duplicate'
      ? '跳过重复并提交'
      : mode === 'all_unmatched'
        ? '确认报销'
        : mode === 'has_unmatched'
          ? hasUnmatchedSelect
            ? '确认报销'
            : '仅提交已匹配'
          : '确认报销';

  const submitAction = hasUnmatchedSelect
    ? 'submit_with_selection'
    : mode === 'has_duplicate'
      ? 'submit_skip_duplicates'
      : 'submit_all_matched';

  const buildCancelButton = () => {
    if (cancelled) {
      return disabledButton('取消', '已取消');
    }
    return button('取消', mode === 'has_duplicate' ? 'danger' : 'default', actionValue('cancel_submit', sessionId), {
      name: 'btn_cancel_submit',
    });
  };

  const buildSubmitButton = (
    label: string,
    action: string,
    btnOptions?: { formActionType?: 'submit' | 'reset'; name?: string },
  ) => {
    if (cancelled || locked) {
      return disabledButton(
        label,
        cancelled ? '已取消，无法提交' : (options?.lockedReason ?? '处理中'),
      );
    }
    return button(label, 'primary', actionValue(action, sessionId), btnOptions);
  };

  const buildActionButtons = () => {
    if (hasUnmatchedSelect) {
      return buttonRow([
        buildSubmitButton(primaryLabel, submitAction, {
          name: 'btn_submit_selection',
          formActionType: 'submit',
        }),
        buildCancelButton(),
      ]);
    }
    if (mode === 'has_unmatched') {
      return buttonRow([
        buildSubmitButton('仅提交已匹配', 'submit_all_matched'),
        buildCancelButton(),
      ]);
    }
    if (mode === 'has_duplicate') {
      return buttonRow([
        buildSubmitButton('跳过重复并提交', 'submit_skip_duplicates'),
        buildCancelButton(),
      ]);
    }
    return buttonRow([
      buildSubmitButton('确认报销', 'submit_all_matched'),
      buildCancelButton(),
    ]);
  };

  const headerTitle =
    mode === 'all_unmatched'
      ? '未识别到报销类型'
      : mode === 'has_duplicate'
        ? '发现重复发票'
        : unmatchedCount > 0
          ? '部分发票无法提交'
          : `${matchedCount} 张发票可提交`;

  const headerSubtitle =
    mode === 'all_unmatched'
      ? '请为每张发票手动选择报销类型'
      : mode === 'has_duplicate'
        ? '请去除重复项后再确认报销'
        : unmatchedCount > 0
          ? `${matchedCount} 张已匹配 · ${unmatchedCount} 张未匹配系统类型`
          : cancelled
            ? '本次报销已取消'
            : `合计 ¥${total.toFixed(2)}`;

  const statusColor = cancelled
    ? 'neutral'
    : mode === 'ready'
      ? 'turquoise'
      : 'orange';
  const statusText = cancelled
    ? '已取消'
    : mode === 'ready'
      ? '可提交'
      : mode === 'all_unmatched'
        ? '需选择类型'
        : '需确认';

  const bodyElements: unknown[] = hasUnmatchedSelect
    ? [
        {
          tag: 'form',
          name: 'result_type_form',
          vertical_spacing: 'large',
          elements: [
            ...itemBlocks,
            ...formSelects,
            ...unmatchedAlert,
            ...skipped,
            hr(),
            ...(cancelled
              ? [
                  markdown(
                    "<font color='grey'>如需重新报销，请重新发送文件。</font>",
                    { size: 'notation' },
                  ),
                ]
              : []),
            buildActionButtons(),
          ],
        },
      ]
    : [
        ...itemBlocks,
        ...skipped,
        ...unmatchedAlert,
        hr(),
        ...(cancelled
          ? [
              markdown(
                "<font color='grey'>如需重新报销，请重新发送文件。</font>",
                { size: 'notation' },
              ),
            ]
          : []),
        buildActionButtons(),
      ];

  return {
    msg_type: 'interactive',
    card: buildCard(
      header(
        headerTitle,
        cancelled ? 'grey' : mode === 'ready' ? 'turquoise' : 'orange',
        headerSubtitle,
        { text: statusText, color: statusColor },
      ),
      bodyElements,
    ),
  };
}

export function buildResultCardContent(
  sessionId: string,
  items: ResultCardItem[],
  skippedNames: string[],
  mode: ResultCardMode,
  options?: {
    cancelled?: boolean;
    locked?: boolean;
    lockedReason?: string;
    typeOptions?: SystemTypeOption[];
  },
) {
  return buildResultCard(sessionId, items, skippedNames, mode, options).card;
}

export function buildProfileCard(
  sessionId: string,
  missing: string[],
  companies: CompanyOption[],
  options?: { cancelled?: boolean; saved?: boolean },
) {
  const cancelled = options?.cancelled ?? false;
  const saved = options?.saved ?? false;
  const locked = cancelled || saved;
  const formElements: unknown[] = [
    markdown(
      cancelled
        ? '本次报销已取消'
        : saved
          ? '资料已保存，请继续在结果卡片中提交。'
          : `缺少：**${missing.join('、')}**`,
    ),
  ];

  if (!locked) {
    formElements.push(
      {
        tag: 'column_set',
        horizontal_spacing: 'medium',
        columns: [
          {
            tag: 'column',
            width: 'weighted',
            weight: 1,
            elements: [markdown('**报销公司**', { size: 'normal' })],
          },
          {
            tag: 'column',
            width: 'weighted',
            weight: 3,
            elements: [
              {
                tag: 'select_static',
                name: 'company_id',
                required: true,
                width: 'fill',
                placeholder: plainText('请选择公司'),
                options: companies.map((c) => ({
                  text: plainText(c.name),
                  value: c.id,
                })),
              },
            ],
          },
        ],
      },
      {
        tag: 'column_set',
        horizontal_spacing: 'medium',
        columns: [
          {
            tag: 'column',
            width: 'weighted',
            weight: 1,
            elements: [markdown('**收款账户**', { size: 'normal' })],
          },
          {
            tag: 'column',
            width: 'weighted',
            weight: 3,
            elements: [
              {
                tag: 'input',
                name: 'payment_account',
                required: true,
                width: 'fill',
                placeholder: plainText('请输入收款账户'),
              },
            ],
          },
        ],
      },
    );
  }

  formElements.push(
    locked
      ? buttonRow([
          disabledButton(
            '保存并继续',
            cancelled ? '已取消' : '资料已保存',
          ),
          disabledButton(
            '稍后处理',
            cancelled ? '已取消' : '资料已保存',
          ),
        ])
      : buttonRow([
          button(
            '保存并继续',
            'primary',
            actionValue('save_profile', sessionId),
            { name: 'btn_save_profile', formActionType: 'submit' },
          ),
          button(
            '稍后处理',
            'default',
            actionValue('cancel_submit', sessionId),
            { name: 'btn_cancel_profile' },
          ),
        ]),
  );

  return {
    msg_type: 'interactive',
    card: {
      schema: '2.0',
      config: {
        update_multi: true,
        width_mode: 'compact',
      },
      header: header(
        '资料待完善',
        cancelled || saved ? 'grey' : 'grey',
        cancelled
          ? '本次报销已取消'
          : saved
            ? '资料已保存'
            : '提交前需补全以下信息',
        {
          text: cancelled ? '已取消' : saved ? '已保存' : '待补全',
          color: cancelled ? 'neutral' : saved ? 'green' : 'orange',
        },
      ),
      body: {
        padding: '12px',
        vertical_spacing: 'large',
        elements: [
          {
            tag: 'form',
            name: 'profile_form',
            vertical_spacing: 'large',
            elements: formElements,
          },
        ],
      },
    },
  };
}

export function buildProfileCardContent(
  sessionId: string,
  missing: string[],
  companies: CompanyOption[],
  options?: { cancelled?: boolean; saved?: boolean },
) {
  return buildProfileCard(sessionId, missing, companies, options).card;
}

export function buildSuccessCard(count: number, totalAmount: number, listUrl: string) {
  return {
    msg_type: 'interactive',
    card: buildCard(
      header(
        '报销申请已创建',
        'green',
        '已进入审批流程',
        { text: '已提交', color: 'green' },
      ),
      [
        divText(`${count} 笔`, { align: 'center', size: 'heading-2' }),
        divText(`合计 ¥${totalAmount.toFixed(2)}`, {
          align: 'center',
          size: 'heading-4',
          color: 'grey',
        }),
        markdown(
          "<font color='grey'>你可以在系统中继续跟踪审批进度。</font>",
          { size: 'notation', align: 'center' },
        ),
        buttonRow([
          linkButton('查看报销单', listUrl),
          button('完成', 'default', { action: 'dismiss' }),
        ]),
      ],
    ),
  };
}

export type ApprovalCardAttachment = { name: string; url: string };

export type ApprovalDetailField = { label: string; value: string };

export type ApprovalReimbursementCardSummary = {
  applicantName: string;
  category: string;
  amount: number;
  applyDate?: string;
  companyName?: string;
  paymentAccount?: string;
  /** 报销类型动态填写字段（已按 fields 转成中文 label） */
  detailFields?: ApprovalDetailField[];
  attachments?: ApprovalCardAttachment[];
};

export type ApprovalPendingCardInput = ApprovalReimbursementCardSummary & {
  approvalRecordId: string;
};

export type ApprovalCardResolve =
  | { kind: 'approved'; byName: string }
  | { kind: 'self_done'; byName: string }
  | { kind: 'rejected'; byName: string }
  | { kind: 'withdrawn' };

export type ApprovalSkippedCardInput = ApprovalReimbursementCardSummary & {
  resolve: ApprovalCardResolve;
};

/** 待审批 / 已处理卡共用的报销摘要 markdown */
export function formatApprovalReimbursementMarkdown(
  summary: ApprovalReimbursementCardSummary,
): string {
  const detailFields = (summary.detailFields || []).filter(
    (field) => field?.label && field.value !== '' && field.value != null,
  );
  const detailLabels = new Set(detailFields.map((field) => field.label));

  const amountText = `¥${Number(summary.amount || 0).toFixed(2)}`;
  const fixedRows: ApprovalDetailField[] = [
    { label: '申请人', value: summary.applicantName || '申请人' },
    { label: '类型', value: summary.category || '-' },
    { label: '金额', value: amountText },
  ];
  if (summary.applyDate) {
    fixedRows.push({ label: '申请日', value: summary.applyDate });
  }
  if (summary.companyName) {
    fixedRows.push({ label: '公司', value: summary.companyName });
  }
  if (summary.paymentAccount) {
    fixedRows.push({ label: '收款账户', value: summary.paymentAccount });
  }

  const lines: string[] = [];
  // 固定字段与 detail 字段同名时以 detail 为准，避免重复展示（如金额）
  for (const row of fixedRows) {
    if (detailLabels.has(row.label)) continue;
    lines.push(`**${row.label}**：${row.value}`);
  }

  for (const field of detailFields) {
    lines.push(`**${field.label}**：${field.value}`);
  }

  const attachments = (summary.attachments || []).filter(
    (a) => a?.url && a?.name,
  );
  if (attachments.length > 0) {
    lines.push('**附件**：');
    for (const file of attachments) {
      lines.push(`[${file.name}](${file.url})`);
    }
  }

  return lines.join('\n');
}

export function buildApprovalPendingCard(input: ApprovalPendingCardInput) {
  return {
    msg_type: 'interactive',
    card: buildCard(
      header('待审批报销', 'orange', '请尽快处理', {
        text: '待审批',
        color: 'orange',
      }),
      [
        {
          tag: 'form',
          name: 'approval_form',
          vertical_spacing: 'large',
          elements: [
            markdown(formatApprovalReimbursementMarkdown(input)),
            {
              tag: 'input',
              name: 'reject_reason',
              required: true,
              width: 'fill',
              placeholder: plainText('请填写驳回原因'),
            },
            buttonRow([
              button('通过', 'primary', {
                action: 'approval_approve',
                approval_record_id: input.approvalRecordId,
              }),
              button(
                '驳回',
                'danger',
                {
                  action: 'approval_reject',
                  approval_record_id: input.approvalRecordId,
                },
                {
                  name: 'btn_approval_reject',
                  formActionType: 'submit',
                },
              ),
            ]),
          ],
        },
      ],
    ),
  };
}

function resolveSkippedHeader(resolve: ApprovalCardResolve): {
  title: string;
  template: 'green' | 'red' | 'orange';
  tag: StatusTag;
  statusLine: string;
  tip: string;
} {
  if (resolve.kind === 'rejected') {
    return {
      title: '审批已结束',
      template: 'red',
      tag: { text: '已驳回', color: 'red' },
      statusLine: `该报销记录已被驳回，审批人：**${resolve.byName}**。无需再操作。`,
      tip: '该报销记录已驳回',
    };
  }
  if (resolve.kind === 'self_done') {
    return {
      title: '你已审批',
      template: 'green',
      tag: { text: '已处理', color: 'green' },
      statusLine: `你已审批通过（**${resolve.byName}**），本卡无需再操作。`,
      tip: '你已审批通过',
    };
  }
  if (resolve.kind === 'withdrawn') {
    return {
      title: '审批已撤回',
      template: 'orange',
      tag: { text: '已撤回', color: 'orange' },
      statusLine:
        '该报销记录已被撤回至待审批，需重新审批。本卡已失效，请留意新的待办卡片。',
      tip: '该报销记录已撤回',
    };
  }
  return {
    title: '审批已结束',
    template: 'green',
    tag: { text: '已通过', color: 'green' },
    statusLine: `该报销记录已审批通过，审批人：**${resolve.byName}**。无需再操作。`,
    tip: '该报销记录已审批通过',
  };
}

export function buildApprovalSkippedCard(input: ApprovalSkippedCardInput) {
  const resolved = resolveSkippedHeader(input.resolve);
  const summaryMd = formatApprovalReimbursementMarkdown(input);
  return {
    msg_type: 'interactive',
    card: buildCard(
      header(resolved.title, resolved.template, undefined, resolved.tag),
      [
        markdown(`${resolved.statusLine}\n\n${summaryMd}`),
        buttonRow([
          disabledButton('通过', resolved.tip),
          disabledButton('驳回', resolved.tip),
        ]),
      ],
    ),
  };
}

export function buildApprovalResultCard(input: {
  approved: boolean;
  category: string;
  amount: number;
  comment?: string;
}) {
  const amountText = `¥${Number(input.amount || 0).toFixed(2)}`;
  return {
    msg_type: 'interactive',
    card: buildCard(
      header(
        input.approved ? '报销已通过' : '报销已驳回',
        input.approved ? 'green' : 'red',
        undefined,
        {
          text: input.approved ? '已通过' : '已驳回',
          color: input.approved ? 'green' : 'red',
        },
      ),
      [
        markdown(
          `**类型**：${input.category}\n**金额**：${amountText}${
            input.comment ? `\n**说明**：${input.comment}` : ''
          }`,
        ),
      ],
    ),
  };
}
