import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOpinionDto {
  @ApiProperty({ description: '标题' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiProperty({ description: '意见内容' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}
