import { Controller, Post, Get, Body } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OpinionService } from './opinion.service';
import { CreateOpinionDto } from './dto/create-opinion.dto';
import { CurrentUser } from '../auth/current-user.decorator';

@ApiTags('意见反馈')
@ApiBearerAuth()
@Controller('v1/opinions')
export class OpinionController {
  constructor(private readonly opinionService: OpinionService) {}

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateOpinionDto) {
    return this.opinionService.create(user.id, dto);
  }

  @Get()
  findAll() {
    return this.opinionService.findAll();
  }
}
