import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Upload,
  message,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { ActionBtn, DeleteBtn } from '../components/Actions'
import { COL, scrollTableProps } from '../components/tableLayout'
import client, { downloadFile } from '../api/client'
import { apiErrorMessage } from '../api/errors'
import { useAuth } from '../auth/AuthContext'
import {
  loadAcqChannels,
  loadChannelOptions,
  loadUserOptions,
} from '../api/options'
import {
  CUSTOMER_STATUS_LABEL,
  CUSTOMER_STATUS_STYLE,
  INTENTION_LABEL,
  SOURCE_LABEL,
  fmtDate,
  todayDate,
} from '../api/types'

type SourceCategory =
  | 'SELF'
  | 'INDIVIDUAL_THIRD_PARTY'
  | 'ENTERPRISE_THIRD_PARTY'

interface ChannelReference {
  id: number
  name: string
  channelType?: string
}

interface CustomerRow {
  id: number
  customerNo: string
  name: string
  sourceCategory: SourceCategory
  mainStatus: string
  intentionLevel?: string | null
  discoveredAt?: string | null
  createdAt: string
  ownerUserId?: number | null
  ownerName?: string | null
  channel?: ChannelReference | null
  acquisitionChannel?: ChannelReference | null
}

interface CustomerListResponse {
  items: CustomerRow[]
  total: number
}

interface NamedOption {
  id: number
  name: string
}

interface ChannelOption extends NamedOption {
  channelType: string
}

interface CustomerFormValues {
  name: string
  phone?: string
  wechat?: string
  email?: string
  sourceCategory: SourceCategory
  channelId?: number
  acquisitionChannelId?: number
  ownerUserId?: number
  intentionLevel?: string | null
  mainStatus: string
  discoveredAt?: string
  remark?: string
}

interface CustomerUpdatePayload {
  name?: string
  intentionLevel: string | null
  mainStatus: string
  sourceCategory: SourceCategory
  channelId: number | null
  acquisitionChannelId: number | null
  discoveredAt?: string
}

interface DuplicateCustomer {
  name?: string
}

interface CustomerErrorBody {
  message?: string | string[]
  duplicates?: DuplicateCustomer[]
}

interface ImportSummary {
  success: number
  duplicates: number
  failed: number
}

const UNASSIGNED_FILTER = '__UNASSIGNED__'
const customerStatusCssVars = (status: string) => {
  const style = CUSTOMER_STATUS_STYLE[status]
  return {
    '--customer-status-color': style.color,
    '--customer-status-bg': style.backgroundColor,
    '--customer-status-border': style.borderColor,
    '--ant-select-background-color': style.backgroundColor,
    '--ant-select-border-color': style.borderColor,
  } as CSSProperties
}
const customerStatusOptions = Object.entries(CUSTOMER_STATUS_LABEL).map(([value, label]) => ({
  value,
  label: <span className="customer-status-option" style={customerStatusCssVars(value)}>{label}</span>,
}))

function sourceChannelLabel(r: CustomerRow) {
  const channelName = r.channel?.name || r.acquisitionChannel?.name
  return `${SOURCE_LABEL[r.sourceCategory] || ''}${channelName ? '：' + channelName : ''}` || '—'
}

function uniqueFilters<Row>(
  rows: Row[],
  getLabel: (row: Row) => string,
  getValue: (row: Row) => string = getLabel,
) {
  const seen = new Map<string, string>()
  rows.forEach((row) => {
    const label = getLabel(row) || '—'
    const value = getValue(row) || label
    if (!seen.has(value)) seen.set(value, label)
  })
  return Array.from(seen.entries())
    .sort(([, a], [, b]) => a.localeCompare(b, 'zh-CN'))
    .map(([value, label]) => ({ text: label, value }))
}

export default function Customers() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [data, setData] = useState<CustomerListResponse>({ items: [], total: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [assignTarget, setAssignTarget] = useState<CustomerRow | null>(null)
  const [form] = Form.useForm<CustomerFormValues>()
  const [sourceCat, setSourceCat] = useState<SourceCategory>('SELF')
  const [channels, setChannels] = useState<ChannelOption[]>([])
  const [acq, setAcq] = useState<NamedOption[]>([])
  const [sales, setSales] = useState<NamedOption[]>([])
  const [editCust, setEditCust] = useState<CustomerRow | null>(null)
  const [editForm] = Form.useForm<CustomerFormValues>()
  const [editSourceCat, setEditSourceCat] = useState<SourceCategory>('SELF')
  const [inlineUpdatingId, setInlineUpdatingId] = useState<number | null>(null)

  const canCreate = user?.role === 'MARKET' || user?.role === 'BUSINESS_SUPERVISOR' || user?.role === 'ADMIN'
  const canEditCustomerName = user?.role === 'BUSINESS_SUPERVISOR' || user?.role === 'ADMIN'

  const reload = () => {
    setLoading(true)
    setReloadKey((key) => key + 1)
  }

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    client
      .get<CustomerListResponse>('/customers', {
        params: { all: 1, search: search || undefined },
        signal: controller.signal,
      })
      .then((response) => {
        if (active) setData(response.data)
      })
      .catch((error: unknown) => {
        if (active) message.error(apiErrorMessage(error, '客户数据加载失败'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [reloadKey, search])

  const openCreate = async () => {
    form.resetFields()
    form.setFieldsValue({ sourceCategory: 'SELF', discoveredAt: todayDate() })
    setSourceCat('SELF')
    setChannels(await loadChannelOptions().catch(() => []))
    setAcq(await loadAcqChannels().catch(() => []))
    setSales(await loadUserOptions('SALES').catch(() => []))
    setModalOpen(true)
  }

  const submitCreate = async (force = false) => {
    const v = await form.validateFields()
    setSubmitting(true)
    try {
      await client.post('/customers', { ...v, force })
      message.success('已创建')
      setModalOpen(false)
      reload()
    } catch (error: unknown) {
      const response = axios.isAxiosError<CustomerErrorBody>(error)
        ? error.response
        : undefined
      if (response?.status === 409) {
        const duplicates = response.data?.duplicates ?? []
        Modal.confirm({
          title: '疑似重复客户',
          content: `已存在 ${duplicates.length} 个匹配（${duplicates.map((duplicate) => duplicate.name || '未命名').join('、')}），仍要创建吗？`,
          okText: '仍然创建',
          onOk: () => submitCreate(true),
        })
      } else {
        message.error(apiErrorMessage(error, '创建失败'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const doAssign = async (ownerUserId: number) => {
    if (!assignTarget) return
    await client.post(`/customers/${assignTarget.id}/assign`, { ownerUserId })
    message.success('已指派')
    setAssignTarget(null)
    reload()
  }

  const doDelete = async (id: number) => {
    try {
      await client.delete(`/customers/${id}`)
      message.success('已删除')
      reload()
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, '删除失败'))
    }
  }

  const openQuickEdit = async (customer: CustomerRow) => {
    setChannels(await loadChannelOptions().catch(() => []))
    setAcq(await loadAcqChannels().catch(() => []))
    setEditSourceCat(customer.sourceCategory)
    editForm.setFieldsValue({
      name: customer.name,
      intentionLevel: customer.intentionLevel ?? undefined,
      mainStatus: customer.mainStatus,
      sourceCategory: customer.sourceCategory,
      channelId: customer.channel?.id,
      acquisitionChannelId: customer.acquisitionChannel?.id,
      discoveredAt: fmtDate(customer.discoveredAt ?? customer.createdAt),
    })
    setEditCust(customer)
  }
  const submitQuickEdit = async () => {
    const v = await editForm.validateFields()
    setSubmitting(true)
    try {
      if (!editCust) return
      const payload: CustomerUpdatePayload = {
        intentionLevel: v.intentionLevel ?? null,
        mainStatus: v.mainStatus,
        sourceCategory: v.sourceCategory,
        channelId: v.sourceCategory === 'SELF' ? null : (v.channelId ?? null),
        acquisitionChannelId: v.sourceCategory === 'SELF' ? (v.acquisitionChannelId ?? null) : null,
        discoveredAt: v.discoveredAt,
      }
      if (canEditCustomerName) payload.name = v.name
      await client.patch(`/customers/${editCust.id}`, payload)
      message.success('已修改')
      setEditCust(null)
      reload()
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, '操作失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const updateInline = async (
    id: number,
    payload: Pick<CustomerUpdatePayload, 'mainStatus'> | Pick<CustomerUpdatePayload, 'intentionLevel'>,
  ) => {
    setInlineUpdatingId(id)
    try {
      await client.patch(`/customers/${id}`, payload)
      message.success('已修改')
      reload()
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, '操作失败'))
    } finally {
      setInlineUpdatingId(null)
    }
  }

  const sourceFilters = useMemo(() => uniqueFilters(data.items, sourceChannelLabel), [data.items])
  const ownerFilters = useMemo(
    () =>
      uniqueFilters(
        data.items,
        (r) => r.ownerName || '未分配',
        (r) => (r.ownerUserId ? String(r.ownerUserId) : UNASSIGNED_FILTER),
      ),
    [data.items],
  )
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = Object.fromEntries(Object.keys(CUSTOMER_STATUS_LABEL).map((status) => [status, 0]))
    data.items.forEach((row) => {
      if (row.mainStatus in counts) counts[row.mainStatus] += 1
    })
    return counts
  }, [data.items])
  const statusFilters = useMemo(
    () => Object.entries(CUSTOMER_STATUS_LABEL).map(([value, label]) => ({
      value,
      text: (
        <span className="customer-status-filter-option" style={customerStatusCssVars(value)}>
          <span>{label}</span>
          <span className="customer-status-filter-count">{statusCounts[value]}</span>
        </span>
      ),
    })),
    [statusCounts],
  )

  const columns: TableColumnsType<CustomerRow> = [
    { title: '编号', dataIndex: 'customerNo', width: COL.no },
    { title: '时间', dataIndex: 'discoveredAt', width: COL.date, render: (value: unknown, customer) => fmtDate(value ?? customer.createdAt) },
    { title: '姓名', dataIndex: 'name', width: COL.person, render: (name: string, customer) => <a onClick={() => nav(`/customers/${customer.id}`)}>{name}</a> },
    {
      title: '来源 / 渠道',
      width: COL.source,
      filters: sourceFilters,
      filterSearch: true,
      onFilter: (value, customer) => sourceChannelLabel(customer) === value,
      render: (_value: unknown, customer) => (
        <a onClick={() => openQuickEdit(customer)}>
          {sourceChannelLabel(customer)}
        </a>
      ),
    },
    {
      title: '状态',
      dataIndex: 'mainStatus',
      width: COL.status,
      filters: statusFilters,
      onFilter: (value, customer) => customer.mainStatus === value,
      render: (status: string, customer) => (
        <Select
          className="customer-inline-select customer-status-select"
          size="small"
          value={status}
          disabled={inlineUpdatingId === customer.id}
          popupMatchSelectWidth={false}
          style={{ width: '100%', ...customerStatusCssVars(status) }}
          options={customerStatusOptions}
          onChange={(value) => updateInline(customer.id, { mainStatus: value })}
        />
      ),
    },
    {
      title: '意向',
      dataIndex: 'intentionLevel',
      width: COL.status,
      filters: [
        ...Object.entries(INTENTION_LABEL).map(([value, label]) => ({ text: label, value })),
        { text: '未填写', value: '__EMPTY__' },
      ],
      onFilter: (value, customer) => (value === '__EMPTY__' ? !customer.intentionLevel : customer.intentionLevel === value),
      render: (intention: string | null, customer) => (
        <Select
          className="customer-inline-select"
          allowClear
          size="small"
          placeholder="未填写"
          value={intention || undefined}
          disabled={inlineUpdatingId === customer.id}
          popupMatchSelectWidth={false}
          style={{ width: '100%' }}
          options={Object.entries(INTENTION_LABEL).map(([value, label]) => ({ value, label }))}
          onChange={(value) => updateInline(customer.id, { intentionLevel: value ?? null })}
        />
      ),
    },
    {
      title: '分配',
      width: COL.status,
      filters: ownerFilters,
      filterSearch: true,
      onFilter: (value, customer) => (customer.ownerUserId ? String(customer.ownerUserId) : UNASSIGNED_FILTER) === value,
      render: (_value: unknown, customer) => {
        const label = customer.ownerName ? <Tag color="green">{customer.ownerName}</Tag> : <Tag>未分配</Tag>
        return canCreate ? (
          <a onClick={async () => { setSales(await loadUserOptions('SALES').catch(() => [])); setAssignTarget(customer) }}>{label}</a>
        ) : (
          label
        )
      },
    },
    {
      title: '操作',
      width: COL.action,
      render: (_value: unknown, customer) => (
        <Space wrap>
          <ActionBtn tone="view" onClick={() => nav(`/customers/${customer.id}`)}>详情</ActionBtn>
          {canEditCustomerName && <ActionBtn tone="edit" onClick={() => openQuickEdit(customer)}>修改</ActionBtn>}
          {user?.role === 'ADMIN' && <DeleteBtn onConfirm={() => doDelete(customer.id)} />}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Space style={{ marginBottom: 16 }} wrap>
        <Input.Search
          placeholder="姓名/电话/微信/编号"
          allowClear
          onSearch={(value) => {
            setLoading(true)
            setSearch(value)
            setReloadKey((key) => key + 1)
          }}
          style={{ width: 240 }}
        />
        {canCreate && <Button type="primary" onClick={openCreate}>新增客户</Button>}
        {canCreate && (
          <Upload
            accept=".xlsx"
            showUploadList={false}
            customRequest={async ({ file }) => {
              const fd = new FormData()
              fd.append('file', file as File)
              const { data } = await client.post<ImportSummary>('/customers/import', fd)
              message.success(`导入：成功${data.success}，重复${data.duplicates}，失败${data.failed}`)
              reload()
            }}
          >
            <Button icon={<UploadOutlined />}>导入</Button>
          </Upload>
        )}
        <Button onClick={() => downloadFile('/customers/export', '客户.xlsx')}>导出</Button>
      </Space>

      <Table
        {...scrollTableProps}
        className="customer-list-table"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data.items}
      />

      <Modal title="新增客户" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => submitCreate(false)} confirmLoading={submitting} okText={submitting ? '处理中…' : '确定'} maskClosable={false} cancelButtonProps={{ disabled: submitting }} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ sourceCategory: 'SELF' }}>
          <Form.Item name="name" label="姓名" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="discoveredAt" label="时间">
            <Input type="date" />
          </Form.Item>
          <Space>
            <Form.Item name="phone" label="电话"><Input /></Form.Item>
            <Form.Item name="wechat" label="微信"><Input /></Form.Item>
            <Form.Item name="email" label="邮箱"><Input /></Form.Item>
          </Space>
          <Form.Item name="sourceCategory" label="来源" rules={[{ required: true }]}>
            <Select onChange={(value: SourceCategory) => { setSourceCat(value); form.setFieldValue('channelId', undefined) }} options={Object.entries(SOURCE_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
          </Form.Item>
          {sourceCat === 'SELF' ? (
            <Form.Item name="acquisitionChannelId" label="获取渠道">
              <Select allowClear options={acq.map((a) => ({ value: a.id, label: a.name }))} />
            </Form.Item>
          ) : (
            <Form.Item name="channelId" label="第三方渠道" rules={[{ required: true }]}>
              <Select options={channels.filter((c) => (sourceCat === 'INDIVIDUAL_THIRD_PARTY' ? c.channelType === 'INDIVIDUAL' : c.channelType === 'ENTERPRISE')).map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
          )}
          <Form.Item name="ownerUserId" label="负责销售（可后续指派）">
            <Select allowClear options={sales.map((s) => ({ value: s.id, label: s.name }))} />
          </Form.Item>
          <Form.Item name="intentionLevel" label="意向">
            <Select allowClear options={Object.entries(INTENTION_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
          </Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal title="指派负责销售" open={!!assignTarget} onCancel={() => setAssignTarget(null)} footer={null} destroyOnClose>
        <Select
          style={{ width: '100%' }}
          placeholder="选择销售"
          options={sales.map((s) => ({ value: s.id, label: s.name }))}
          onChange={doAssign}
        />
      </Modal>

      <Modal title={canEditCustomerName ? '快速修改（姓名 / 意向 / 状态 / 来源渠道）' : '快速修改（意向 / 状态 / 来源渠道）'} open={!!editCust} onCancel={() => setEditCust(null)} onOk={submitQuickEdit} confirmLoading={submitting} okText={submitting ? '处理中…' : '确定'} maskClosable={false} cancelButtonProps={{ disabled: submitting }} destroyOnClose>
        <Form form={editForm} layout="vertical">
          {canEditCustomerName && (
            <Form.Item name="name" label="姓名" rules={[{ required: true, whitespace: true, message: '请输入客户姓名' }]}>
              <Input />
            </Form.Item>
          )}
          <Form.Item name="intentionLevel" label="意向">
            <Select allowClear options={Object.entries(INTENTION_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
          </Form.Item>
          <Form.Item name="mainStatus" label="状态" rules={[{ required: true }]}>
            <Select options={customerStatusOptions} />
          </Form.Item>
          <Form.Item name="discoveredAt" label="时间">
            <Input type="date" />
          </Form.Item>
          <Form.Item name="sourceCategory" label="来源" rules={[{ required: true }]}>
            <Select onChange={(value: SourceCategory) => { setEditSourceCat(value); editForm.setFieldValue('channelId', undefined); editForm.setFieldValue('acquisitionChannelId', undefined) }} options={Object.entries(SOURCE_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
          </Form.Item>
          {editSourceCat === 'SELF' ? (
            <Form.Item name="acquisitionChannelId" label="获取渠道">
              <Select allowClear options={acq.map((a) => ({ value: a.id, label: a.name }))} />
            </Form.Item>
          ) : (
            <Form.Item name="channelId" label="第三方渠道" rules={[{ required: true }]}>
              <Select options={channels.filter((c) => (editSourceCat === 'INDIVIDUAL_THIRD_PARTY' ? c.channelType === 'INDIVIDUAL' : c.channelType === 'ENTERPRISE')).map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  )
}
