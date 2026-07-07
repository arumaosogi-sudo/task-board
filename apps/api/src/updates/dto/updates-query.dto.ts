import { IsIn, IsOptional, IsString } from 'class-validator'

/** Rolling time window for a feed query. `all` means no lower bound. */
export type UpdatesRange = '7d' | '30d' | 'all'

export class UpdatesQuery {
  // Defaults to '30d' in the service when omitted; only the three windows are valid.
  @IsOptional()
  @IsIn(['7d', '30d', 'all'])
  range?: UpdatesRange

  // Optional: narrow the feed to a single project (must be one the user belongs to).
  @IsOptional()
  @IsString()
  projectId?: string
}

export class ProjectChangesQuery extends UpdatesQuery {
  // Optional: narrow the feed to revisions authored by a specific person.
  @IsOptional()
  @IsString()
  authorId?: string
}
