import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Form, Input, message, Typography } from 'antd'
import { useAuth } from '../auth/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const nav = useNavigate()
  const [loading, setLoading] = useState(false)

  const onFinish = async (v: { username: string; password: string }) => {
    setLoading(true)
    try {
      await login(v.username, v.password)
      nav('/')
    } catch {
      message.error('账号或密码错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8eef6',
      }}
    >
      <Card style={{ width: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <span style={{ background: 'linear-gradient(135deg,#83366f,#c2a02e)', color: '#fff', borderRadius: 0, padding: '4px 14px', fontWeight: 900, fontSize: 22, letterSpacing: 2 }}>
            矩阵 CRM
          </span>
        </div>
        <Typography.Paragraph style={{ textAlign: 'center', color: '#64748b', marginBottom: 20 }}>
          客户与渠道管理系统
        </Typography.Paragraph>
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="username" label="账号" rules={[{ required: true }]}>
            <Input size="large" placeholder="请输入账号" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }]}>
            <Input.Password size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            登录
          </Button>
        </Form>
      </Card>
    </div>
  )
}
