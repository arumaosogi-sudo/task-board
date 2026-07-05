import { IsOptional, IsString, MaxLength } from 'class-validator'

export class SearchQuery {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string
}
