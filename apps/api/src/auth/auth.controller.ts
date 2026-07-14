import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Throttle } from '@nestjs/throttler'
import { CookieOptions, Request, Response } from 'express'
import { AuthService, PublicUser, REFRESH_COOKIE } from './auth.service'
import { GoogleProfile } from './strategies/google.strategy'
import { JwtGuard } from './guards/jwt.guard'
import { JwtRefreshGuard } from './guards/jwt-refresh.guard'
import { GoogleGuard } from './guards/google.guard'
import { GoogleOAuthExceptionFilter } from './filters/google-oauth.filter'
import { AuthUser, CurrentUser } from './decorators/current-user.decorator'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { UpdateSettingDto } from './dto/update-setting.dto'
import { ChangePasswordDto, DeleteAccountDto, UpdateProfileDto } from './dto/account.dto'
import {
  ForgotPasswordDto,
  ResendVerifyDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/token.dto'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  /* ----------------------------- cookie helpers --------------------------- */

  private cookieOptions(): CookieOptions {
    const isProd = this.config.get<string>('NODE_ENV') === 'production'
    return {
      httpOnly: true,
      sameSite: 'strict',
      secure: isProd,
      path: '/',
      maxAge: this.auth.refreshTtlMs,
    }
  }

  private setRefreshCookie(res: Response, token: string): void {
    res.cookie(REFRESH_COOKIE, token, this.cookieOptions())
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, { ...this.cookieOptions(), maxAge: undefined })
  }

  /* -------------------------------- register ------------------------------ */

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.username, dto.email, dto.password)
  }

  /* --------------------------------- login -------------------------------- */

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: PublicUser; accessToken: string }> {
    const { user, accessToken, refreshToken } = await this.auth.login(dto.identity, dto.password)
    this.setRefreshCookie(res, refreshToken)
    return { user, accessToken }
  }

  /* -------------------------------- refresh ------------------------------- */

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  async refresh(
    @Req() req: Request & { user: AuthUser; refreshTokenId: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const { accessToken, refreshToken } = await this.auth.rotateRefresh(req.user, req.refreshTokenId)
    this.setRefreshCookie(res, refreshToken)
    return { accessToken }
  }

  /* -------------------------------- logout -------------------------------- */

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  async logout(
    @Req() req: Request & { refreshTokenId: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    await this.auth.logout(req.refreshTokenId)
    this.clearRefreshCookie(res)
    return { message: 'logged-out' }
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard)
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    await this.auth.logoutAll(user.id)
    this.clearRefreshCookie(res)
    return { message: 'logged-out-all' }
  }

  /* --------------------------- email verification ------------------------- */

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token)
  }

  @Post('resend-verify')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 1, ttl: 60_000 } })
  resendVerify(@Body() dto: ResendVerifyDto) {
    return this.auth.resendVerify(dto.email)
  }

  /* ----------------------------- password reset --------------------------- */

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email)
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password)
  }

  /* -------------------------------- google -------------------------------- */

  @Get('google')
  @UseFilters(GoogleOAuthExceptionFilter)
  @UseGuards(GoogleGuard)
  // Passport issues the redirect to Google's consent screen; body never runs.
  // On failure (e.g. unconfigured) the filter redirects to the web login instead
  // of leaking API JSON to the browser.
  googleAuth(): void {}

  @Get('google/callback')
  @UseFilters(GoogleOAuthExceptionFilter)
  @UseGuards(GoogleGuard)
  async googleCallback(
    @Req() req: Request & { user: GoogleProfile },
    @Res() res: Response,
  ): Promise<void> {
    const { accessToken, refreshToken } = await this.auth.loginWithGoogle(req.user)
    this.setRefreshCookie(res, refreshToken)
    const webUrl = this.config.get<string>('WEB_URL', 'http://localhost:5173')
    res.redirect(`${webUrl}/auth/callback?accessToken=${encodeURIComponent(accessToken)}`)
  }

  /* ---------------------------------- me ---------------------------------- */

  @Get('me')
  @UseGuards(JwtGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.getMe(user.id)
  }

  @Patch('me/setting')
  @UseGuards(JwtGuard)
  updateSetting(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingDto) {
    return this.auth.updateSetting(user.id, dto)
  }

  /* --------------------------- account management ------------------------- */

  @Patch('me/profile')
  @UseGuards(JwtGuard)
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto)
  }

  @Post('me/change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const { refreshToken } = await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword)
    // Rotate the current device's session; other devices are signed out.
    this.setRefreshCookie(res, refreshToken)
    return { message: 'password-changed' }
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtGuard)
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteAccountDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const result = await this.auth.deleteAccount(user.id, dto.password)
    this.clearRefreshCookie(res)
    return result
  }

  /* ----------------------------- check username --------------------------- */

  // Throttled to blunt username enumeration (feeds credential-stuffing) while
  // still allowing a real user's debounced availability checks during signup.
  @Get('check-username/:username')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  checkUsername(@Param('username') username: string) {
    return this.auth.checkUsername(username)
  }
}
