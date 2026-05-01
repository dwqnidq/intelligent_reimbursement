import { PartialType } from '@nestjs/swagger';
import { CreateApprovalFlowDto } from './create-approval-flow.dto';

export class UpdateApprovalFlowDto extends PartialType(CreateApprovalFlowDto) {}
