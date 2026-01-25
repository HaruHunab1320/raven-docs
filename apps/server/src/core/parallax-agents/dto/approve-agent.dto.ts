import {
  IsString,
  IsArray,
  IsNotEmpty,
  ArrayMinSize,
} from 'class-validator';

export class ApproveAgentDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  grantedPermissions: string[];
}

export class DenyAgentDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class RevokeAgentDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class UpdateAgentPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  permissions: string[];
}
