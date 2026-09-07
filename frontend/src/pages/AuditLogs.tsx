import { useEffect } from 'react'
import { Table, Tabs, Tag, message } from 'antd'
import dayjs from 'dayjs'
import client from '../api/client'
import { getErrorMessage } from '../api/errors'
import { COL, pageTableProps } from '../components/tableLayout'
import { useRemoteData } from '../hooks/useRemoteData'

interface AuditLogRecord {
  id: number
  createdAt: string
  operatorId: number | null
  relatedType: string
  relatedId: number | null
  action: string
  newValue: string | null
}

interface ImpersonationLogRecord {
  id: number
  createdAt: string
  action: string
  actorId: number
  actorName: string
  actorUsername: string
  targetUserId: number
  targetName: string
  targetUsername: string
}

const ACTION_LABEL: Record<string, string> = {
  APPROVE_REFUND: '执行退款',
  PAY_COMMISSION: '支付分成',
}

const loadAuditLogs = async () => {
  const { data } = await client.get<AuditLogRecord[]>('/audit-logs')
  return data
}

const loadImpersonationLogs = async () => {
  const { data } = await client.get<ImpersonationLogRecord[]>('/auth/impersonation-logs')
  return data
}

export default function AuditLogs() {
  const { data: rows, loading, error } = useRemoteData(loadAuditLogs, [])
  const { data: impRows, loading: impLoading, error: impError } = useRemoteData(loadImpersonationLogs, [])

  useEffect(() => {
    if (error) message.error(getErrorMessage(error, '操作日志加载失败'))
  }, [error])

  useEffect(() => {
    if (impError) message.error(getErrorMessage(impError, '代理登录日志加载失败'))
  }, [impError])

  return (
    <Tabs
      items={[
        {
          key: 'audit',
          label: '操作日志',
          children: (
            <Table<AuditLogRecord>
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
            <Table<ImpersonationLogRecord>
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
