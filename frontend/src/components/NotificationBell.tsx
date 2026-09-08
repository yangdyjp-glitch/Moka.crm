import { useCallback, useEffect, useRef, useState } from 'react'
import { Badge, Dropdown, Empty, List, message } from 'antd'
import { BellOutlined } from '@ant-design/icons'
import client from '../api/client'
import { apiErrorMessage } from '../api/errors'
import { useAuth } from '../auth/AuthContext'

interface NotificationItem {
  id: number
  title: string
  isRead: boolean
}

interface NotificationScanResponse {
  scanned: {
    overdue: number
    pendingReview: number
    unpaid: number
  }
}

export default function NotificationBell() {
  const { user } = useAuth()
  const [count, setCount] = useState(0)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [open, setOpen] = useState(false)
  const countRequest = useRef(0)
  const listRequest = useRef(0)

  const loadCount = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++countRequest.current
    try {
      const { data } = await client.get<{ count: number }>('/notifications/unread-count', {
        noCache: true,
        signal,
      })
      if (!signal?.aborted && requestId === countRequest.current) setCount(data.count)
    } catch {
      // Polling failures are intentionally quiet; the next interval retries.
    }
  }, [])

  const loadList = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++listRequest.current
    try {
      const { data } = await client.get<NotificationItem[]>('/notifications', {
        noCache: true,
        signal,
      })
      if (!signal?.aborted && requestId === listRequest.current) setItems(data)
    } catch {
      // Keep the last visible list when a refresh fails.
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const initialTimer = window.setTimeout(() => void loadCount(controller.signal), 0)
    const timer = window.setInterval(() => void loadCount(controller.signal), 60000)
    return () => {
      controller.abort()
      countRequest.current += 1
      listRequest.current += 1
      window.clearTimeout(initialTimer)
      window.clearInterval(timer)
    }
  }, [loadCount, user?.id])

  const onOpen = (o: boolean) => {
    setOpen(o)
    if (o) void loadList()
  }
  const readAll = async () => {
    try {
      await client.post('/notifications/read-all')
      await Promise.all([loadCount(), loadList()])
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, '标记通知失败'))
    }
  }
  const scan = async () => {
    try {
      const { data } = await client.post<NotificationScanResponse>('/notifications/scan')
      message.success(`扫描完成：逾期${data.scanned.overdue}，待审核${data.scanned.pendingReview}，未缴${data.scanned.unpaid}`)
      await Promise.all([loadCount(), loadList()])
    } catch (error: unknown) {
      message.error(apiErrorMessage(error, '扫描通知失败'))
    }
  }

  const panel = (
    <div style={{ width: 340, background: '#fff', boxShadow: '0 2px 12px rgba(0,0,0,0.15)', borderRadius: 0, padding: 8, maxHeight: 420, overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px' }}>
        <b>通知</b>
        <span style={{ fontSize: 13 }}>
          {user?.role === 'ADMIN' && <a onClick={scan} style={{ marginRight: 12 }}>立即扫描</a>}
          <a onClick={readAll}>全部已读</a>
        </span>
      </div>
      {items.length ? (
        <List
          size="small"
          dataSource={items}
          renderItem={(n: NotificationItem) => (
            <List.Item style={{ opacity: n.isRead ? 0.45 : 1 }}>
              <Badge status={n.isRead ? 'default' : 'processing'} text={n.title} />
            </List.Item>
          )}
        />
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无通知" />
      )}
    </div>
  )

  return (
    <Dropdown open={open} onOpenChange={onOpen} dropdownRender={() => panel} trigger={['click']}>
      <Badge count={count} size="small" style={{ marginRight: 24 }}>
        <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
      </Badge>
    </Dropdown>
  )
}
