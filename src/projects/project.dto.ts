import { IsDateString, IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { ProjectRole } from '@prisma/client';

export class CreateProjectDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @Length(1, 120)
  departmentId!: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  departmentId?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @IsDateString()
  endsAt?: string | null;
}

export class AddProjectMemberDto {
  @IsString()
  @Length(3, 320)
  email!: string;

  @IsEnum(ProjectRole)
  role!: ProjectRole;
}

export class UpdateProjectMemberRoleDto {
  @IsEnum(ProjectRole)
  role!: ProjectRole;
}
