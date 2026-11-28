import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class GrowthConfigurationDto {
  @IsObject() config!: Record<string, unknown>;
  @IsInt() @Min(0) version!: number;
}
export class GrowthQueueQuery {
  @IsIn(['PENDING_VERIFICATION','APPROVED','REJECTED']) @IsOptional() status?: string;
  @IsString() @MaxLength(120) @IsOptional() q?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsOptional() from?: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsOptional() to?: string;
  @IsIn(['true','false']) @IsOptional() storyPriority?: string;
  @Type(() => Number) @IsInt() @Min(0) @IsOptional() page?: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) @IsOptional() limit?: number;
}
export class GrowthReviewDto {
  @IsIn(['SAVE_PROGRESS','APPROVE','REJECT']) action!: 'SAVE_PROGRESS' | 'APPROVE' | 'REJECT';
  @IsInt() @Min(1) version!: number;
  @IsObject() checklist!: Record<string, boolean>;
  @IsArray() @ArrayMaxSize(8) @IsString({ each: true }) @MaxLength(500, { each: true }) @IsOptional() rejectionReasons?: string[];
  @IsBoolean() @IsOptional() next?: boolean;
}
