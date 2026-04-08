import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { UserModule } from './modules/user/user.module';
import { ReimbursementModule } from './modules/reimbursement/reimbursement.module';
import { ReimbursementTypeModule } from './modules/reimbursement-type/reimbursement-type.module';
import { FileModule } from './modules/file/file.module';
import { AuthModule } from './modules/auth/auth.module';
import { AiModule } from './modules/ai/ai.module';
import { OpinionModule } from './modules/opinion/opinion.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/Reimbursement',
    ),
    // 托管前端打包产物，所有非 /api 路由返回 index.html（SPA 路由支持）
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'client'),
      exclude: ['/api*'],
      renderPath: '/*',
    }),
    AuthModule,
    UserModule,
    ReimbursementModule,
    ReimbursementTypeModule,
    FileModule,
    AiModule,
    OpinionModule,
  ],
})
export class AppModule {}
