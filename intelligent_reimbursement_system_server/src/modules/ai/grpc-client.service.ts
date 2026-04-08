import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';
import { Observable } from 'rxjs';

interface GraphRequest {
  input: string;
  config?: Record<string, string>;
  files?: string[];
}

interface GraphResponse {
  output: string;
  success: boolean;
  error: string;
  metadata: Record<string, string>;
}

export interface GraphStreamChunk {
  node: string;
  token: string;
  output: string;
  is_final: boolean;
  success: boolean;
  error: string;
}

@Injectable()
export class GrpcClientService implements OnModuleInit {
  private readonly logger = new Logger(GrpcClientService.name);
  private client: any;

  async onModuleInit() {
    try {
      const PROTO_PATH = join(
        __dirname,
        '../../..',
        'proto/graph_service.proto',
      );

      const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
      const graphService = (protoDescriptor as any).graph_service;

      const grpcHost = process.env.GRPC_HOST || 'localhost';
      const grpcPort = process.env.GRPC_PORT || '50051';

      this.client = new graphService.GraphService(
        `${grpcHost}:${grpcPort}`,
        grpc.credentials.createInsecure(),
        {
          'grpc.max_send_message_length': 20 * 1024 * 1024,
          'grpc.max_receive_message_length': 20 * 1024 * 1024,
        },
      );

      this.logger.log(`gRPC客户端已连接: ${grpcHost}:${grpcPort}`);
    } catch (error) {
      this.logger.error('gRPC客户端初始化失败', error);
    }
  }

  async executeGraph(request: GraphRequest): Promise<GraphResponse> {
    return new Promise((resolve, reject) => {
      this.client.ExecuteGraph(
        request,
        (error: any, response: GraphResponse) => {
          if (error) {
            this.logger.error('gRPC调用失败', error);
            reject(error);
          } else {
            resolve(response);
          }
        },
      );
    });
  }

  streamExecuteGraph(request: GraphRequest): Observable<GraphStreamChunk> {
    return new Observable((subscriber) => {
      const call = this.client.StreamExecuteGraph(request);

      call.on('data', (chunk: GraphStreamChunk) => {
        subscriber.next(chunk);
      });

      call.on('end', () => {
        subscriber.complete();
      });

      call.on('error', (err: any) => {
        this.logger.error('gRPC流式调用失败', err);
        subscriber.error(err);
      });
    });
  }
}
