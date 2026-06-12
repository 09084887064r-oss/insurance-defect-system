import React, { useState } from 'react'
import { Card, Form, Input, Button, Typography, Space, Alert, Divider } from 'antd'
import { UserOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store'

const { Title, Text } = Typography

export const CpicLogo = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <circle cx="50" cy="50" r="48" fill="#004f9f" />
    <path d="M28 72 C32 46, 52 34, 72 34 C58 48, 48 62, 46 72 Z" fill="#ffffff" />
    <path d="M46 72 C48 56, 62 44, 76 44 C66 54, 58 64, 58 72 Z" fill="#ffffff" stroke="#004f9f" strokeWidth="1" />
    <circle cx="68" cy="70" r="7" fill="#f59e0b" />
  </svg>
)

const DEMO_ACCOUNTS = [
  { email: 'admin@insure-test.com', password: 'admin123', role: '管理员', color: '#7c3aed' },
  { email: 'manager@insure-test.com', password: 'manager123', role: '项目经理', color: '#4f46e5' },
  { email: 'dev@insure-test.com', password: 'dev123', role: '开发人员', color: '#0891b2' },
  { email: 'tester@insure-test.com', password: 'tester123', role: '测试员', color: '#059669' },
]

export default function LoginPage() {
  const [form] = Form.useForm()
  const [error, setError] = useState('')
  const { login, loading } = useAuthStore()
  const navigate = useNavigate()

  const handleLogin = async (values) => {
    setError('')
    const result = await login(values.email, values.password)
    if (result.success) {
      navigate('/dashboard')
    } else {
      setError(result.message)
    }
  }

  const fillDemo = (account) => {
    form.setFieldsValue({ email: account.email, password: account.password })
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background decorations */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 20% 50%, rgba(0,79,159,0.06) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(0,102,204,0.04) 0%, transparent 50%)',
        pointerEvents: 'none'
      }} />

      <div style={{ width: '100%', maxWidth: 440, padding: '0 24px', position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}><CpicLogo size={64} /></div>
          <Title level={3} style={{ color: 'var(--text-primary)', margin: 0, fontWeight: 700 }}>
            产品测试缺陷预警系统
          </Title>
          <Text style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            保险产品用户测试管理平台
          </Text>
        </div>

        {/* Login Form */}
        <Card style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 16 }}>
          {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 20 }} />}

          <Form form={form} onFinish={handleLogin} layout="vertical" size="large">
            <Form.Item name="email" label="邮箱" rules={[{ required: true, message: '请输入邮箱' }]}>
              <Input prefix={<UserOutlined style={{ color: 'var(--text-muted)' }} />} placeholder="your@email.com" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
              <Input.Password prefix={<LockOutlined style={{ color: 'var(--text-muted)' }} />} placeholder="••••••••" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}
              style={{ height: 44, fontWeight: 600, background: 'linear-gradient(135deg, #004f9f, #0066cc)', border: 'none' }}>
              登 录
            </Button>
          </Form>

          <Divider style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', fontSize: 12 }}>演示账号快速登录</Divider>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {DEMO_ACCOUNTS.map(acc => (
              <button key={acc.email} onClick={() => fillDemo(acc)} style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
                textAlign: 'left', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = acc.color}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
              >
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: acc.color, flexShrink: 0
                }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{acc.role}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{acc.password}</div>
                </div>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
