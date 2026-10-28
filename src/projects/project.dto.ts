import { IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { ProjectRole } from '@prisma/client';

export class CreateProjectDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
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
}

export class AddProjectMemberDto {
  @IsString()
  @Length(3, 320)
  email!: string;

  @IsEnum(ProjectRole)
  role!: ProjectRole;
}
