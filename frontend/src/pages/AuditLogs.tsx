import { useEffect, useState } from 'react'
import { Table, Tabs, Tag } from 'antd'
import dayjs from 'dayjs'
import client from '../api/client'
import { COL, pageTableProps } from '../components/tableLayout'

type AuditLogRow = {
  id: number
  createdAt: string
  operatorId?: number | null
  relatedType: string
  relatedId?: number | null
  action: string
  newValue?: string | null
}

type ImpersonationLogRow = {
  id: number
  createdAt: string
  action: 'start' | 'stop'
  actorId: number
  actorName: string
  actorUsername?: string | null
  targetUserId: number
  targetName: string
  targetUsername?: string | null
}

const ACTION_LABEL: Record<string, string> = {
  APPROVE_REFUND: '执行退款',
  PAY_COMMISSION: '支付分成',
}

export default function AuditLogs() {
  const [rows, setRows] = useState<AuditLogRow[]>([])
  const [impRows, setImpRows] = useState<ImpersonationLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [impLoading, setImpLoading] = useState(true)
  useEffect(() => {
    let active = true
    void client.get<AuditLogRow[]>('/audit-logs')
      .then((response) => { if (active) setRows(response.data) })
      .finally(() => { if (active) setLoading(false) })
    void client.get<ImpersonationLogRow[]>('/auth/impersonation-logs')
      .then((response) => { if (active) setImpRows(response.data) })
      .finally(() => { if (active) setImpLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <Tabs
      items={[
        {
          key: 'audit',
          label: '操作日志',
          children: (
            <Table<AuditLogRow>
              {...pageTableProps}
              rowKey="id"
              loading={loading}
              dataSource={rows}
              columns={[
                { title: '时间', dataIndex: 'createdAt', width: COL.datetime, render: (t) => dayjs(t).format('YYYY-MM-DD HH:mm:ss') },
                { title: '操作人ID', dataIndex: 'operatorId', width: COL.no },
                { title: '对象', dataIndex: 'relatedType', width: COL.no, render: (t, r) => `${t}#${r.relatedId ?? ''}` },
                { title: '动作', dataIndex: 'action', width: COL.method, render: (a) => <Tag>{ACTION_LABEL[a] || a}</Tag> },
                { title: '详情', dataIndex: 'newValue', width: COL.note },
              ]}
            />
          ),
        },
        {
          key: 'impersonation',
          label: '代理登录日志',
          children: (
            <Table<ImpersonationLogRow>
              {...pageTableProps}
              rowKey="id"
              loading={impLoading}
              dataSource={impRows}
              columns={[
                { title: '时间', dataIndex: 'createdAt', width: COL.datetime, render: (t) => dayjs(t).format('YYYY-MM-DD HH:mm:ss') },
                { title: '操作类型', dataIndex: 'action', width: COL.status, render: (a) => <Tag color={a === 'start' ? 'orange' : 'green'}>{a === 'start' ? '开始代理' : '退出代理'}</Tag> },
                { title: '管理员', width: COL.text, render: (_, r) => `${r.actorName}（${r.actorUsername || r.actorId}）` },
                { title: '目标用户', width: COL.text, render: (_, r) => `${r.targetName}（${r.targetUsername || r.targetUserId}）` },
              ]}
            />
          ),
        },
      ]}
    />
  )
}
