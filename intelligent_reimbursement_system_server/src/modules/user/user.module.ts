import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { User, UserSchema } from '../../schemas/user.schema';
import { Role, RoleSchema } from '../../schemas/role.schema';
import { Permission, PermissionSchema } from '../../schemas/permission.schema';
import { Menu, MenuSchema } from '../../schemas/menu.schema';
import { FeishuUser, FeishuUserSchema } from '../../schemas/feishu-user.schema';
import { AuthModule } from '../auth/auth.module';
import { FileModule } from '../file/file.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
      { name: Permission.name, schema: PermissionSchema },
      { name: Menu.name, schema: MenuSchema },
      { name: FeishuUser.name, schema: FeishuUserSchema },
    ]),
    AuthModule,
    FileModule,
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
