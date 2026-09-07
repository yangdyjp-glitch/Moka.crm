import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
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
import type { TableColumnsType } from 'antd'
import { isAxiosError } from 'axios'
import dayjs from 'dayjs'
import { ActionBtn, DeleteBtn } from '../components/Actions'
import { COL, scrollTableProps } from '../components/tableLayout'
import client from '../api/client'
import { getErrorMessage } from '../api/errors'
import type { CustomerOption, OrderCreateValues, OrderListItem, PageResult } from '../api/financeTypes'
import type { ProductOption } from '../api/models'
import { useRemoteData } from '../hooks/useRemoteData'
import { useAuth } from '../auth/AuthContext'
import { loadProducts } from '../api/options'
import { CURRENCY_LABEL, ORDER_STATUS_LABEL, fmtDate, fmtMoney, todayDate } from '../api/types'
import { moneyIn } from '../api/money'

const EMPTY_FILTER = '__EMPTY__'
const ORDER_STATUS_COLOR: Record<string, string> = {
  PENDING_PAYMENT: 'orange',
  PARTIAL_PAID: 'gold',
  FULLY_PAID: 'green',
  IN_SERVICE: 'green',
  COMPLETED: 'green',
  REFUNDED: 'red',
  CANCELLED: 'red',
}
const ORDER_COL = {
  no: COL.no,
  date: COL.date,
  person: COL.person,
  sales: COL.person,
  project: 170,
  currency: 64,
  money: 112,
  quantity: 72,
  status: 96,
  action: 180,
} as const

function filterValue(v: unknown) {
  return v == null || v === '' ? EMPTY_FILTER : String(v)
}

function filterText(v: unknown) {
  return v == null || v === '' ? '—' : String(v)
}

function uniqueFilters<T>(rows: T[], getValue: (row: T) => unknown, getText: (row: T) => unknown = getValue) {
  const seen = new Map<string, string>()
  rows.forEach((row) => {
    const value = filterValue(getValue(row))
    if (!seen.has(value)) seen.set(value, filterText(getText(row)))
  })
  return Array.from(seen.entries())
    .sort(([, a], [, b]) => a.localeCompare(b, 'zh-CN'))
    .map(([value, text]) => ({ value, text }))
}

function signedMonthValue(r: OrderListItem) {
  return r.signedAt ? dayjs(r.signedAt).format('YYYY-MM') : EMPTY_FILTER
}

function monthFilters(rows: OrderListItem[]) {
  const values = Array.from(new Set(rows.map(signedMonthValue)))
  return values
    .sort((a, b) => {
      if (a === EMPTY_FILTER) return 1
      if (b === EMPTY_FILTER) return -1
      return b.localeCompare(a)
    })
    .map((value) => ({ value, text: value === EMPTY_FILTER ? '未填写' : value }))
}

function orderQuantity(r: OrderListItem) {
  return Number(r.quantity) || 1
}

function orderUnitPrice(r: OrderListItem) {
  return r.unitPrice != null ? Number(r.unitPrice) : Number(r.originalPrice || 0) / orderQuantity(r)
}

function calcOriginalPrice(unitPrice: unknown, quantity: unknown) {
  return (Number(unitPrice) || 0) * (Number(quantity) || 1)
}

export default function Orders() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const nav = useNavigate()
  const fetchOrders = useCallback(async () => {
    const { data } = await client.get<PageResult<OrderListItem>>('/orders', { params: { all: 1 } })
    return data
  }, [])
  const { data, loading, error, reload: load } = useRemoteData(fetchOrders, { items: [], total: 0 })
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form] = Form.useForm<OrderCreateValues>()
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [products, setProducts] = useState<ProductOption[]>([])
  const fp = Form.useWatch('firstPaymentAmount', form)
  const tp = Form.useWatch('tailPaymentAmount', form)
  const up = Form.useWatch('unitPrice', form)
  const qty = Form.useWatch('quantity', form)
  const dc = Form.useWatch('discountAmount', form)
  const originalPrice = calcOriginalPrice(up, qty)
  const receivable = originalPrice - (Number(dc) || 0)
  const paySum = (Number(fp) || 0) + (Number(tp) || 0)
  const payMismatch = originalPrice > 0 && paySum !== receivable

  const openCreate = async () => {
    form.resetFields()
    form.setFieldsValue({ currency: 'JPY', quantity: 1, signedAt: todayDate(), firstPaymentPaidAt: todayDate() })
    const cs = await client.get<PageResult<CustomerOption>>('/customers', { params: { all: 1 } })
    setCustomers(cs.data.items)
    setProducts(await loadProducts().catch(() => []))
    setOpen(true)
  }

  const applyProductDefaults = (productId: number) => {
    const product = products.find((p) => p.id === productId)
    if (!product) return
    form.setFieldsValue({
      unitPrice: product.standardPrice != null ? Number(product.standardPrice) : undefined,
      currency: product.currency || form.getFieldValue('currency'),
    })
  }

  const submit = async () => {
    const v = await form.validateFields()
    setSubmitting(true)
    try {
      await client.post('/orders', {
        ...v,
        quantity: Number(v.quantity) || 1,
        originalPrice: calcOriginalPrice(v.unitPrice, v.quantity),
      })
      message.success('已创建订单')
      setOpen(false)
      load()
    } catch (e: unknown) {
      message.error(getErrorMessage(e, '创建失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const act = async (id: number, action: string) => {
    await client.post(`/orders/${id}/${action}`)
    message.success('已更新')
    load()
  }

  const doDelete = async (id: number) => {
    try {
      await client.delete(`/orders/${id}`)
      message.success('已删除订单')
      load()
    } catch (e: unknown) {
      const details = isAxiosError<unknown>(e) ? e.response?.data : undefined
      const blockingPayments = details && typeof details === 'object' && 'blockingPayments' in details && Array.isArray(details.blockingPayments)
        ? details.blockingPayments.filter((value): value is string => typeof value === 'string') : []
      const blockingRefunds = details && typeof details === 'object' && 'blockingRefunds' in details && Array.isArray(details.blockingRefunds)
        ? details.blockingRefunds.filter((value): value is string => typeof value === 'string') : []
      if (blockingPayments.length || blockingRefunds.length) {
        Modal.error({
          title: '无法删除订单',
          content: (
            <div>
              <p>{getErrorMessage(e, '删除失败')}</p>
              {blockingPayments.length > 0 && <p>已到账收款：{blockingPayments.join('、')}</p>}
              {blockingRefunds.length > 0 && <p>已退款：{blockingRefunds.join('、')}</p>}
            </div>
          ),
        })
      } else {
        message.error(getErrorMessage(e, '删除失败'))
      }
    }
  }

  const signedMonthFilters = useMemo(() => monthFilters(data.items), [data.items])
  const productFilters = useMemo(
    () => uniqueFilters(data.items, (r) => r.product?.id, (r) => r.product?.name),
    [data.items],
  )
  const salesFilters = useMemo(
    () => uniqueFilters(data.items, (r) => r.customer?.ownerUserId, (r) => r.salesPerson?.name),
    [data.items],
  )
  const currencyFilters = useMemo(
    () => uniqueFilters(data.items, (r) => r.currency, (r) => CURRENCY_LABEL[r.currency] || r.currency),
    [data.items],
  )
  const statusFilters = useMemo(
    () => uniqueFilters(data.items, (r) => r.status, (r) => ORDER_STATUS_LABEL[r.status] || r.status),
    [data.items],
  )

  const columns: TableColumnsType<OrderListItem> = [
    { title: '订单号', dataIndex: 'orderNo', width: ORDER_COL.no, render: (n: string, r) => <a onClick={() => nav(`/orders/${r.id}`)}>{n}</a> },
    {
      title: '时间',
      dataIndex: 'signedAt',
      width: ORDER_COL.date,
      filters: signedMonthFilters,
      onFilter: (value, r) => signedMonthValue(r) === value,
      render: fmtDate,
    },
    { title: '客户', width: ORDER_COL.person, render: (_, r) => <a onClick={() => nav(`/customers/${r.customer?.id}`)}>{r.customer?.name}</a> },
    {
      title: '销售人员',
      width: ORDER_COL.sales,
      filters: salesFilters,
      filterSearch: true,
      onFilter: (value, r) => filterValue(r.customer?.ownerUserId) === value,
      render: (_, r) => r.salesPerson?.name || '—',
    },
    {
      title: '项目',
      width: ORDER_COL.project,
      filters: productFilters,
      filterSearch: true,
      onFilter: (value, r) => filterValue(r.product?.id) === value,
      render: (_, r) => r.product?.name,
    },
    {
      title: '币种',
      dataIndex: 'currency',
      width: ORDER_COL.currency,
      filters: currencyFilters,
      onFilter: (value, r) => filterValue(r.currency) === value,
      render: (c: string) => CURRENCY_LABEL[c],
    },
    { title: '单价', dataIndex: 'unitPrice', width: ORDER_COL.money, render: (_, r) => fmtMoney(orderUnitPrice(r)), align: 'right' },
    { title: '数量', dataIndex: 'quantity', width: ORDER_COL.quantity, render: (_, r) => orderQuantity(r), align: 'right' },
    { title: '优惠', dataIndex: 'discountAmount', width: ORDER_COL.money, render: fmtMoney, align: 'right' as const },
    { title: '应收', dataIndex: 'receivableAmount', width: ORDER_COL.money, render: fmtMoney, align: 'right' as const },
    { title: '已收', dataIndex: 'paidAmount', width: ORDER_COL.money, render: moneyIn, align: 'right' as const },
    { title: '未收', dataIndex: 'unpaidAmount', width: ORDER_COL.money, render: fmtMoney, align: 'right' as const },
    {
      title: '确认状态',
      dataIndex: 'status',
      width: ORDER_COL.status,
      filters: statusFilters,
      onFilter: (value, r) => filterValue(r.status) === value,
      render: (s: string) => <Tag color={ORDER_STATUS_COLOR[s]}>{ORDER_STATUS_LABEL[s]}</Tag>,
    },
    {
      title: '操作',
      width: ORDER_COL.action,
      render: (_, r) => (
        <Space wrap>
          <ActionBtn tone="view" onClick={() => nav(`/orders/${r.id}`)}>详情</ActionBtn>
          {['FULLY_PAID', 'PARTIAL_PAID', 'PENDING_PAYMENT'].includes(r.status) && (
            <ActionBtn tone="confirm" onClick={() => act(r.id, 'start-service')}>开始服务</ActionBtn>
          )}
          {r.status === 'IN_SERVICE' && (
            <ActionBtn tone="confirm" onClick={() => act(r.id, 'complete-service')}>完成服务</ActionBtn>
          )}
          {isAdmin && (
            <DeleteBtn onConfirm={() => doDelete(r.id)} title="确认删除该订单？其收款/退款将一并删除" />
          )}
        </Space>
      ),
    },
  ]

  return (
    <div>
      <Button type="primary" style={{ marginBottom: 16 }} onClick={openCreate}>签约（新建订单）</Button>
      {!!error && <Alert type="error" showIcon message={getErrorMessage(error, '订单数据加载失败')} action={<Button size="small" onClick={load}>重新加载</Button>} style={{ marginBottom: 16 }} />}
      <Table<OrderListItem>
        {...scrollTableProps}
        className="orders-list-table"
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data.items}
      />
      <Modal title="签约（首款必填 / 尾款选填）" open={open} onCancel={() => setOpen(false)} onOk={submit} confirmLoading={submitting} okText={submitting ? '处理中…' : '确定'} maskClosable={false} cancelButtonProps={{ disabled: submitting }} destroyOnClose>
        <Form form={form} layout="vertical" initialValues={{ currency: 'JPY' }}>
          <Form.Item name="customerId" label="客户" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={customers.map((c) => ({ value: c.id, label: `${c.name}（${c.customerNo}）` }))}
            />
          </Form.Item>
          <Form.Item name="productId" label="项目" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              onChange={applyProductDefaults}
              options={products.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          <Form.Item name="signedAt" label="签单时间">
            <Input type="date" />
          </Form.Item>
          <Space wrap>
            <Form.Item name="currency" label="币种" rules={[{ required: true }]}>
              <Select style={{ width: 100 }} options={[{ value: 'JPY', label: '日元' }, { value: 'CNY', label: '人民币' }]} />
            </Form.Item>
            <Form.Item name="unitPrice" label="单价" rules={[{ required: true }]}>
              <InputNumber min={0} controls={false} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="quantity" label="数量" rules={[{ required: true }]}>
              <InputNumber min={1} precision={0} controls={false} style={{ width: 90 }} />
            </Form.Item>
            <Form.Item label="应缴金额">
              <InputNumber value={originalPrice} disabled controls={false} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="discountAmount" label="优惠">
              <InputNumber min={0} controls={false} style={{ width: 100 }} />
            </Form.Item>
          </Space>
          <Form.Item name="firstPaymentAmount" label="首款金额（必填，待确认）" rules={[{ required: true }]}>
            <InputNumber min={0} controls={false} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="firstPaymentPaidAt" label="首款时间">
            <Input type="date" />
          </Form.Item>
          <Form.Item name="tailPaymentAmount" label="尾款金额（选填，待确认）">
            <InputNumber min={0} controls={false} style={{ width: '100%' }} />
          </Form.Item>
          {payMismatch && (
            <div style={{ color: '#dc2626', marginBottom: 8 }}>
              提示：首款+尾款（{paySum.toLocaleString()}）≠ 应收（{receivable.toLocaleString()}），请在下方填写差异说明。
            </div>
          )}
          <Form.Item
            name="remark"
            label="说明（首款+尾款≠应收时必填）"
            rules={[
              {
                validator: (_, value) => {
                  const rcv = calcOriginalPrice(form.getFieldValue('unitPrice'), form.getFieldValue('quantity')) - (Number(form.getFieldValue('discountAmount')) || 0)
                  const sum = (Number(form.getFieldValue('firstPaymentAmount')) || 0) + (Number(form.getFieldValue('tailPaymentAmount')) || 0)
                  if (sum !== rcv && !value) return Promise.reject(new Error('首款+尾款与应收不一致，请填写差异说明'))
                  return Promise.resolve()
                },
              },
            ]}
          >
            <Input.TextArea rows={2} placeholder="如：分期收款、尾款待定、优惠后差额等" />
          </Form.Item>
          <Form.Item name="contractNo" label="合同编号"><Input /></Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
