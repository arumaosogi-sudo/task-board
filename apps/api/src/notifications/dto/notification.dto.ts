import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional } from 'class-validator'

export class ListNotificationsQuery {
  // ?unread=true → only undread. Accepts the string form from the query string.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  unread?: boolean
}
