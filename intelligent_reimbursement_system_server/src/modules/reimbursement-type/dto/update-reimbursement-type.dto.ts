import { PartialType } from '@nestjs/swagger';
import { CreateReimbursementTypeDto } from './create-reimbursement-type.dto';

export class UpdateReimbursementTypeDto extends PartialType(
  CreateReimbursementTypeDto,
) {}
