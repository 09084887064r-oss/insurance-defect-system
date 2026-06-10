import React, { useEffect, useState, useCallback } from 'react'
import { Table, Button, Tag, Select, Input, Space, Drawer, Form, Tooltip, Badge, Popconfirm, message, Row, Col } from 'antd'
import { PlusOutlined, SearchOutlined, FilterOutlined, EyeOutlined, EditOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { defectApi, versionApi, userApi } from '../services/api'
import { useAuthStore } from '../store'
import DefectForm from '../components/defects/DefectForm'

const SEVERITY_MAP = {
  fatal: { label: '致命', className: 'tag-fatal' },
  critical: { label: '严重', className: 'tag-critical' },
  major: { label: '一般', className: 'tag-major' },
  minor: { label: '提示', className: 'tag-minor' },
}
const STATUS_MAP = {
  new: '新建', assigned: '已指派', in_progress: '修复中',
  fixed: '已修复', pending_verify: '待验证', closed: '已关闭',
  reopened: '重新开启', rejected: '已拒绝'
}

export default function DefectsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [defects, setDefects] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [versions, setVersions] = useState([])
  const [users, setUsers] = useState([])
  const [filters, setFilters] = useState({ page: 1, limit: 20 })

  useEffect(() => {
    versionApi.list().then(r => setVersions(r.data.data))
    userApi.list().then(r => setUsers(r.data.data))
    loadDefects()
  }, [])

  const loadDefects = useCallback(async (newFilters = filters) => {
    setLoading(true)
    try {
      const params = Object.fromEntries(Object.entries(newFilters).filter(([_, v]) => v !== undefined && v !== ''))
      const r = await defectApi.list(params)
      setDefects(r.data.data)
      setTotal(r.data.total)
    } finally {
      setLoading(false)
    }
  }, [filters])

  const handleFilterChange = (key, value) => {
    const newFilters = { ...filters, [key]: value, page: 1 }
    setFilters(newFilters)
    loadDefects(newFilters)
  }

  const columns = [
    {
      title: 'ID', dataIndex: 'id', width: 60,
      render: id => <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 12 }}>#{id}</span>
    },
    {
      title: '等级', dataIndex: 'severity', width: 75,
      render: s => <Tag className={SEVERITY_MAP[s]?.className}>{SEVERITY_MAP[s]?.label}</Tag>
    },
    {
      title: '标题', dataIndex: 'title', ellipsis: true,
      render: (title, record) => (
        <Button type="link" style={{ padding: 0, textAlign: 'left', height: 'auto', color: 'var(--text-primary)', fontWeight: 500 }}
          onClick={() => navigate(`/defects/${record.id}`)}>
          {title}
        </Button>
      )
    },
    { title: '产品', dataIndex: 'product_name', width: 120, ellipsis: true, render: t => <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t}</span> },
    { title: '模块', dataIndex: 'module', width: 100, ellipsis: true, render: t => t || '-' },
    {
      title: '状态', dataIndex: 'status', width: 90,
      render: s => <Tag className={`status-${s}`}>{STATUS_MAP[s] || s}</Tag>
    },
    { title: '指派给', dataIndex: 'assignee_name', width: 90, render: t => t || <span style={{ color: 'var(--text-muted)' }}>未指派</span> },
    { title: '提交人', dataIndex: 'reporter_name', width: 90 },
    {
      title: '创建时间', dataIndex: 'created_at', width: 120,
      render: t => <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t?.substring(0, 10)}</span>
    },
    {
      title: '操作', width: 80, fixed: 'right',
      render: (_, record) => (
        <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => navigate(`/defects/${record.id}`)}>
          详情
        </Button>
      )
    },
  ]

  return (
    <div className="page-container fade-in-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">🐛 缺陷管理</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>共 {total} 条缺陷记录</div>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowForm(true)}
          style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', border: 'none', fontWeight: 600 }}>
          提交缺陷
        </Button>
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} sm={8} md={6}>
            <Input prefix={<SearchOutlined />} placeholder="搜索缺陷标题..." allowClear
              onChange={e => handleFilterChange('search', e.target.value)} />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select placeholder="严重等级" allowClear style={{ width: '100%' }} onChange={v => handleFilterChange('severity', v)}>
              {Object.entries(SEVERITY_MAP).map(([k, v]) => <Select.Option key={k} value={k}>{v.label}</Select.Option>)}
            </Select>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select placeholder="缺陷状态" allowClear style={{ width: '100%' }} onChange={v => handleFilterChange('status', v)}>
              {Object.entries(STATUS_MAP).map(([k, v]) => <Select.Option key={k} value={k}>{v}</Select.Option>)}
            </Select>
          </Col>
          <Col xs={12} sm={8} md={5}>
            <Select placeholder="测试版本" allowClear style={{ width: '100%' }} onChange={v => handleFilterChange('version_id', v)}>
              {versions.map(v => <Select.Option key={v.id} value={v.id}>{v.product_name} - {v.version}</Select.Option>)}
            </Select>
          </Col>
          <Col xs={12} sm={6} md={5}>
            <Select placeholder="指派给" allowClear style={{ width: '100%' }} onChange={v => handleFilterChange('assignee_id', v)}>
              {users.map(u => <Select.Option key={u.id} value={u.id}>{u.name}</Select.Option>)}
            </Select>
          </Col>
        </Row>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-secondary)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <Table
          columns={columns}
          dataSource={defects}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1100 }}
          pagination={{
            total,
            pageSize: filters.limit,
            current: filters.page,
            showSizeChanger: true,
            showTotal: (t, r) => `第 ${r[0]}-${r[1]} 条，共 ${t} 条`,
            onChange: (page, limit) => {
              const nf = { ...filters, page, limit }
              setFilters(nf)
              loadDefects(nf)
            }
          }}
          rowClassName={record => record.severity === 'fatal' ? 'ant-table-row-fatal' : ''}
        />
      </div>

      {/* Create defect drawer */}
      <Drawer
        title="提交新缺陷" width={600} open={showForm}
        onClose={() => setShowForm(false)} destroyOnClose
      >
        <DefectForm
          versions={versions} users={users}
          onSuccess={() => { setShowForm(false); loadDefects() }}
        />
      </Drawer>
    </div>
  )
}
