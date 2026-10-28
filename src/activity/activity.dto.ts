import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

export class ListActivityQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 32)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z_]{1,64}$/)
  eventType?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z_]{1,64}$/)
  entityType?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  actorId?: string;
}
