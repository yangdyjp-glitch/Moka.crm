import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd'
import dayjs from 'dayjs'
import client from '../api/client'
import { apiErrorMessage } from '../api/errors'
import { CURRENCY_LABEL, fmtMoney } from '../api/types'
import { ActionBtn, DeleteBtn } from '../components/Actions'
import { COL, pageTableProps } from '../components/tableLayout'

type ReferralRow = {
  id: number
  customer?: { id: number; name: string } | null
  serviceType: string
  downstreamCompany: string
  commissionAmount: number | string
  currency: string
  settlementDate?: string | null
  collectionStatus: 'PENDING' | 'COLLECTED'
}

type CustomerOption = { id: number; name: string }

type ReferralForm = {
  customerId: number
  serviceType: string
  downstreamCompany: string
  commissionAmount: number
  currency: string
  settlementDate?: string
}

const SERVICE_TYPES = ['住房', '电话卡', '保险', '其他']
const fetchReferrals = (signal?: AbortSignal) => client.get<ReferralRow[]>('/referrals', { signal })

export default function Referrals() {
  const nav = useNavigate()
  const [rows, setRows] = useState<ReferralRow[]>([])
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<ReferralForm>()
  const [customers, setCustomers] = useState<CustomerOption[]>([])

  const reload = () => {
    setLoading(true)
    setReloadKey((current) => current + 1)
  }
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void fetchReferrals(controller.signal)
      .then((response) => { if (active) setRows(response.data) })
      .catch((error: unknown) => { if (active) message.error(apiErrorMessage(error, '转介绍数据加载失败')) })
      .finally(() => { if (active) setLoading(false) })
    return () => {
      active = false
      controller.abort()
    }
  }, [reloadKey])

  const openCreate = async () => {
    form.resetFields()
    const c = await client.get<{ items: CustomerOption[] }>('/customers', { params: { pageSize: 100 } })
    setCustomers(c.data.items)
    setOpen(true)
  }
  const submit = async () => {
    const v = await form.validateFields()
    setSubmitting(true)
    try {
      await client.post('/referrals', { ...v, settlementDate: v.settlementDate || undefined })
      message.success('已登记')
      setOpen(false)
      reload()
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, '操作失败'))
    } finally {
      setSubmitting(false)
    }
  }
  const toggle = async (id: number, action: 'collect' | 'uncollect') => {
    await client.post(`/referrals/${id}/${action}`)
    reload()
  }
  const del = async (id: number) => {
    try {
      await client.delete(`/referrals/${id}`)
      message.success('已删除')
      reload()
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, '删除失败'))
    }
  }

  return (
    <div>
      <Button type="primary" style={{ marginBottom: 16 }} onClick={openCreate}>登记转介绍收佣</Button>
      <Table<ReferralRow>
        {...pageTableProps}
        rowKey="id"
        loading={loading}
        dataSource={rows}
        columns={[
          { title: '客户', width: COL.person, render: (_, r) => <a onClick={() => nav(`/customers/${r.customer?.id}`)}>{r.customer?.name}</a> },
          { title: '服务种类', dataIndex: 'serviceType', width: COL.type },
          { title: '下游公司', dataIndex: 'downstreamCompany', width: COL.company },
          { title: '佣金', dataIndex: 'commissionAmount', width: COL.money, render: fmtMoney, align: 'right' },
          { title: '币种', dataIndex: 'currency', width: COL.currency, render: (c) => CURRENCY_LABEL[c] },
          { title: '结款时间', dataIndex: 'settlementDate', width: COL.date, render: (t) => (t ? dayjs(t).format('YYYY-MM-DD') : '—') },
          {
            title: '收款状态',
            dataIndex: 'collectionStatus',
            width: COL.status,
            render: (s) => <Tag color={s === 'COLLECTED' ? 'green' : 'orange'}>{s === 'COLLECTED' ? '已收款' : '待收款'}</Tag>,
          },
          {
            title: '操作',
            width: COL.action,
            render: (_, r) => (
              <Space wrap>
                {r.collectionStatus === 'PENDING' ? (
                  <ActionBtn tone="confirm" onClick={() => toggle(r.id, 'collect')}>标记已收</ActionBtn>
                ) : (
                  <ActionBtn tone="reject" onClick={() => toggle(r.id, 'uncollect')}>撤销</ActionBtn>
                )}
                <DeleteBtn onConfirm={() => del(r.id)} />
              </Space>
            ),
          },
        ]}
      />
      <Modal title="登记转介绍收佣" open={open} onCancel={() => setOpen(false)} onOk={submit} confirmLoading={submitting} okText={submitting ? '处理中…' : '确定'} maskClosable={false} cancelButtonProps={{ disabled: submitting }} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ currency: 'JPY', serviceType: '住房' }}>
          <Form.Item name="customerId" label="客户（已分配给我的）" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={customers.map((c) => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="serviceType" label="服务种类" rules={[{ required: true }]}>
            <Select options={SERVICE_TYPES.map((s) => ({ value: s, label: s }))} />
          </Form.Item>
          <Form.Item name="downstreamCompany" label="下游公司" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="commissionAmount" label="佣金额度" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="currency" label="币种" rules={[{ required: true }]}>
            <Select options={[{ value: 'JPY', label: '日元' }, { value: 'CNY', label: '人民币' }]} />
          </Form.Item>
          <Form.Item name="settlementDate" label="结款时间">
            <Input type="date" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
