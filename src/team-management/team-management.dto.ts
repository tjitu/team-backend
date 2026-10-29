import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { TeamRole } from '@prisma/client';

export class ListMembersQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : undefined))
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class UpdateMemberStatusDto {
  @IsBoolean()
  isActive!: boolean;
}

export class UpdateMemberRoleDto {
  @IsEnum(TeamRole)
  role!: TeamRole;
}

export class CreateTeamMemberDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @Length(2, 120)
  name!: string;

  @IsEnum(TeamRole)
  role: TeamRole = TeamRole.MEMBER;

  @IsString()
  @Length(12, 72)
  password!: string;
}

export class CreateInvitationDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsEnum(TeamRole)
  role: TeamRole = TeamRole.MEMBER;
}

export class AcceptInvitationDto {
  @IsString()
  @Length(40, 128)
  token!: string;
}
