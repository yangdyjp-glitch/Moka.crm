import { useEffect, useState } from 'react'
import { Badge, Dropdown, Empty, List, message } from 'antd'
import { BellOutlined } from '@ant-design/icons'
import client from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { useRemoteData } from '../hooks/useRemoteData'

interface NotificationRecord {
  id: number
  title: string
  isRead: boolean
}

interface ScanResult {
  scanned: {
    overdue: number
    pendingReview: number
    unpaid: number
  }
}

const loadUnreadCount = async () => {
  const { data } = await client.get<{ count: number }>('/notifications/unread-count')
  return data.count
}

export default function NotificationBell() {
  const { user } = useAuth()
  const { data: count, reload: reloadCount } = useRemoteData(loadUnreadCount, 0)
  const [items, setItems] = useState<NotificationRecord[]>([])
  const [open, setOpen] = useState(false)

  const loadList = () =>
    client.get<NotificationRecord[]>('/notifications').then((r) => setItems(r.data)).catch(() => {})

  useEffect(() => {
    const t = setInterval(reloadCount, 60000)
    return () => clearInterval(t)
  }, [reloadCount])

  const onOpen = (o: boolean) => {
    setOpen(o)
    if (o) loadList()
  }
  const readAll = async () => {
    await client.post('/notifications/read-all')
    reloadCount()
    loadList()
  }
  const scan = async () => {
    const { data } = await client.post<ScanResult>('/notifications/scan')
    message.success(`扫描完成：逾期${data.scanned.overdue}，待审核${data.scanned.pendingReview}，未缴${data.scanned.unpaid}`)
    reloadCount()
    loadList()
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
        <List<NotificationRecord>
          size="small"
          dataSource={items}
          renderItem={(n) => (
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
