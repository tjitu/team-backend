import { Type } from 'class-transformer';
import { Equals, IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { BOOST_TYPES } from './affiliate.types';
import type { AffiliateConfig, BoostType } from './affiliate.types';

export class BoostDto {
  @IsIn(BOOST_TYPES) type!: BoostType;
  @IsString() @Length(8,100) requestKey!: string;
  @Equals(true) confirmed!: boolean;
}
export class BonusDto {
  @IsIn(BOOST_TYPES) type!: BoostType;
  @IsInt() @Min(1) @Max(10000) quantity!: number;
  @IsString() @Length(8,100) requestKey!: string;
}
export class ConfigDto {
  @IsObject() config!: AffiliateConfig;
  @IsDateString() effectiveAt!: string;
  @IsString() @Length(1,100) agreementId!: string;
}
export class AgreementDto {
  @IsString() @Length(2,180) title!: string;
  @IsString() @Length(20,100000) content!: string;
  @IsString() @MaxLength(2000) party!: string;
  @IsString() @MaxLength(4000) summary!: string;
  @IsDateString() @IsOptional() effectiveAt?: string;
  @IsBoolean() requiresAcceptance!: boolean;
}
export class AcceptDto {
  @Equals(true) acknowledged!: boolean;
  @IsString() @Length(1,100) agreementId!: string;
  @IsString() @Length(64,64) previewHash!: string;
}
export class DateRangeDto {
  @IsDateString() @IsOptional() from?: string;
  @IsDateString() @IsOptional() to?: string;
  @IsInt() @Min(1) @Max(500) @Type(() => Number) @IsOptional() limit: number = 100;
  @IsInt() @Min(0) @Max(1000000) @Type(() => Number) @IsOptional() offset: number = 0;
}
export class PayoutDto {
  @IsInt() @Min(1) @Max(2147483647) amount!: number;
  @IsDateString() paidAt!: string;
  @IsString() @Length(2,150) reference!: string;
  @IsIn(['PENDING','PAID']) status!: 'PENDING' | 'PAID';
  @IsString() @MaxLength(2000) notes!: string;
  @IsString() @Length(8,100) requestKey!: string;
}
export class PayoutStatusDto {
  @IsIn(['PAID','CANCELLED']) status!: 'PAID' | 'CANCELLED';
}
