import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Opinion, OpinionSchema } from '../../schemas/opinion.schema';
import { User, UserSchema } from '../../schemas/user.schema';
import { Role, RoleSchema } from '../../schemas/role.schema';
import { OpinionService } from './opinion.service';
import { OpinionController } from './opinion.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Opinion.name, schema: OpinionSchema },
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
    ]),
  ],
  controllers: [OpinionController],
  providers: [OpinionService],
})
export class OpinionModule {}
