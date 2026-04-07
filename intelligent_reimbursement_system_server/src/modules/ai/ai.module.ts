import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { GrpcClientService } from './grpc-client.service';
import { User, UserSchema } from '../../schemas/user.schema';
import { Role, RoleSchema } from '../../schemas/role.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
    ]),
  ],
  controllers: [AiController],
  providers: [AiService, GrpcClientService],
  exports: [AiService],
})
export class AiModule {}
