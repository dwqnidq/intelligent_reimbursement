import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { GrpcClientService } from './grpc-client.service';
import { inspect } from 'node:util';

type ReimbursementTypeLike = {
  code?: unknown;
  label?: unknown;
  fields?: unknown;
  [key: string]: unknown;
};

function normalizeReimbursementTypeList(raw: unknown): ReimbursementTypeLike[] {
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw)) return raw.filter((x) => x && typeof x === 'object') as ReimbursementTypeLike[];
  const obj = raw as Record<string, unknown>;
  if ('code' in obj && 'label' in obj) return [obj as ReimbursementTypeLike];
  return Object.values(obj).filter((x) => x && typeof x === 'object') as ReimbursementTypeLike[];
}

function hasValidFields(item: ReimbursementTypeLike): boolean {
  return Array.isArray(item.fields) && item.fields.length > 0;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly grpcClient: GrpcClientService) {}

  chatStream(
    input: string,
    files?: string[],
    isAdmin = false,
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      console.log(input, files);
      const grpcStream = this.grpcClient.streamExecuteGraph({
        input,
        files: files || [],
        config: { is_admin: isAdmin ? 'true' : 'false' },
      });

      grpcStream.subscribe({
        next: (chunk) => {
          if (chunk.is_final) {
            // 最终结果，解析 output 做业务处理
            try {
              const output = JSON.parse(chunk.output);
              const node = output.node;
              const result = output.result;

              let data: Record<string, unknown>;

              if (node === 'reimbursement_type') {
                const keys =
                  result && typeof result === 'object'
                    ? Object.keys(result as Record<string, unknown>).join(', ')
                    : 'non-object';
                this.logger.log(`[AI][reimbursement_type] result keys: ${keys}`);
                try {
                  this.logger.log(
                    `[AI][reimbursement_type] raw result json:\n${JSON.stringify(result, null, 2)}`,
                  );
                } catch {
                  this.logger.warn(
                    '[AI][reimbursement_type] JSON.stringify 失败，改用 util.inspect 打印',
                  );
                }
                this.logger.log(
                  `[AI][reimbursement_type] raw result inspect:\n${inspect(result, {
                    depth: null,
                    maxArrayLength: null,
                    maxStringLength: null,
                    compact: false,
                    breakLength: 120,
                  })}`,
                );
                const typeList = normalizeReimbursementTypeList(result).filter(
                  (x) => String(x.code ?? '').trim() && String(x.label ?? '').trim(),
                );
                const validTypeList = typeList.filter(hasValidFields);
                const labels = validTypeList
                  .map((x) => String(x.label ?? '').trim())
                  .filter(Boolean);
                if (typeList.length > 0 && validTypeList.length !== typeList.length) {
                  this.logger.warn(
                    `[AI][reimbursement_type] 检测到 ${typeList.length - validTypeList.length} 个类型缺少 fields，已拦截返回`,
                  );
                }
                data = {
                  type: 'reimbursement_type',
                  data: validTypeList,
                  message:
                    labels.length === 0
                      ? '生成结果缺少类型字段定义（fields），请重试并明确要求返回完整字段配置'
                      : labels.length > 1
                      ? `已为您生成 ${labels.length} 个报销类型：${labels.join('、')}`
                      : labels.length === 1
                        ? `已为您生成报销类型「${labels[0]}」的配置`
                        : '报销类型配置已生成',
                };
              } else if (node === 'invoice_recognition') {
                const invoiceCount = Array.isArray(result)
                  ? result.filter(
                      (r: unknown) =>
                        r === true ||
                        (r as { is_invoice?: boolean })?.is_invoice === true,
                    ).length
                  : 0;
                data = {
                  type: 'invoice_recognition',
                  data: result,
                  message: `识别完成：${Array.isArray(result) ? result.length : 0}个文件中有${invoiceCount}个发票`,
                };
              } else if (node === 'reimbursement_form_extract') {
                const flatRows = (() => {
                  if (!Array.isArray(result) || result.length === 0) return [];
                  const first = result[0] as unknown;
                  if (Array.isArray(first)) {
                    return (result as unknown[][]).flat() as Record<
                      string,
                      unknown
                    >[];
                  }
                  return result as Record<string, unknown>[];
                })();
                const label = String(
                  (flatRows[0] as { label?: string } | undefined)?.label ?? '',
                );
                const isSuggested = Boolean(
                  (flatRows[0] as { is_suggested_type?: boolean } | undefined)
                    ?.is_suggested_type,
                );
                const n = flatRows.length;
                const fileSlots =
                  Array.isArray(result) &&
                  result.length > 0 &&
                  Array.isArray((result as unknown[])[0])
                    ? result.length
                    : n > 0
                      ? 1
                      : 0;
                const detailHint =
                  n > 1
                    ? `，${fileSlots} 个文件共 ${n} 条明细`
                    : n === 1
                      ? '，1 条明细'
                      : '';
                data = {
                  type: 'reimbursement_form_extract',
                  data: result,
                  message: isSuggested
                    ? label
                      ? `已根据票据生成建议报销类型「${label}」${detailHint}，请在后台创建对应类型后选择提交`
                      : `已生成建议报销类型${detailHint}，请在后台创建对应类型后选择提交`
                    : label
                      ? `已识别报销类型「${label}」${detailHint}，表单已更新`
                      : '报销单识别完成',
                };
              } else {
                data = { type: 'chat', message: result };
              }

              subscriber.next({
                data: JSON.stringify({ done: true, ...data }),
              } as MessageEvent);
            } catch {
              subscriber.next({
                data: JSON.stringify({
                  done: true,
                  type: 'chat',
                  message: chunk.output,
                }),
              } as MessageEvent);
            }
            subscriber.complete();
          } else {
            // 流式 token，直接推给前端
            subscriber.next({
              data: JSON.stringify({
                done: false,
                token: chunk.token,
                node: chunk.node,
              }),
            } as MessageEvent);
          }
        },
        error: (err) => {
          this.logger.error('流式处理失败', err);
          subscriber.next({
            data: JSON.stringify({
              done: true,
              type: 'error',
              message: '处理失败，请稍后再试',
            }),
          } as MessageEvent);
          subscriber.complete();
        },
      });
    });
  }
}
