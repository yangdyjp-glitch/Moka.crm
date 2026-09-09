import { useCallback, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Form, Input, Modal, Result, Select, Space, Table, Tabs, Typography, Upload, message } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import client, { downloadFile } from '../api/client'
import { getErrorMessage } from '../api/errors'
import {
  EXPENSE_CATEGORY_LABEL, amountError, amountInputValue, expensePayload, formatMaintenanceAmount, isCalendarDate, receiptError, recordPayload,
} from '../api/channelMaintenance'
import type {
  ExpensePage, ExpenseValues, MaintenanceChannel, MaintenanceExpense, MaintenanceFilters, MaintenancePage,
  MaintenanceRecord, RecordValues,
} from '../api/channelMaintenance'
import { useAuth } from '../auth/AuthContext'
import { ActionBtn, DeleteBtn } from '../components/Actions'
import { useRemoteData } from '../hooks/useRemoteData'

const PAGE_SIZE = 20
const EMPTY_RECORDS: MaintenancePage<MaintenanceRecord> = { rows: [], total: 0, page: 1, pageSize: PAGE_SIZE }
const EMPTY_EXPENSES: ExpensePage = { rows: [], total: 0, page: 1, pageSize: PAGE_SIZE, summary: { CNY: '0', JPY: '0' } }
const BASE = '/channel-maintenance'
const dateOnly = (date: string | null) => date ? date.slice(0, 10) : '—'
const calendarRule = {
  validator: (_: unknown, value?: string) => !value || isCalendarDate(value)
    ? Promise.resolve() : Promise.reject(new Error('请输入有效日期')),
}

async function loadChannels() {
  return (await client.get<MaintenanceChannel[]>(`${BASE}/channels`, { noCache: true })).data
}

function channelOptions(channels: MaintenanceChannel[], current?: MaintenanceChannel) {
  const available = current && !channels.some((channel) => channel.id === current.id) ? [...channels, current] : channels
  return available.map((channel) => ({ value: channel.id, label: channel.name }))
}

function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  return error ? <Alert type="error" showIcon title={getErrorMessage(error, '数据加载失败，请重试')}
    action={<Button size="small" onClick={retry}>重试</Button>} style={{ marginBottom: 12 }} /> : null
}

export default function ChannelMaintenance() {
  const { user } = useAuth()
  if (!user || !['ADMIN', 'MARKET', 'BUSINESS_SUPERVISOR'].includes(user.role)) {
    return <Result status="403" title="无权访问渠道维护" extra={<Link to="/">返回仪表盘</Link>} />
  }
  return <MaintenanceContent key={`${user.id}:${user.role}`} isAdmin={user.role === 'ADMIN'} userId={user.id} />
}

function MaintenanceContent({ isAdmin, userId }: { isAdmin: boolean; userId: number }) {
  const channels = useRemoteData(loadChannels, [])
  const [tab, setTab] = useState('records')
  const [draft, setDraft] = useState<MaintenanceFilters>({})
  const [filters, setFilters] = useState<MaintenanceFilters>({})
  const [filterError, setFilterError] = useState('')
  const applyFilters = () => {
    if ((draft.startDate && !isCalendarDate(draft.startDate)) || (draft.endDate && !isCalendarDate(draft.endDate))) {
      setFilterError('请输入有效的筛选日期')
      return
    }
    if (draft.startDate && draft.endDate && draft.startDate > draft.endDate) {
      setFilterError('开始日期不能晚于结束日期')
      return
    }
    setFilterError('')
    setFilters({ ...draft })
  }
  const resetFilters = () => { setDraft({}); setFilters({}); setFilterError('') }
  const filterKey = JSON.stringify(filters)
  return <div>
    <Space wrap style={{ marginBottom: 16 }}>
      <Select aria-label="筛选渠道" placeholder="全部渠道" allowClear showSearch optionFilterProp="label"
        style={{ width: 230 }} value={draft.channelId} loading={channels.loading}
        options={channelOptions(channels.data)} onChange={(channelId?: number) => setDraft({ ...draft, channelId })} />
      <label>开始日期 <Input aria-label="开始日期" type="date" style={{ width: 155 }} value={draft.startDate ?? ''}
        onChange={(event) => setDraft({ ...draft, startDate: event.target.value || undefined })} /></label>
      <label>结束日期 <Input aria-label="结束日期" type="date" style={{ width: 155 }} value={draft.endDate ?? ''}
        onChange={(event) => setDraft({ ...draft, endDate: event.target.value || undefined })} /></label>
      <Button type="primary" onClick={applyFilters}>查询</Button>
      <Button onClick={resetFilters}>重置</Button>
    </Space>
    {filterError && <Alert type="warning" showIcon title={filterError} style={{ marginBottom: 12 }} />}
    <LoadError error={channels.error} retry={channels.reload} />
    {!channels.loading && !channels.error && channels.data.length === 0 && <Alert type="info" showIcon
      title={<>暂无可用渠道，请先到 <Link to="/channels">渠道管理</Link> 建档，再登记维护或费用。</>}
      style={{ marginBottom: 12 }} />}
    <Tabs activeKey={tab} onChange={setTab} destroyOnHidden items={[
      { key: 'records', label: '维护记录', children: tab === 'records' && <RecordsTab key={filterKey}
        filters={filters} channels={channels.data} isAdmin={isAdmin} userId={userId} /> },
      ...(isAdmin ? [{ key: 'expenses', label: '公关费用', children: tab === 'expenses' && <ExpensesTab key={filterKey}
        filters={filters} channels={channels.data} /> }] : []),
    ]} />
  </div>
}

interface RecordsTabProps {
  filters: MaintenanceFilters
  channels: MaintenanceChannel[]
  isAdmin: boolean
  userId: number
}

function RecordsTab({ filters, channels, isAdmin, userId }: RecordsTabProps) {
  const [page, setPage] = useState(1)
  const loader = useCallback(async () => (await client.get<MaintenancePage<MaintenanceRecord>>(`${BASE}/records`, {
    params: { ...filters, page, pageSize: PAGE_SIZE }, noCache: true,
  })).data, [filters, page])
  const result = useRemoteData(loader, EMPTY_RECORDS)
  const [editor, setEditor] = useState<{ key: string; record?: MaintenanceRecord } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const deleteLock = useRef(false)
  const remove = async (record: MaintenanceRecord) => {
    if (deleteLock.current) return
    deleteLock.current = true
    setDeleting(true)
    try {
      await client.delete(`${BASE}/records/${record.id}`)
      message.success('维护记录已删除')
      if (result.data.rows.length === 1 && page > 1) setPage(page - 1)
      else result.reload()
    } catch (error) { message.error(getErrorMessage(error, '删除失败，请重试')) }
    finally { deleteLock.current = false; setDeleting(false) }
  }
  return <>
    <Button type="primary" disabled={!channels.length || deleting} style={{ marginBottom: 12 }}
      onClick={() => setEditor({ key: crypto.randomUUID() })}>新增维护记录</Button>
    <LoadError error={result.error} retry={result.reload} />
    <Table<MaintenanceRecord> rowKey="id" size="small" scroll={{ x: 1000 }} loading={result.loading}
      dataSource={result.data.rows} pagination={{ current: page, pageSize: PAGE_SIZE, total: result.data.total,
        showSizeChanger: false, onChange: setPage, showTotal: (total) => `共 ${total} 条` }} columns={[
        { title: '日期', dataIndex: 'maintainedAt', width: 115, render: dateOnly },
        { title: '渠道', width: 180, render: (_, row) => row.channel.name },
        { title: '内容', dataIndex: 'content', width: 300, render: (value: string) => <span style={{ whiteSpace: 'pre-wrap' }}>{value}</span> },
        { title: '下次联系', dataIndex: 'nextMaintenanceAt', width: 115, render: dateOnly },
        { title: '记录人', width: 110, render: (_, row) => row.createdBy?.name || row.createdBy?.username || '—' },
        { title: '操作', width: 150, render: (_, row) => (isAdmin || row.createdBy?.id === userId) ? <Space>
          <ActionBtn tone="edit" disabled={deleting} onClick={() => setEditor({ key: crypto.randomUUID(), record: row })}>编辑</ActionBtn>
          <DeleteBtn disabled={deleting} title="确认删除这条维护记录？" onConfirm={() => void remove(row)} />
        </Space> : null },
      ]} />
    {editor && <RecordEditor key={editor.key} requestId={editor.key} record={editor.record} channels={channels}
      onClose={() => setEditor(null)} onSaved={() => { setEditor(null); result.reload() }} />}
  </>
}

function RecordEditor({ record, requestId, channels, onClose, onSaved }: {
  record?: MaintenanceRecord
  requestId: string
  channels: MaintenanceChannel[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form] = Form.useForm<RecordValues>()
  const [saving, setSaving] = useState(false)
  const saveLock = useRef(false)
  const save = async (values: RecordValues) => {
    if (saveLock.current) return
    saveLock.current = true
    setSaving(true)
    try {
      const payload = recordPayload(values, record ? undefined : requestId)
      if (record) await client.patch(`${BASE}/records/${record.id}`, payload)
      else await client.post(`${BASE}/records`, payload)
      message.success('维护记录已保存')
      onSaved()
    } catch (error) { message.error(getErrorMessage(error, '保存失败，请重试')) }
    finally { saveLock.current = false; setSaving(false) }
  }
  return <Modal open title={record ? '编辑维护记录' : '新增维护记录'} okText="保存" cancelText="取消"
    onOk={() => form.submit()} onCancel={onClose} confirmLoading={saving} maskClosable={false} keyboard={!saving}
    closable={!saving} cancelButtonProps={{ disabled: saving }}>
    <Form form={form} name="maintenance_record" layout="vertical" onFinish={save} disabled={saving}
      initialValues={record ? { channelId: record.channelId, maintainedAt: dateOnly(record.maintainedAt),
        content: record.content, nextMaintenanceAt: record.nextMaintenanceAt ? dateOnly(record.nextMaintenanceAt) : '' }
        : { maintainedAt: dayjs().format('YYYY-MM-DD') }}>
      <Form.Item name="channelId" label="渠道" rules={[{ required: true, message: '请选择渠道' }]}>
        <Select showSearch optionFilterProp="label" placeholder="请选择渠道" options={channelOptions(channels, record?.channel)} />
      </Form.Item>
      <Form.Item name="maintainedAt" label="维护日期" rules={[{ required: true, message: '请选择维护日期' }, calendarRule]}>
        <Input type="date" />
      </Form.Item>
      <Form.Item name="content" label="维护内容" rules={[{ required: true, whitespace: true, message: '请填写维护内容' }]}>
        <Input.TextArea rows={4} maxLength={4000} showCount />
      </Form.Item>
      <Form.Item name="nextMaintenanceAt" label="下次联系日期（可选，清空即移除）" dependencies={['maintainedAt']}
        rules={[calendarRule, ({ getFieldValue }) => ({ validator: (_: unknown, value?: string) =>
          !value || value >= getFieldValue('maintainedAt') ? Promise.resolve() : Promise.reject(new Error('下次联系日期不能早于维护日期')),
        })]}>
        <Input type="date" />
      </Form.Item>
    </Form>
  </Modal>
}

function ExpensesTab({ filters, channels }: { filters: MaintenanceFilters; channels: MaintenanceChannel[] }) {
  const [page, setPage] = useState(1)
  const loader = useCallback(async () => (await client.get<ExpensePage>(`${BASE}/expenses`, {
    params: { ...filters, page, pageSize: PAGE_SIZE }, noCache: true,
  })).data, [filters, page])
  const result = useRemoteData(loader, EMPTY_EXPENSES)
  const [editor, setEditor] = useState<{ key: string; expense?: MaintenanceExpense } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [downloading, setDownloading] = useState<number | null>(null)
  const deleteLock = useRef(false)
  const remove = async (expense: MaintenanceExpense) => {
    if (deleteLock.current) return
    deleteLock.current = true
    setDeleting(true)
    try {
      await client.delete(`${BASE}/expenses/${expense.id}`)
      message.success('公关费用已删除')
      if (result.data.rows.length === 1 && page > 1) setPage(page - 1)
      else result.reload()
    } catch (error) { message.error(getErrorMessage(error, '删除失败，请重试')) }
    finally { deleteLock.current = false; setDeleting(false) }
  }
  const download = async (expense: MaintenanceExpense) => {
    if (!expense.receipt || downloading !== null) return
    setDownloading(expense.id)
    try { await downloadFile(`${BASE}/expenses/${expense.id}/receipt`, expense.receipt.fileName) }
    catch (error) { message.error(getErrorMessage(error, '凭证下载失败，请检查权限后重试')) }
    finally { setDownloading(null) }
  }
  return <>
    <Space wrap style={{ marginBottom: 12 }}>
      <Button type="primary" disabled={!channels.length || deleting} onClick={() => setEditor({ key: crypto.randomUUID() })}>登记公关费用</Button>
      <Typography.Text type="secondary">保存即计入费用；不进入审批或报销流程。</Typography.Text>
    </Space>
    <LoadError error={result.error} retry={result.reload} />
    <div style={{ background: '#f8eef6', border: '1px solid #d8c07c', padding: '12px 16px', marginBottom: 16 }}>
      <Space wrap size="large">
        <b>筛选范围合计（全部页）</b>
        <span>CNY <b>{result.loading || result.error ? '—' : formatMaintenanceAmount(result.data.summary.CNY, 'CNY')}</b></span>
        <span>JPY <b>{result.loading || result.error ? '—' : formatMaintenanceAmount(result.data.summary.JPY, 'JPY')}</b></span>
      </Space>
    </div>
    <Table<MaintenanceExpense> rowKey="id" size="small" scroll={{ x: 1150 }} loading={result.loading}
      dataSource={result.data.rows} pagination={{ current: page, pageSize: PAGE_SIZE, total: result.data.total,
        showSizeChanger: false, onChange: setPage, showTotal: (total) => `共 ${total} 条` }} columns={[
        { title: '日期', dataIndex: 'incurredAt', width: 115, render: dateOnly },
        { title: '渠道', width: 180, render: (_, row) => row.channel.name },
        { title: '类别', dataIndex: 'category', width: 90, render: (category: MaintenanceExpense['category']) => EXPENSE_CATEGORY_LABEL[category] },
        { title: '金额', width: 145, align: 'right', render: (_, row) => `${row.currency} ${formatMaintenanceAmount(row.amount, row.currency)}` },
        { title: '说明', dataIndex: 'note', width: 240, render: (value: string | null) => <span style={{ whiteSpace: 'pre-wrap' }}>{value || '—'}</span> },
        { title: '记录人', width: 110, render: (_, row) => row.createdBy?.name || row.createdBy?.username || '—' },
        { title: '凭证', width: 180, render: (_, row) => row.receipt ? <Button type="link" size="small"
          style={{ maxWidth: 175, whiteSpace: 'normal', height: 'auto', textAlign: 'left' }}
          loading={downloading === row.id} disabled={downloading !== null} onClick={() => void download(row)}>{row.receipt.fileName}</Button> : '—' },
        { title: '操作', width: 145, render: (_, row) => <Space>
          <ActionBtn tone="edit" disabled={deleting} onClick={() => setEditor({ key: crypto.randomUUID(), expense: row })}>编辑</ActionBtn>
          <DeleteBtn disabled={deleting} title="确认删除这笔公关费用？删除后合计将更新。" onConfirm={() => void remove(row)} />
        </Space> },
      ]} />
    {editor && <ExpenseEditor key={editor.key} requestId={editor.key} expense={editor.expense} channels={channels}
      onClose={() => setEditor(null)} onSaved={() => { setEditor(null); result.reload() }} />}
  </>
}

function ExpenseEditor({ expense, requestId, channels, onClose, onSaved }: {
  expense?: MaintenanceExpense
  requestId: string
  channels: MaintenanceChannel[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form] = Form.useForm<ExpenseValues>()
  const [saving, setSaving] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [removeReceipt, setRemoveReceipt] = useState(false)
  const saveLock = useRef(false)
  const currency = Form.useWatch('currency', form) ?? expense?.currency ?? 'JPY'
  const save = async (values: ExpenseValues) => {
    if (saveLock.current) return
    saveLock.current = true
    setSaving(true)
    try {
      const payload = expensePayload(values, { file, removeReceipt, requestId: expense ? undefined : requestId })
      if (expense) await client.patch(`${BASE}/expenses/${expense.id}`, payload)
      else await client.post(`${BASE}/expenses`, payload)
      message.success('公关费用已保存')
      onSaved()
    } catch (error) { message.error(getErrorMessage(error, '保存失败，请重试；请勿重复新建')) }
    finally { saveLock.current = false; setSaving(false) }
  }
  return <Modal open title={expense ? '编辑公关费用' : '登记公关费用'} okText="保存" cancelText="取消"
    onOk={() => form.submit()} onCancel={onClose} confirmLoading={saving} maskClosable={false} keyboard={!saving}
    closable={!saving} cancelButtonProps={{ disabled: saving }}>
    <Form form={form} name="maintenance_expense" layout="vertical" onFinish={save} disabled={saving}
      initialValues={expense ? { channelId: expense.channelId, incurredAt: dateOnly(expense.incurredAt),
        category: expense.category, amount: amountInputValue(expense.amount, expense.currency), currency: expense.currency, note: expense.note ?? '' }
        : { incurredAt: dayjs().format('YYYY-MM-DD'), currency: 'JPY' }}>
      <Form.Item name="channelId" label="渠道" rules={[{ required: true, message: '请选择渠道' }]}>
        <Select showSearch optionFilterProp="label" placeholder="请选择渠道" options={channelOptions(channels, expense?.channel)} />
      </Form.Item>
      <Form.Item name="incurredAt" label="费用日期" rules={[{ required: true, message: '请选择费用日期' }, calendarRule]}>
        <Input type="date" />
      </Form.Item>
      <Form.Item name="category" label="类别" rules={[{ required: true, message: '请选择费用类别' }]}>
        <Select placeholder="请选择类别" options={Object.entries(EXPENSE_CATEGORY_LABEL).map(([value, label]) => ({ value, label }))} />
      </Form.Item>
      <Space align="start">
        <Form.Item name="currency" label="币种" rules={[{ required: true }]}>
          <Select style={{ width: 130 }} options={[{ value: 'CNY', label: 'CNY 人民币' }, { value: 'JPY', label: 'JPY 日元' }]} />
        </Form.Item>
        <Form.Item name="amount" label="金额" dependencies={['currency']}
          rules={[{ required: true, message: '请填写金额' }, ({ getFieldValue }) => ({
            validator: (_: unknown, value?: string) => {
              if (!value) return Promise.resolve()
              const error = amountError(value, getFieldValue('currency'))
              return error ? Promise.reject(new Error(error)) : Promise.resolve()
            },
          })]}>
          <Input inputMode={currency === 'JPY' ? 'numeric' : 'decimal'} placeholder={currency === 'JPY' ? '正整数' : '最多两位小数'} maxLength={20} />
        </Form.Item>
      </Space>
      <Form.Item name="note" label="说明（可选）"><Input.TextArea rows={3} maxLength={2000} showCount /></Form.Item>
      <Form.Item label="凭证（可选）" extra="单个 PNG、JPG、WebP 或 PDF，最多 5 MiB；点击保存后上传。">
        {expense?.receipt && <div style={{ marginBottom: 8 }}>
          <Typography.Text>原凭证：{expense.receipt.fileName}{file ? '（保存后替换）' : removeReceipt ? '（保存后移除）' : '（保留）'}</Typography.Text>
          <br /><Checkbox checked={removeReceipt} disabled={saving || !!file} onChange={(event) => setRemoveReceipt(event.target.checked)}>移除原有凭证</Checkbox>
        </div>}
        <Upload accept=".png,.jpg,.jpeg,.webp,.pdf" maxCount={1} disabled={saving}
          fileList={file ? [{ uid: 'selected-receipt', name: file.name, status: 'done' }] : []}
          beforeUpload={(candidate) => {
            const error = receiptError(candidate)
            if (error) { message.error(error); return Upload.LIST_IGNORE }
            setFile(candidate)
            setRemoveReceipt(false)
            return false
          }} onRemove={() => { setFile(null); return true }}>
          <Button icon={<UploadOutlined />}>{expense?.receipt ? '选择替换凭证' : '选择凭证'}</Button>
        </Upload>
      </Form.Item>
    </Form>
  </Modal>
}
