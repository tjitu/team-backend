import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateTryoutControlDto {
  @IsString() @MinLength(2) title!: string;
  @IsString() @IsOptional() description?: string;
  @IsInt() @Min(0) solutionPrice!: number;
  @IsIn(['SNBT', 'MANDIRI']) batch!: 'SNBT' | 'MANDIRI';
  @IsDateString() releaseDate!: string;
  @IsDateString() scheduledStart!: string;
  @IsDateString() scheduledEnd!: string;
  @IsBoolean() @IsOptional() isPublic?: boolean;
  @IsString() @IsOptional() referralCode?: string;
}

export class UpdateTryoutControlDto {
  @IsString() @MinLength(2) @IsOptional() title?: string;
  @IsString() @IsOptional() description?: string | null;
  @IsInt() @Min(0) @IsOptional() solutionPrice?: number;
  @IsIn(['SNBT', 'MANDIRI']) @IsOptional() batch?: 'SNBT' | 'MANDIRI';
  @IsDateString() @IsOptional() releaseDate?: string;
  @IsDateString() @IsOptional() scheduledStart?: string;
  @IsDateString() @IsOptional() scheduledEnd?: string;
  @IsBoolean() @IsOptional() isPublic?: boolean;
  @IsString() @IsOptional() referralCode?: string | null;
}

export class UpdateManagedUserDto {
  @IsIn(['USER', 'ADMIN']) @IsOptional() role?: 'USER' | 'ADMIN';
  @IsString() @MinLength(1) @MaxLength(100) @IsOptional() target?: string | null;
}

export class UpdateHiringApplicationDto {
  @IsIn(['SUBMITTED', 'UNDER_REVIEW', 'INTERVIEW', 'ACCEPTED', 'REJECTED']) @IsOptional()
  status?: 'SUBMITTED' | 'UNDER_REVIEW' | 'INTERVIEW' | 'ACCEPTED' | 'REJECTED';
  @IsString() @IsOptional() adminNotes?: string;
}

export class CreatePackageControlDto {
  @IsString() @MinLength(2) name!: string;
  @IsInt() @Min(1) tokenAmount!: number;
  @IsInt() @Min(0) price!: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdatePackageControlDto {
  @IsString() @MinLength(2) @IsOptional() name?: string;
  @IsInt() @Min(1) @IsOptional() tokenAmount?: number;
  @IsInt() @Min(0) @IsOptional() price?: number;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
