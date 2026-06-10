import React, { useEffect, useState } from 'react'
import { Table, Button, Tag, Modal, Form, Input, Select, DatePicker, message, Progress, Badge } from 'antd'
import { PlusOutlined, EditOutlined } from '@ant-design/icons'
import { versionApi, productApi, userApi } from '../services/api'
import { useAuthStore } from '../store'
import dayjs from 'dayjs'

const STATUS_CONFIG = {
  planning: { label: '计划中', color: 'default' },
  testing: { label: '测试中', color: 'processing' },
  completed: { label: '已完成', color: 'success' },
  released: { label: '已发布', color: 'blue' },
  cancelled: { label: '已取消', color: 'error' },
}

export default function VersionsPage() {
  const { user } = useAuthStore()
  const [versions, setVersions] = useState([])
  const [products, setProducts] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form] = Form.useForm()

  useEffect(() => {
    loadVersions()
    productApi.list().then(r => setProducts(r.data.data))
    userApi.list().then(r => setUsers(r.data.data))
  }, [])

  const loadVersions = async () => {
    setLoading(true)
    const r = await versionApi.list()
    setVersions(r.data.data)
    setLoading(false)
  }

  const openModal = (ver = null) => {
    setEditing(ver)
    if (ver) {
      form.setFieldsValue({
        ...ver,
        start_date: ver.start_date ? dayjs(ver.start_date) : null,
        end_date: ver.end_date ? dayjs(ver.end_date) : null,
      })
    } else {
      form.resetFields()
    }
    setShowModal(true)
  }

  const handleSave = async (values) => {
    const payload = {
      ...values,
      start_date: values.start_date?.format('YYYY-MM-DD'),
      end_date: values.end_date?.format('YYYY-MM-DD'),
    }
    if (editing) {
      await versionApi.update(editing.id, payload)
      message.success('版本更新成功')
    } else {
      await versionApi.create(payload)
      message.success('版本创建成功')
    }
    setShowModal(false)
    loadVersions()
  }

  return (
    <div className="page-container fade-in-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">🌿 测试版本管理</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>共 {versions.length} 个测试版本</div>
        </div>
        {['admin', 'manager'].includes(user?.role) && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}
            style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', border: 'none' }}>
            新建版本
          </Button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {versions.map(v => {
          const closeRate = v.total_defects > 0 ? Math.round((v.closed_count / v.total_defects) * 100) : 0
          return (
            <div key={v.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{v.product_name}</span>
                    <Tag color="blue" style={{ fontFamily: 'monospace' }}>{v.version}</Tag>
                    <Badge status={STATUS_CONFIG[v.status]?.color} text={STATUS_CONFIG[v.status]?.label} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                    {v.description} · 负责人：{v.manager_name} · 开始：{v.start_date || '-'} {v.end_date ? `结束：${v.end_date}` : ''}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                    <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                      <span>总计 <b>{v.total_defects}</b></span>
                      <span style={{ color: '#ef4444' }}>致命 <b>{v.fatal_count}</b></span>
                      <span style={{ color: '#f59e0b' }}>严重 <b>{v.critical_count}</b></span>
                      <span style={{ color: '#10b981' }}>关闭 <b>{v.closed_count}</b></span>
                    </div>
                    <div style={{ flex: 1, maxWidth: 200 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>关闭率 {closeRate}%</div>
                      <Progress percent={closeRate} showInfo={false} strokeColor={closeRate >= 80 ? '#10b981' : closeRate >= 60 ? '#f59e0b' : '#ef4444'} size="small" />
                    </div>
                  </div>
                </div>
                {['admin', 'manager'].includes(user?.role) && (
                  <Button icon={<EditOutlined />} onClick={() => openModal(v)}>编辑</Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Modal title={editing ? '编辑测试版本' : '新建测试版本'} open={showModal} onCancel={() => setShowModal(false)} footer={null} width={520}>
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 16 }}>
          <Form.Item name="product_id" label="保险产品" rules={[{ required: true }]}>
            <Select placeholder="选择产品">
              {products.map(p => <Select.Option key={p.id} value={p.id}>{p.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="version" label="版本号" rules={[{ required: true }]}>
            <Input placeholder="如：v1.2.0-UAT" />
          </Form.Item>
          <Form.Item name="description" label="版本描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="start_date" label="开始日期">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="end_date" label="计划结束日期">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="manager_id" label="测试负责人">
              <Select placeholder="选择负责人">
                {users.filter(u => ['admin', 'manager'].includes(u.role)).map(u => <Select.Option key={u.id} value={u.id}>{u.name}</Select.Option>)}
              </Select>
            </Form.Item>
            {editing && (
              <Form.Item name="status" label="版本状态">
                <Select>{Object.entries(STATUS_CONFIG).map(([k, v]) => <Select.Option key={k} value={k}>{v.label}</Select.Option>)}</Select>
              </Form.Item>
            )}
          </div>
          <Button type="primary" htmlType="submit" block style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', border: 'none', height: 42, fontWeight: 600 }}>
            {editing ? '保存修改' : '创建版本'}
          </Button>
        </Form>
      </Modal>
    </div>
  )
}
