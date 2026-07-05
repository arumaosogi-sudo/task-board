import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { JwtGuard } from '../auth/guards/jwt.guard'
import { AuthUser, CurrentUser } from '../auth/decorators/current-user.decorator'
import { SearchService } from './search.service'
import { SearchQuery } from './dto/search.dto'

@Controller('search')
@UseGuards(JwtGuard)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  // Search hits the DB per keystroke on the client; cap to protect the DB.
  @Throttle({ default: { limit: 30, ttl: 10_000 } })
  query(@CurrentUser() user: AuthUser, @Query() query: SearchQuery) {
    return this.search.search(user.id, query.q ?? '')
  }
}
