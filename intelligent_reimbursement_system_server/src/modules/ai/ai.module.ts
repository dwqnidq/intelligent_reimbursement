import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { GrpcClientService } from './grpc-client.service';

@Module({
  controllers: [AiController],
  providers: [AiService, GrpcClientService],
  exports: [AiService],
})
export class AiModule {}
