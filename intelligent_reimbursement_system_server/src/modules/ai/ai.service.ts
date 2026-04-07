import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { GrpcClientService } from './grpc-client.service';

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
                data = {
                  type: 'reimbursement_type',
                  data: result,
                  message: `已为您生成报销类型"${result?.label}"的配置`,
                };
              } else if (node === 'invoice_recognition') {
                const invoiceCount = Array.isArray(result)
                  ? result.filter((r: any) => r.is_invoice).length
                  : 0;
                data = {
                  type: 'invoice_recognition',
                  data: result,
                  message: `识别完成：${Array.isArray(result) ? result.length : 0}个文件中有${invoiceCount}个发票`,
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
