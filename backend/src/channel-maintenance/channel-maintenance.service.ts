import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChannelExpenseCategory,
  ChannelType,
  Currency,
  Prisma,
  UserRole,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/current-user.decorator';
import {
  booleanFlag,
  calendarDate,
  expenseAmount,
  filterQuery,
  objectBody,
  optionalDate,
  positiveId,
  receiptFile,
  ReceiptData,
  requestId,
  textValue,
} from './validation';

const channelSelect = { id: true, name: true, channelType: true } as const;
const userSelect = { id: true, name: true, username: true } as const;
const receiptSelect = {
  id: true, fileName: true, contentType: true, size: true, createdAt: true,
} as const;
const recordSelect = {
  id: true, channelId: true, maintainedAt: true, content: true,
  nextMaintenanceAt: true, createdById: true, createdAt: true, updatedAt: true,
  channel: { select: channelSelect }, createdBy: { select: userSelect },
} satisfies Prisma.ChannelMaintenanceRecordSelect;
const expenseSelect = {
  id: true, channelId: true, incurredAt: true, category: true, amount: true,
  currency: true, note: true, createdById: true, createdAt: true, updatedAt: true,
  channel: { select: channelSelect }, createdBy: { select: userSelect },
  receipt: { select: receiptSelect },
} satisfies Prisma.ChannelExpenseSelect;
type RecordRow = Prisma.ChannelMaintenanceRecordGetPayload<{ select: typeof recordSelect }>;
type ExpenseRow = Prisma.ChannelExpenseGetPayload<{ select: typeof expenseSelect }>;
type RecordInput = Pick<RecordRow, 'channelId' | 'maintainedAt' | 'content' | 'nextMaintenanceAt'>;
type ExpenseInput = Pick<ExpenseRow, 'channelId' | 'incurredAt' | 'category' | 'amount' | 'currency' | 'note'>;

@Injectable()
export class ChannelMaintenanceService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private assertMaintainer(user: AuthUser) {
    if (![UserRole.ADMIN, UserRole.MARKET, UserRole.BUSINESS_SUPERVISOR].some((role) => role === user.role)) {
      throw new ForbiddenException('无权使用渠道维护');
    }
  }

  private assertAdmin(user: AuthUser) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException('公关费用仅管理员可访问');
  }

  private channelScope(user: AuthUser): Prisma.ChannelWhereInput {
    this.assertMaintainer(user);
    return user.role === UserRole.ADMIN ? {} : { channelType: ChannelType.INDIVIDUAL };
  }

  private assertOwner(user: AuthUser, row: { createdById: number }) {
    if (user.role !== UserRole.ADMIN && row.createdById !== user.id) {
      throw new ForbiddenException('只能修改或删除自己录入的维护记录');
    }
  }

  private async editableChannel(tx: Prisma.TransactionClient, user: AuthUser, channelId: number) {
    const channel = await tx.channel.findFirst({
      where: { id: channelId, deletedAt: null, ...this.channelScope(user) },
      select: channelSelect,
    });
    if (!channel) throw new NotFoundException('渠道不存在、已删除或无权访问');
    return channel;
  }

  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private receiptFingerprint(receipt: ReceiptData | null) {
    return receipt ? {
      fileName: receipt.fileName, contentType: receipt.contentType, size: receipt.size,
      sha256: createHash('sha256').update(receipt.data).digest('hex'),
    } : null;
  }

  private receiptWrite(receipt: ReceiptData) {
    return { ...receipt, data: new Uint8Array(receipt.data) };
  }

  private async write<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>, retryUnique = false): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const retry = error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === 'P2034' || (retryUnique && error.code === 'P2002'));
        if (!retry) throw error;
        if (attempt === 2) throw new ConflictException('记录刚刚发生变化，请刷新后重试');
      }
    }
    throw new ConflictException('记录刚刚发生变化，请刷新后重试');
  }

  private log(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    relatedType: 'ChannelMaintenanceRecord' | 'ChannelExpense',
    relatedId: number,
    action: string,
    oldValue: unknown,
    newValue: unknown,
  ) {
    return this.audit.log({
      operatorId: user.id, relatedType, relatedId, action,
      oldValue: oldValue === null ? undefined : JSON.stringify(oldValue),
      newValue: newValue === null ? undefined : JSON.stringify(newValue),
      reason: user.impersonatorId ? `代理操作；原管理员 ID: ${user.impersonatorId}` : undefined,
    }, tx);
  }

  private recordInput(body: Record<string, unknown>, current?: RecordRow): RecordInput {
    const channelId = positiveId(body.channelId === undefined ? current?.channelId : body.channelId, '渠道 ID');
    const maintainedAt = body.maintainedAt === undefined && current
      ? current.maintainedAt : calendarDate(body.maintainedAt, '维护日期');
    const content = textValue(body.content === undefined ? current?.content : body.content, '维护内容', 4000, true);
    if (!content) throw new BadRequestException('维护内容不能为空');
    const nextMaintenanceAt = body.nextMaintenanceAt === undefined && current
      ? current.nextMaintenanceAt : optionalDate(body.nextMaintenanceAt, '下次维护日期');
    if (nextMaintenanceAt && nextMaintenanceAt < maintainedAt) {
      throw new BadRequestException('下次维护日期不能早于维护日期');
    }
    return { channelId, maintainedAt, content, nextMaintenanceAt };
  }

  private expenseInput(body: Record<string, unknown>, current?: ExpenseRow): ExpenseInput {
    const channelId = positiveId(body.channelId === undefined ? current?.channelId : body.channelId, '渠道 ID');
    const incurredAt = body.incurredAt === undefined && current
      ? current.incurredAt : calendarDate(body.incurredAt, '费用发生日期');
    const rawCategory = body.category === undefined ? current?.category : body.category;
    const category = Object.values(ChannelExpenseCategory).find((item) => item === rawCategory);
    if (!category) {
      throw new BadRequestException('费用类别必须为酒店、交通、伴手礼或宴请');
    }
    const currency = body.currency === undefined ? current?.currency : body.currency;
    if (currency !== Currency.CNY && currency !== Currency.JPY) {
      throw new BadRequestException('币种必须为 CNY 或 JPY');
    }
    const amount = expenseAmount(body.amount === undefined ? current?.amount.toString() : body.amount, currency);
    const note = textValue(body.note === undefined ? current?.note : body.note, '费用备注', 2000);
    return { channelId, incurredAt, category, amount, currency, note };
  }

  private expenseResponse(row: ExpenseRow) {
    return { ...row, amount: row.amount.toString() };
  }

  channels(user: AuthUser) {
    return this.prisma.channel.findMany({
      where: { deletedAt: null, ...this.channelScope(user) },
      select: channelSelect, orderBy: { id: 'desc' },
    });
  }

  async records(user: AuthUser, query: unknown) {
    this.assertMaintainer(user);
    const q = filterQuery(query);
    const where: Prisma.ChannelMaintenanceRecordWhereInput = {
      deletedAt: null, channelId: q.channelId, channel: this.channelScope(user),
      maintainedAt: { gte: q.startDate, lte: q.endDate },
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.channelMaintenanceRecord.findMany({
        where, select: recordSelect, orderBy: [{ maintainedAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize, take: q.pageSize,
      }),
      this.prisma.channelMaintenanceRecord.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { rows, total, page: q.page, pageSize: q.pageSize };
  }

  async createRecord(user: AuthUser, value: unknown) {
    this.assertMaintainer(user);
    const body = objectBody(value);
    const data = this.recordInput(body);
    const key = requestId(body.requestId);
    const requestHash = this.hash({ userId: user.id, ...data });
    return this.write(async (tx) => {
      const existing = await tx.channelMaintenanceRecord.findUnique({ where: { requestId: key } });
      if (existing) {
        if (existing.requestHash !== requestHash || existing.createdById !== user.id || existing.deletedAt) {
          throw new ConflictException('该请求标识已被使用或记录已删除，请刷新后重试');
        }
        const row = await tx.channelMaintenanceRecord.findFirst({
          where: { id: existing.id, deletedAt: null, channel: this.channelScope(user) }, select: recordSelect,
        });
        if (!row) throw new NotFoundException('维护记录不存在或无权访问');
        return row;
      }
      await this.editableChannel(tx, user, data.channelId);
      const row = await tx.channelMaintenanceRecord.create({
        data: { ...data, createdById: user.id, requestId: key, requestHash }, select: recordSelect,
      });
      await this.log(tx, user, 'ChannelMaintenanceRecord', row.id, 'CREATE', null, row);
      return row;
    }, true);
  }

  async updateRecord(user: AuthUser, idValue: number, value: unknown) {
    this.assertMaintainer(user);
    const id = positiveId(idValue);
    const body = objectBody(value);
    return this.write(async (tx) => {
      const current = await tx.channelMaintenanceRecord.findFirst({
        where: { id, deletedAt: null, channel: this.channelScope(user) }, select: recordSelect,
      });
      if (!current) throw new NotFoundException('维护记录不存在或无权访问');
      this.assertOwner(user, current);
      // Historical records remain readable, but deleted channels cannot be edited or reassigned.
      await this.editableChannel(tx, user, current.channelId);
      const data = this.recordInput(body, current);
      if (data.channelId !== current.channelId) await this.editableChannel(tx, user, data.channelId);
      const row = await tx.channelMaintenanceRecord.update({ where: { id }, data, select: recordSelect });
      await this.log(tx, user, 'ChannelMaintenanceRecord', id, 'UPDATE', current, row);
      return row;
    });
  }

  async removeRecord(user: AuthUser, idValue: number) {
    this.assertMaintainer(user);
    const id = positiveId(idValue);
    return this.write(async (tx) => {
      const current = await tx.channelMaintenanceRecord.findFirst({
        where: { id, deletedAt: null, channel: this.channelScope(user) }, select: recordSelect,
      });
      if (!current) throw new NotFoundException('维护记录不存在或无权访问');
      this.assertOwner(user, current);
      const result = await tx.channelMaintenanceRecord.update({
        where: { id }, data: { deletedAt: new Date() }, select: { id: true, deletedAt: true },
      });
      await this.log(tx, user, 'ChannelMaintenanceRecord', id, 'DELETE', current, result);
      return result;
    });
  }

  async expenses(user: AuthUser, query: unknown) {
    this.assertAdmin(user);
    const q = filterQuery(query);
    const where: Prisma.ChannelExpenseWhereInput = {
      deletedAt: null, channelId: q.channelId, incurredAt: { gte: q.startDate, lte: q.endDate },
    };
    const summaryQuery = this.prisma.channelExpense.groupBy({
      by: ['currency'], where, _sum: { amount: true }, orderBy: { currency: 'asc' },
    });
    const [rows, total, sums] = await this.prisma.$transaction([
      this.prisma.channelExpense.findMany({
        where, select: expenseSelect, orderBy: [{ incurredAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize, take: q.pageSize,
      }),
      this.prisma.channelExpense.count({ where }),
      summaryQuery,
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const summary = { CNY: '0', JPY: '0' };
    for (const sum of sums) summary[sum.currency] = sum._sum.amount?.toString() ?? '0';
    return { rows: rows.map((row) => this.expenseResponse(row)), total, page: q.page, pageSize: q.pageSize, summary };
  }

  async createExpense(user: AuthUser, value: unknown, file?: unknown) {
    this.assertAdmin(user);
    const body = objectBody(value);
    if (booleanFlag(body.removeReceipt)) throw new BadRequestException('新增费用不能移除凭证');
    const data = this.expenseInput(body);
    const key = requestId(body.requestId);
    const receipt = receiptFile(file);
    const requestHash = this.hash({
      userId: user.id, ...data, amount: data.amount.toFixed(2), receipt: this.receiptFingerprint(receipt),
    });
    return this.write(async (tx) => {
      const existing = await tx.channelExpense.findUnique({ where: { requestId: key } });
      if (existing) {
        if (existing.requestHash !== requestHash || existing.createdById !== user.id || existing.deletedAt) {
          throw new ConflictException('该请求标识已被使用或记录已删除，请刷新后重试');
        }
        const row = await tx.channelExpense.findFirst({ where: { id: existing.id, deletedAt: null }, select: expenseSelect });
        if (!row) throw new NotFoundException('费用不存在');
        return this.expenseResponse(row);
      }
      await this.editableChannel(tx, user, data.channelId);
      const row = await tx.channelExpense.create({
        data: {
          ...data, createdById: user.id, requestId: key, requestHash,
          receipt: receipt ? { create: this.receiptWrite(receipt) } : undefined,
        }, select: expenseSelect,
      });
      await this.log(tx, user, 'ChannelExpense', row.id, 'CREATE', null, this.expenseResponse(row));
      return this.expenseResponse(row);
    }, true);
  }

  async updateExpense(user: AuthUser, idValue: number, value: unknown, file?: unknown) {
    this.assertAdmin(user);
    const id = positiveId(idValue);
    const body = objectBody(value);
    const receipt = receiptFile(file);
    const removeReceipt = booleanFlag(body.removeReceipt);
    if (receipt && removeReceipt) throw new BadRequestException('不能同时上传和移除凭证');
    return this.write(async (tx) => {
      const current = await tx.channelExpense.findFirst({ where: { id, deletedAt: null }, select: expenseSelect });
      if (!current) throw new NotFoundException('费用不存在');
      await this.editableChannel(tx, user, current.channelId);
      const data = this.expenseInput(body, current);
      if (data.channelId !== current.channelId) await this.editableChannel(tx, user, data.channelId);
      if (removeReceipt) await tx.channelExpenseReceipt.deleteMany({ where: { expenseId: id } });
      if (receipt) {
        const stored = this.receiptWrite(receipt);
        await tx.channelExpenseReceipt.upsert({
          where: { expenseId: id }, create: { expenseId: id, ...stored },
          update: { ...stored, createdAt: new Date() }, select: receiptSelect,
        });
      }
      const row = await tx.channelExpense.update({ where: { id }, data, select: expenseSelect });
      await this.log(tx, user, 'ChannelExpense', id, 'UPDATE', this.expenseResponse(current), this.expenseResponse(row));
      return this.expenseResponse(row);
    });
  }

  async removeExpense(user: AuthUser, idValue: number) {
    this.assertAdmin(user);
    const id = positiveId(idValue);
    return this.write(async (tx) => {
      const current = await tx.channelExpense.findFirst({ where: { id, deletedAt: null }, select: expenseSelect });
      if (!current) throw new NotFoundException('费用不存在');
      const result = await tx.channelExpense.update({
        where: { id }, data: { deletedAt: new Date() }, select: { id: true, deletedAt: true },
      });
      await this.log(tx, user, 'ChannelExpense', id, 'DELETE', this.expenseResponse(current), result);
      return result;
    });
  }

  async receipt(user: AuthUser, idValue: number) {
    this.assertAdmin(user);
    const id = positiveId(idValue);
    const receipt = await this.prisma.channelExpenseReceipt.findFirst({
      where: { expenseId: id, expense: { deletedAt: null } },
      select: { ...receiptSelect, data: true },
    });
    if (!receipt) throw new NotFoundException('凭证不存在或费用已删除');
    return receipt;
  }
}
