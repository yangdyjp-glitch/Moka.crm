import { BadRequestException } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('请求内容格式不正确');
  }
  return value as Record<string, unknown>;
}

export function positiveId(value: unknown, label = 'ID'): number {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    !/^\d+$/.test(String(value))
  ) {
    throw new BadRequestException(`${label}必须是正整数`);
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
    throw new BadRequestException(`${label}超出允许范围`);
  }
  return id;
}

export function calendarDate(value: unknown, label: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`${label}必须为 YYYY-MM-DD`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    value < '1900-01-01' ||
    value > '2100-12-31'
  ) {
    throw new BadRequestException(`${label}必须是 1900 至 2100 年的真实日期`);
  }
  return date;
}

export function optionalDate(value: unknown, label: string): Date | null {
  return value === undefined || value === null || value === ''
    ? null
    : calendarDate(value, label);
}

export function textValue(
  value: unknown,
  label: string,
  max: number,
  required = false,
): string | null {
  if ((value === undefined || value === null) && !required) return null;
  if (typeof value !== 'string') {
    throw new BadRequestException(`${label}必须是文字`);
  }
  const text = value.trim();
  if ((required && !text) || text.length > max) {
    throw new BadRequestException(`${label}${required ? '不能为空，且' : ''}不能超过 ${max} 字`);
  }
  return text || null;
}

export function requestId(value: unknown): string {
  if (typeof value !== 'string' || !isUUID(value)) {
    throw new BadRequestException('requestId 必须是 UUID');
  }
  return value.toLowerCase();
}

export function filterQuery(value: unknown) {
  const q = objectBody(value ?? {});
  const page = q.page === undefined ? 1 : positiveId(q.page, '页码');
  const pageSize = q.pageSize === undefined ? 20 : positiveId(q.pageSize, '每页条数');
  if (page > 1000000 || pageSize > 100) {
    throw new BadRequestException('页码最多 1000000，每页条数最多 100');
  }
  const channelId = q.channelId === undefined || q.channelId === ''
    ? undefined
    : positiveId(q.channelId, '渠道 ID');
  const startDate = optionalDate(q.startDate, '开始日期') ?? undefined;
  const endDate = optionalDate(q.endDate, '结束日期') ?? undefined;
  if (startDate && endDate && endDate < startDate) {
    throw new BadRequestException('结束日期不能早于开始日期');
  }
  return { channelId, startDate, endDate, page, pageSize };
}

export function expenseAmount(value: unknown, currency: Currency): Prisma.Decimal {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new BadRequestException('费用金额格式不正确');
  }
  const raw = String(value);
  const pattern = currency === Currency.JPY ? /^\d{1,12}$/ : /^\d{1,12}(?:\.\d{1,2})?$/;
  if (!pattern.test(raw)) {
    throw new BadRequestException('金额最多 12 位整数；人民币最多两位小数，日元必须为整数');
  }
  const amount = new Prisma.Decimal(raw);
  if (!amount.isPositive() || amount.isZero()) {
    throw new BadRequestException('费用金额必须大于零');
  }
  return amount;
}

export function booleanFlag(value: unknown): boolean {
  if (value === true || value === 'true') return true;
  if (value === undefined || value === null || value === '' || value === false || value === 'false') {
    return false;
  }
  throw new BadRequestException('removeReceipt 必须为 true 或 false');
}

export interface ReceiptData {
  fileName: string;
  contentType: string;
  size: number;
  data: Buffer;
}

export function receiptFile(file: unknown): ReceiptData | null {
  if (file === undefined || file === null) return null;
  const uploaded = objectBody(file);
  const data = uploaded.buffer;
  if (!Buffer.isBuffer(data) || data.length === 0 || data.length > MAX_RECEIPT_BYTES) {
    throw new BadRequestException('凭证必须为非空文件，且不超过 5 MiB');
  }
  if (uploaded.size !== undefined && uploaded.size !== data.length) {
    throw new BadRequestException('凭证文件大小不匹配');
  }
  let contentType: string;
  let extension: string;
  if (
    data.length >= 4 &&
    data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff &&
    data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9
  ) {
    contentType = 'image/jpeg';
    extension = 'jpg';
  } else if (
    data.length >= 45 &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    data.readUInt32BE(8) === 13 && data.toString('ascii', 12, 16) === 'IHDR' &&
    data.readUInt32BE(16) > 0 && data.readUInt32BE(20) > 0 &&
    data.subarray(-12).equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]))
  ) {
    contentType = 'image/png';
    extension = 'png';
  } else if (
    data.length >= 20 && data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP' &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(data.toString('ascii', 12, 16)) &&
    data.readUInt32LE(4) + 8 === data.length
  ) {
    contentType = 'image/webp';
    extension = 'webp';
  } else if (
    /^%PDF-(?:1\.\d|2\.0)/.test(data.toString('ascii', 0, 8)) &&
    /%%EOF\s*$/.test(data.subarray(-1024).toString('ascii'))
  ) {
    contentType = 'application/pdf';
    extension = 'pdf';
  } else {
    throw new BadRequestException('凭证内容必须是完整的 JPG、PNG、WEBP 或 PDF 文件');
  }
  const original = typeof uploaded.originalname === 'string' ? uploaded.originalname : 'receipt';
  const base = original.replace(/\\/g, '/').split('/').pop() || 'receipt';
  const safeName = base.replace(/[\u0000-\u001f\u007f"<>:|?*]/g, '').replace(/\.[^.]*$/, '').trim();
  return {
    fileName: `${safeName.slice(0, 140) || 'receipt'}.${extension}`,
    contentType,
    size: data.length,
    data,
  };
}
