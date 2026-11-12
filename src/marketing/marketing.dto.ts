import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { BroadcastStatus, TaskPriority } from '@prisma/client';

export class ListMarketingPartnershipsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsEnum(BroadcastStatus)
  status?: BroadcastStatus;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  platform?: string;

  @IsOptional()
  @IsIn(['all', 'overdue', 'today', 'upcoming', 'scheduled'])
  followUp?: 'all' | 'overdue' | 'today' | 'upcoming' | 'scheduled';
}

export class CreateMarketingPartnershipDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  projectId?: string;

  @IsString()
  @Length(1, 160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  platform?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  totalMembers?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(160)
  picName?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  picContact?: string | null;

  @IsOptional()
  @IsEnum(BroadcastStatus)
  broadcastStatus?: BroadcastStatus;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsDateString()
  followUpDate?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
}

export class UpdateMarketingPartnershipDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  category?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  platform?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  totalMembers?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(160)
  picName?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(200)
  picContact?: string | null;

  @IsOptional()
  @IsEnum(BroadcastStatus)
  broadcastStatus?: BroadcastStatus;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsDateString()
  followUpDate?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
}

export class ImportMarketingPartnershipsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  projectId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateMarketingPartnershipDto)
  rows!: CreateMarketingPartnershipDto[];
}

export class CreatePartnershipTaskDto {
  @IsOptional()
  @IsString()
  @Length(2, 180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsDateString()
  dueAt?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  assignedMemberIds?: string[];
}
