import React, { useEffect, useState } from 'react'
import { Table, Button, Tag, Modal, Form, Input, Select, Space, message, Card, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined } from '@ant-design/icons'
import { productApi } from '../services/api'
import { useAuthStore } from '../store'

const PRODUCT_TYPES = ['车险', '健康险', '寿险', '意外险', '财产险', '责任险', '农业险']
const TYPE_COLORS = { '车险': 'blue', '健康险': 'green', '寿险': 'purple', '意外险': 'orange', '财产险': 'cyan', '责任险': 'magenta', '农业险': 'lime' }

export default function ProductsPage() {
  const { user } = useAuthStore()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form] = Form.useForm()

  useEffect(() => { loadProducts() }, [])

  const loadProducts = async () => {
    setLoading(true)
    const r = await productApi.list()
    setProducts(r.data.data)
    setLoading(false)
  }

  const openModal = (product = null) => {
    setEditing(product)
    form.setFieldsValue(product || { status: 'active' })
    setShowModal(true)
  }

  const handleSave = async (values) => {
    if (editing) {
      await productApi.update(editing.id, values)
      message.success('产品更新成功')
    } else {
      await productApi.create(values)
      message.success('产品创建成功')
    }
    setShowModal(false)
    form.resetFields()
    setEditing(null)
    loadProducts()
  }

  const columns = [
    { title: '产品名称', dataIndex: 'name', render: (n, r) => <div><div style={{ fontWeight: 600 }}>{n}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.description}</div></div> },
    { title: '类型', dataIndex: 'type', width: 90, render: t => <Tag color={TYPE_COLORS[t] || 'default'}>{t}</Tag> },
    { title: '状态', dataIndex: 'status', width: 80, render: s => <Tag color={s === 'active' ? 'success' : 'default'}>{s === 'active' ? '进行中' : '已归档'}</Tag> },
    { title: '版本数', dataIndex: 'version_count', width: 80, align: 'center' },
    { title: '未关闭缺陷', dataIndex: 'open_defect_count', width: 100, align: 'center', render: n => <span style={{ color: n > 0 ? '#f59e0b' : '#10b981', fontWeight: 600 }}>{n}</span> },
    { title: '创建人', dataIndex: 'creator_name', width: 100 },
    { title: '创建时间', dataIndex: 'created_at', width: 110, render: t => t?.substring(0, 10) },
    ['admin', 'manager'].includes(user?.role) && {
      title: '操作', width: 80,
      render: (_, r) => <Button size="small" icon={<EditOutlined />} onClick={() => openModal(r)}>编辑</Button>
    }
  ].filter(Boolean)

  return (
    <div className="page-container fade-in-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">🏢 保险产品管理</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>共 {products.length} 款保险产品</div>
        </div>
        {['admin', 'manager'].includes(user?.role) && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}
            style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', border: 'none' }}>
            新建产品
          </Button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 24 }}>
        {products.map(p => (
          <div key={p.id} style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
            transition: 'all 0.2s', cursor: 'pointer',
            borderLeft: `4px solid ${TYPE_COLORS[p.type] ? `var(--${TYPE_COLORS[p.type]}-6, #4f46e5)` : '#4f46e5'}`
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#4f46e5'; e.currentTarget.style.transform = 'translateY(-2px)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{p.name}</div>
                <Tag color={TYPE_COLORS[p.type]} style={{ marginTop: 6 }}>{p.type}</Tag>
              </div>
              {['admin', 'manager'].includes(user?.role) && (
                <Button size="small" icon={<EditOutlined />} onClick={() => openModal(p)} />
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '10px 0 12px' }}>{p.description}</div>
            <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
              <div><span style={{ color: 'var(--text-muted)' }}>版本数 </span><b>{p.version_count}</b></div>
              <div><span style={{ color: 'var(--text-muted)' }}>未关闭缺陷 </span><b style={{ color: p.open_defect_count > 0 ? '#f59e0b' : '#10b981' }}>{p.open_defect_count}</b></div>
            </div>
          </div>
        ))}
      </div>

      <Modal title={editing ? '编辑产品' : '新建保险产品'} open={showModal} onCancel={() => { setShowModal(false); form.resetFields() }} footer={null}>
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="产品名称" rules={[{ required: true }]}>
            <Input placeholder="如：平安车险 2024" />
          </Form.Item>
          <Form.Item name="type" label="产品类型" rules={[{ required: true }]}>
            <Select>{PRODUCT_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}</Select>
          </Form.Item>
          <Form.Item name="description" label="产品描述">
            <Input.TextArea rows={2} />
          </Form.Item>
          {editing && (
            <Form.Item name="status" label="状态">
              <Select>
                <Select.Option value="active">进行中</Select.Option>
                <Select.Option value="archived">已归档</Select.Option>
              </Select>
            </Form.Item>
          )}
          <Button type="primary" htmlType="submit" block style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', border: 'none', height: 42, fontWeight: 600 }}>
            {editing ? '保存修改' : '创建产品'}
          </Button>
        </Form>
      </Modal>
    </div>
  )
}
