import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCompanyDto {
  @ApiProperty({ description: '公司名称', example: '浮力创新(深圳)科技有限公司' })
  @IsString()
  @IsNotEmpty({ message: '公司名称不能为空' })
  @MaxLength(200)
  name: string;
}
