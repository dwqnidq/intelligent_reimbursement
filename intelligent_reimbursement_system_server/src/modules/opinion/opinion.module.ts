import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Opinion, OpinionSchema } from '../../schemas/opinion.schema';
import { OpinionService } from './opinion.service';
import { OpinionController } from './opinion.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Opinion.name, schema: OpinionSchema }]),
  ],
  controllers: [OpinionController],
  providers: [OpinionService],
})
export class OpinionModule {}
