import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

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
  @IsBoolean() @IsOptional() isBanned?: boolean;
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


export class CreateArticleControlDto {
  @IsString() @MinLength(2) title!: string;
  @IsString() @IsOptional() slug?: string;
  @IsString() @IsOptional() summary?: string;
  @IsString() @MinLength(1) content!: string;
  @IsString() @IsOptional() coverImageUrl?: string;
  @IsString() @IsOptional() category?: string;
  @IsString() @IsOptional() tags?: string;
  @IsString() @IsOptional() authorName?: string;
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED']) @IsOptional() status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  @IsInt() @Min(1) @IsOptional() readTimeMinutes?: number;
  @IsDateString() @IsOptional() publishedAt?: string;
}

export class UpdateArticleControlDto {
  @IsString() @MinLength(2) @IsOptional() title?: string;
  @IsString() @IsOptional() slug?: string;
  @IsString() @IsOptional() summary?: string | null;
  @IsString() @MinLength(1) @IsOptional() content?: string;
  @IsString() @IsOptional() coverImageUrl?: string | null;
  @IsString() @IsOptional() category?: string;
  @IsString() @IsOptional() tags?: string;
  @IsString() @IsOptional() authorName?: string;
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED']) @IsOptional() status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  @IsInt() @Min(1) @IsOptional() readTimeMinutes?: number;
  @IsDateString() @IsOptional() publishedAt?: string | null;
}


export class CreateQuestionOptionDto {
  @IsString() content!: string;
  @IsBoolean() isCorrect!: boolean;
  @IsInt() @Min(1) order!: number;
}

export class CreateSolutionStepDto {
  @IsInt() stepNumber!: number;
  @IsString() @IsOptional() category?: string;
  @IsString() title!: string;
  @IsString() content!: string;
}

export class CreateQuestionControlDto {
  @IsString() subtest!: string;
  @IsString() @IsOptional() subtopicId?: string;
  @IsIn(['EASY', 'MEDIUM', 'HARD']) @IsOptional() difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  @IsIn(['MULTIPLE_CHOICE', 'COMPLEX_MULTIPLE_CHOICE', 'SHORT_ANSWER']) @IsOptional() type?: string;
  @IsIn(['DRAFT', 'FOR_TRYOUT', 'FOR_PRACTICE']) @IsOptional() target?: 'DRAFT' | 'FOR_TRYOUT' | 'FOR_PRACTICE';
  @IsString() @IsOptional() narration?: string;
  @IsString() @MinLength(1) content!: string;
  @IsString() @IsOptional() imageUrl?: string;
  @IsInt() @Min(1) @IsOptional() points?: number;
  
  @IsOptional() options?: CreateQuestionOptionDto[];
  @IsOptional() solutionSteps?: CreateSolutionStepDto[];
  @IsString() @IsOptional() quickTrick?: string;
  @IsString() @IsOptional() staticExplanation?: string;
}

export class UpdateQuestionControlDto {
  @IsString() @IsOptional() subtest?: string;
  @IsString() @IsOptional() subtopicId?: string | null;
  @IsIn(['EASY', 'MEDIUM', 'HARD']) @IsOptional() difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
  @IsIn(['MULTIPLE_CHOICE', 'COMPLEX_MULTIPLE_CHOICE', 'SHORT_ANSWER']) @IsOptional() type?: string;
  @IsIn(['DRAFT', 'FOR_TRYOUT', 'FOR_PRACTICE']) @IsOptional() target?: 'DRAFT' | 'FOR_TRYOUT' | 'FOR_PRACTICE';
  @IsString() @IsOptional() narration?: string | null;
  @IsString() @IsOptional() content?: string;
  @IsString() @IsOptional() imageUrl?: string | null;
  @IsInt() @Min(1) @IsOptional() points?: number;
  
  @IsOptional() options?: CreateQuestionOptionDto[];
  @IsOptional() solutionSteps?: CreateSolutionStepDto[];
  @IsString() @IsOptional() quickTrick?: string | null;
  @IsString() @IsOptional() staticExplanation?: string | null;
}

export class CreateDiscountControlDto {
  @IsString() @MinLength(2) name!: string;
  @IsIn(['PERCENTAGE', 'FIXED']) type!: 'PERCENTAGE' | 'FIXED';
  @Min(0) value!: number;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsString() @IsOptional() packageId?: string | null;
  @IsString() @IsOptional() badgeText?: string;
  @IsString() @IsOptional() badgeStyle?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateDiscountControlDto {
  @IsString() @MinLength(2) @IsOptional() name?: string;
  @IsIn(['PERCENTAGE', 'FIXED']) @IsOptional() type?: 'PERCENTAGE' | 'FIXED';
  @Min(0) @IsOptional() value?: number;
  @IsDateString() @IsOptional() startDate?: string;
  @IsDateString() @IsOptional() endDate?: string;
  @IsString() @IsOptional() packageId?: string | null;
  @IsString() @IsOptional() badgeText?: string;
  @IsString() @IsOptional() badgeStyle?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class CreateVoucherControlDto {
  @IsString() @MinLength(2) code!: string;
  @IsInt() @Min(1) @Max(100) discountPercent!: number;
  @IsInt() @Min(0) @IsOptional() maxDiscount?: number | null;
  @IsInt() @Min(0) @IsOptional() minPurchase?: number;
  @IsInt() @Min(1) @IsOptional() maxUsage?: number | null;
  @IsDateString() @IsOptional() expiresAt?: string | null;
  @IsString() @IsOptional() description?: string | null;
  @IsString() @IsOptional() referrerName?: string | null;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateVoucherControlDto {
  @IsString() @MinLength(2) @IsOptional() code?: string;
  @IsInt() @Min(1) @Max(100) @IsOptional() discountPercent?: number;
  @IsInt() @Min(0) @IsOptional() maxDiscount?: number | null;
  @IsInt() @Min(0) @IsOptional() minPurchase?: number;
  @IsInt() @Min(1) @IsOptional() maxUsage?: number | null;
  @IsDateString() @IsOptional() expiresAt?: string | null;
  @IsString() @IsOptional() description?: string | null;
  @IsString() @IsOptional() referrerName?: string | null;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class CreateTopicControlDto {
  @IsString() @MinLength(2) subtest!: string;
  @IsString() @MinLength(2) title!: string;
  @IsString() @IsOptional() slug?: string;
  @IsInt() @Min(0) @IsOptional() order?: number;
}

export class UpdateTopicControlDto {
  @IsString() @MinLength(2) @IsOptional() subtest?: string;
  @IsString() @MinLength(2) @IsOptional() title?: string;
  @IsString() @IsOptional() slug?: string;
  @IsInt() @Min(0) @IsOptional() order?: number;
}

export class CreateSubtopicControlDto {
  @IsString() @MinLength(2) topicId!: string;
  @IsString() @MinLength(2) title!: string;
  @IsString() @IsOptional() slug?: string;
  @IsInt() @Min(0) @IsOptional() order?: number;
}

export class UpdateSubtopicControlDto {
  @IsString() @MinLength(2) @IsOptional() topicId?: string;
  @IsString() @MinLength(2) @IsOptional() title?: string;
  @IsString() @IsOptional() slug?: string;
  @IsInt() @Min(0) @IsOptional() order?: number;
}
