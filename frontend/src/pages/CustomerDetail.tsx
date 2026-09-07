import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Spin,
  Upload,
  message,
} from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import client, { downloadFile } from '../api/client'
import { apiErrorMessage } from '../api/errors'
import { useAuth } from '../auth/AuthContext'
import {
  CUSTOMER_STATUS_LABEL,
  CUSTOMER_STATUS_STYLE,
  FOLLOW_METHOD_LABEL,
  INTENTION_LABEL,
  ORDER_STATUS_LABEL,
  SALES_STAGE_LABEL,
  SOURCE_LABEL,
  fmtDate,
  fmtMoney,
} from '../api/types'
import { moneyIn } from '../api/money'
import { ActionBtn, DeleteBtn } from '../components/Actions'
import { COL, smallTableProps } from '../components/tableLayout'

type MoneyValue = string | number

interface NamedReference {
  name: string
}

interface FollowUp {
  id: number
  followedAt: string
  method: string
  content: string
  result: string | null
  nextFollowUpAt: string | null
}

interface CustomerOrder {
  id: number
  orderNo: string
  signedAt: string
  currency: string
  receivableAmount: MoneyValue
  paidAmount: MoneyValue
  unpaidAmount: MoneyValue
  status: string
}

interface Referral {
  id: number
  serviceType: string
  downstreamCompany: string
  commissionAmount: MoneyValue
  currency: string
  collectionStatus: string
}

interface Attachment {
  id: number
  fileName: string
  fileType: string
  createdAt: string
}

interface CustomerDetails {
  name: string
  customerNo: string
  mainStatus: string
  intentionLevel: string | null
  salesStage: string | null
  hasProblem: boolean
  discoveredAt: string | null
  createdAt: string
  phone: string | null
  wechat: string | null
  email: string | null
  sourceCategory: string
  channel: NamedReference | null
  acquisitionChannel: NamedReference | null
  commissionRateSnapshot: MoneyValue | null
  nextFollowUpAt: string | null
  remark: string | null
  followUps: FollowUp[]
  orders: CustomerOrder[]
  referrals: Referral[]
}

interface FollowFormValues {
  method: string
  content: string
  result?: string
  nextFollowUpAt?: string
}

export default function CustomerDetail() {
  const { id } = useParams()
  const customerId = id ?? ''
  const { user } = useAuth()
  const [customers, setCustomers] = useState<Record<string, CustomerDetails>>({})
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({})
  const [attachmentErrors, setAttachmentErrors] = useState<Record<string, string>>({})
  const [reloadKey, setReloadKey] = useState(0)
  const [followOpen, setFollowOpen] = useState(false)
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({})
  const [attachmentsByCustomer, setAttachmentsByCustomer] = useState<Record<string, Attachment[]>>({})
  const [form] = Form.useForm<FollowFormValues>()
  const customerRequests = useRef(new Map<string, number>())
  const attachmentRequests = useRef(new Map<string, number>())
  const summaryRequests = useRef(new Map<string, number>())
  const mountedRef = useRef(true)
  const c = customers[customerId] ?? null
  const attachments = attachmentsByCustomer[customerId] ?? []
  const aiSummary = aiSummaries[customerId] ?? null
  const loadError = loadErrors[customerId]
  const attachmentError = attachmentErrors[customerId]
  const canFollow = user?.role === 'SALES' || user?.role === 'BUSINESS_SUPERVISOR' || user?.role === 'ADMIN'
  const isAdmin = user?.role === 'ADMIN'

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const loadCustomer = useCallback(async (signal?: AbortSignal) => {
    if (!customerId) return
    const requestId = (customerRequests.current.get(customerId) ?? 0) + 1
    customerRequests.current.set(customerId, requestId)
    const { data } = await client.get<CustomerDetails>(`/customers/${customerId}`, {
      noCache: true,
      signal,
    })
    if (mountedRef.current && !signal?.aborted && requestId === customerRequests.current.get(customerId)) {
      setCustomers((current) => ({ ...current, [customerId]: data }))
      setLoadErrors((current) => {
        if (!(customerId in current)) return current
        const next = { ...current }
        delete next[customerId]
        return next
      })
    }
  }, [customerId])

  const loadAttachments = useCallback(async (signal?: AbortSignal) => {
    if (!customerId) return
    const requestId = (attachmentRequests.current.get(customerId) ?? 0) + 1
    attachmentRequests.current.set(customerId, requestId)
    const { data } = await client.get<Attachment[]>('/attachments', {
      noCache: true,
      params: { relatedType: 'Customer', relatedId: customerId },
      signal,
    })
    if (mountedRef.current && !signal?.aborted && requestId === attachmentRequests.current.get(customerId)) {
      setAttachmentsByCustomer((current) => ({ ...current, [customerId]: data }))
      setAttachmentErrors((current) => {
        if (!(customerId in current)) return current
        const next = { ...current }
        delete next[customerId]
        return next
      })
    }
  }, [customerId])

  useEffect(() => {
    if (!customerId) return
    const controller = new AbortController()
    void loadCustomer(controller.signal).catch((error: unknown) => {
      if (mountedRef.current && !controller.signal.aborted) {
        setLoadErrors((current) => ({
          ...current,
          [customerId]: apiErrorMessage(error, '客户详情加载失败'),
        }))
      }
    })
    void loadAttachments(controller.signal).catch((error: unknown) => {
      if (mountedRef.current && !controller.signal.aborted) {
        setAttachmentErrors((current) => ({
          ...current,
          [customerId]: apiErrorMessage(error, '附件加载失败'),
        }))
      }
    })
    return () => controller.abort()
  }, [customerId, loadAttachments, loadCustomer, reloadKey])

  const retry = () => {
    setLoadErrors((current) => {
      if (!(customerId in current)) return current
      const next = { ...current }
      delete next[customerId]
      return next
    })
    setAttachmentErrors((current) => {
      if (!(customerId in current)) return current
      const next = { ...current }
      delete next[customerId]
      return next
    })
    setReloadKey((current) => current + 1)
  }

  if (!customerId) {
    return <Alert type="error" showIcon message="客户地址无效" description="缺少客户编号，无法加载详情。" />
  }
  if (!c && loadError) {
    return (
      <Alert
        type="error"
        showIcon
        message="客户详情加载失败"
        description={loadError}
        action={<Button size="small" onClick={retry}>重试</Button>}
      />
    )
  }
  if (!c) {
    return (
      <div style={{ minHeight: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <Spin />
        <span>正在加载客户详情…</span>
      </div>
    )
  }

  const addFollow = async () => {
    const v = await form.validateFields()
    await client.post(`/customers/${customerId}/follow-ups`, {
      ...v,
      nextFollowUpAt: v.nextFollowUpAt ? dayjs(v.nextFollowUpAt).toISOString() : undefined,
    })
    if (!mountedRef.current) return
    message.success('已记录跟进')
    setFollowOpen(false)
    form.resetFields()
    await loadCustomer()
  }
  const setStage = async (salesStage: string) => {
    await client.post(`/customers/${customerId}/sales-stage`, { salesStage })
    if (!mountedRef.current) return
    message.success('已更新销售阶段')
    await loadCustomer()
  }
  const doAi = async () => {
    const requestId = (summaryRequests.current.get(customerId) ?? 0) + 1
    summaryRequests.current.set(customerId, requestId)
    const { data } = await client.get<{ summary: string }>(`/customers/${customerId}/ai-summary`, {
      noCache: true,
    })
    if (mountedRef.current && requestId === summaryRequests.current.get(customerId)) {
      setAiSummaries((current) => ({ ...current, [customerId]: data.summary }))
    }
  }
  const delOrder = async (oid: number) => {
    try {
      await client.delete(`/orders/${oid}`)
      message.success('已删除')
      await loadCustomer()
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, '删除失败'))
    }
  }

  return (
    <div>
      {loadError && (
        <Alert
          type="error"
          showIcon
          message="客户详情刷新失败"
          description={loadError}
          action={<Button size="small" onClick={retry}>重试</Button>}
          style={{ marginBottom: 16 }}
        />
      )}
      <Card
        title={
          <Space wrap>
            {c.name}
            <Tag style={CUSTOMER_STATUS_STYLE[c.mainStatus]}>{CUSTOMER_STATUS_LABEL[c.mainStatus]}</Tag>
            {c.intentionLevel && <Tag color="purple">{INTENTION_LABEL[c.intentionLevel]}</Tag>}
            {c.salesStage && <Tag color="geekblue">{SALES_STAGE_LABEL[c.salesStage]}</Tag>}
            {c.hasProblem && <Tag color="red">有问题</Tag>}
          </Space>
        }
        extra={
          canFollow && (
            <Space>
              <Select
                size="small"
                placeholder="销售阶段"
                style={{ width: 120 }}
                value={c.salesStage || undefined}
                onChange={setStage}
                options={Object.entries(SALES_STAGE_LABEL).map(([k, v]) => ({ value: k, label: v }))}
              />
              <Button size="small" onClick={doAi}>AI 摘要</Button>
            </Space>
          )
        }
        style={{ marginBottom: 16 }}
      >
        <Descriptions size="small" column={3}>
          <Descriptions.Item label="编号">{c.customerNo}</Descriptions.Item>
          <Descriptions.Item label="时间">{fmtDate(c.discoveredAt ?? c.createdAt)}</Descriptions.Item>
          <Descriptions.Item label="电话">{c.phone || '—'}</Descriptions.Item>
          <Descriptions.Item label="微信">{c.wechat || '—'}</Descriptions.Item>
          <Descriptions.Item label="邮箱">{c.email || '—'}</Descriptions.Item>
          <Descriptions.Item label="来源">{SOURCE_LABEL[c.sourceCategory]}</Descriptions.Item>
          <Descriptions.Item label="渠道">
            {c.channel?.name || c.acquisitionChannel?.name || '—'}
            {c.commissionRateSnapshot != null && `（比例快照 ${c.commissionRateSnapshot}%）`}
          </Descriptions.Item>
          <Descriptions.Item label="下次跟进">
            {c.nextFollowUpAt ? dayjs(c.nextFollowUpAt).format('YYYY-MM-DD HH:mm') : '—'}
          </Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>{c.remark || '—'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Tabs
        items={[
          {
            key: 'follow',
            label: `跟进记录 (${c.followUps?.length || 0})`,
            children: (
              <>
                {canFollow && (
                  <Button type="primary" style={{ marginBottom: 12 }} onClick={() => setFollowOpen(true)}>
                    新增跟进
                  </Button>
                )}
                <Table
                  {...smallTableProps}
                  rowKey="id"
                  dataSource={c.followUps || []}
                  pagination={false}
                  columns={[
                    { title: '时间', dataIndex: 'followedAt', width: COL.datetime, render: (t) => dayjs(t).format('MM-DD HH:mm') },
                    { title: '方式', dataIndex: 'method', width: COL.type, render: (m) => FOLLOW_METHOD_LABEL[m] },
                    { title: '内容', dataIndex: 'content', width: COL.note },
                    { title: '结果', dataIndex: 'result', width: COL.text },
                    { title: '下次', dataIndex: 'nextFollowUpAt', width: COL.date, render: (t) => (t ? dayjs(t).format('MM-DD') : '—') },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'orders',
            label: `订单 (${c.orders?.length || 0})`,
            children: (
              <Table
                {...smallTableProps}
                rowKey="id"
                dataSource={c.orders || []}
                pagination={false}
                columns={[
                  { title: '订单号', dataIndex: 'orderNo', width: COL.no },
                  { title: '时间', dataIndex: 'signedAt', width: COL.date, render: fmtDate },
                  { title: '币种', dataIndex: 'currency', width: COL.currency },
                  { title: '应收', dataIndex: 'receivableAmount', width: COL.money, render: fmtMoney, align: 'right' },
                  { title: '已收', dataIndex: 'paidAmount', width: COL.money, render: moneyIn, align: 'right' },
                  { title: '未收', dataIndex: 'unpaidAmount', width: COL.money, render: fmtMoney, align: 'right' },
                  { title: '状态', dataIndex: 'status', width: COL.status, render: (s) => <Tag>{ORDER_STATUS_LABEL[s]}</Tag> },
                  ...(isAdmin
                    ? [
                        {
                          title: '操作',
                          width: COL.action,
                          render: (_: unknown, r: CustomerOrder) => <DeleteBtn onConfirm={() => delOrder(r.id)} />,
                        },
                      ]
                    : []),
                ]}
              />
            ),
          },
          {
            key: 'referrals',
            label: `转介绍收佣 (${c.referrals?.length || 0})`,
            children: (
              <Table
                {...smallTableProps}
                rowKey="id"
                dataSource={c.referrals || []}
                pagination={false}
                columns={[
                  { title: '服务种类', dataIndex: 'serviceType', width: COL.type },
                  { title: '下游公司', dataIndex: 'downstreamCompany', width: COL.company },
                  { title: '佣金', dataIndex: 'commissionAmount', width: COL.money, render: fmtMoney, align: 'right' },
                  { title: '币种', dataIndex: 'currency', width: COL.currency },
                  { title: '收款', dataIndex: 'collectionStatus', width: COL.status, render: (s) => (s === 'COLLECTED' ? '已收款' : '待收款') },
                ]}
              />
            ),
          },
          {
            key: 'attachments',
            label: `附件 (${attachments.length})`,
            children: (
              <>
                {attachmentError && (
                  <Alert
                    type="warning"
                    showIcon
                    message="附件加载失败"
                    description={attachmentError}
                    action={<Button size="small" onClick={retry}>重试</Button>}
                    style={{ marginBottom: 12 }}
                  />
                )}
                <Upload
                  showUploadList={false}
                  customRequest={async ({ file }) => {
                    const fd = new FormData()
                    fd.append('file', file as File)
                    fd.append('relatedType', 'Customer')
                    fd.append('relatedId', customerId)
                    await client.post('/attachments', fd)
                    message.success('已上传')
                    await loadAttachments()
                  }}
                >
                  <Button icon={<UploadOutlined />} style={{ marginBottom: 12 }}>上传合同 / 凭证</Button>
                </Upload>
                <Table
                  {...smallTableProps}
                  rowKey="id"
                  dataSource={attachments}
                  pagination={false}
                  columns={[
                    { title: '文件名', dataIndex: 'fileName', width: COL.note },
                    { title: '类型', dataIndex: 'fileType', width: COL.type },
                    { title: '上传时间', dataIndex: 'createdAt', width: COL.datetime, render: (t) => dayjs(t).format('MM-DD HH:mm') },
                    {
                      title: '操作',
                      width: COL.action,
                      render: (_: unknown, r: Attachment) => (
                        <ActionBtn tone="view" onClick={() => downloadFile(`/attachments/${r.id}/file`, r.fileName)}>下载</ActionBtn>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />

      <Modal title="新增跟进" open={followOpen} onCancel={() => setFollowOpen(false)} onOk={addFollow} destroyOnClose>
        <Form form={form} layout="vertical">
          <Form.Item name="method" label="方式" rules={[{ required: true }]}>
            <Select options={Object.entries(FOLLOW_METHOD_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
          </Form.Item>
          <Form.Item name="content" label="跟进内容" rules={[{ required: true }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="result" label="本次结果"><Input /></Form.Item>
          <Form.Item name="nextFollowUpAt" label="下次跟进时间">
            <Input type="datetime-local" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="AI 跟进摘要"
        open={!!aiSummary}
        onCancel={() => {
          summaryRequests.current.set(customerId, (summaryRequests.current.get(customerId) ?? 0) + 1)
          setAiSummaries((current) => {
            const next = { ...current }
            delete next[customerId]
            return next
          })
        }}
        footer={null}
      >
        <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{aiSummary}</pre>
      </Modal>
    </div>
  )
}
