import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export class AssignAgentToProjectDto {
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsOptional()
  @IsEnum(['member', 'lead'])
  role?: 'member' | 'lead';
}

export class AssignAgentToTaskDto {
  @IsString()
  @IsNotEmpty()
  taskId: string;
}

export class UnassignAgentDto {
  @IsString()
  @IsNotEmpty()
  assignmentId: string;
}
