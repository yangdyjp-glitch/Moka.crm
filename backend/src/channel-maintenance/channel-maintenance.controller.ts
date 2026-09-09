import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Res,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { Response } from 'express';
import { Roles } from '../auth/roles.decorator';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ChannelMaintenanceService } from './channel-maintenance.service';
import { MAX_RECEIPT_BYTES } from './validation';

const uploadOptions = {
  limits: { fileSize: MAX_RECEIPT_BYTES, files: 1, fields: 12, fieldSize: 16 * 1024, parts: 13 },
};

@Controller('channel-maintenance')
@Roles(UserRole.ADMIN, UserRole.MARKET, UserRole.BUSINESS_SUPERVISOR)
export class ChannelMaintenanceController {
  constructor(private maintenance: ChannelMaintenanceService) {}

  @Get('channels')
  channels(@CurrentUser() user: AuthUser) {
    return this.maintenance.channels(user);
  }

  @Get('records')
  records(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    return this.maintenance.records(user, query);
  }

  @Post('records')
  createRecord(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    return this.maintenance.createRecord(user, body);
  }

  @Patch('records/:id')
  updateRecord(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() body: Record<string, unknown>) {
    return this.maintenance.updateRecord(user, id, body);
  }

  @Delete('records/:id')
  removeRecord(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.maintenance.removeRecord(user, id);
  }

  @Get('expenses')
  @Roles(UserRole.ADMIN)
  expenses(@CurrentUser() user: AuthUser, @Query() query: Record<string, unknown>) {
    return this.maintenance.expenses(user, query);
  }

  @Post('expenses')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  createExpense(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>, @UploadedFile() file?: unknown) {
    return this.maintenance.createExpense(user, body, file);
  }

  @Patch('expenses/:id')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  updateExpense(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @UploadedFile() file?: unknown,
  ) {
    return this.maintenance.updateExpense(user, id, body, file);
  }

  @Delete('expenses/:id')
  @Roles(UserRole.ADMIN)
  removeExpense(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number) {
    return this.maintenance.removeExpense(user, id);
  }

  @Get('expenses/:id/receipt')
  @Roles(UserRole.ADMIN)
  async receipt(@CurrentUser() user: AuthUser, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const receipt = await this.maintenance.receipt(user, id);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', receipt.contentType);
    res.attachment(receipt.fileName);
    res.setHeader('Content-Length', receipt.size);
    res.send(Buffer.from(receipt.data));
  }
}
