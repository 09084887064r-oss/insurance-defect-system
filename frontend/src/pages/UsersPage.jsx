import React, { useEffect, useState } from 'react'
import { Table, Avatar, Tag, Badge } from 'antd'
import { userApi } from '../services/api'

const ROLE_CONFIG = {
  admin: { label: '管理员', color: '#7c3aed' },
  manager: { label: '项目经理', color: '#4f46e5' },
  developer: { label: '开发人员', color: '#0891b2' },
  tester: { label: '测试员', color: '#059669' },
}

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    userApi.list().then(r => { setUsers(r.data.data); setLoading(false) })
  }, [])

  const columns = [
    {
      title: '用户', dataIndex: 'name', render: (name, r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar size={36} style={{ background: ROLE_CONFIG[r.role]?.color, fontWeight: 600 }}>{name?.charAt(0)}</Avatar>
          <div>
            <div style={{ fontWeight: 600 }}>{name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.email}</div>
          </div>
        </div>
      )
    },
    { title: '角色', dataIndex: 'role', width: 110, render: r => <Tag style={{ background: `${ROLE_CONFIG[r]?.color}22`, color: ROLE_CONFIG[r]?.color, border: `1px solid ${ROLE_CONFIG[r]?.color}44` }}>{ROLE_CONFIG[r]?.label}</Tag> },
    { title: '部门', dataIndex: 'department', width: 130 },
    { title: '状态', dataIndex: 'is_active', width: 80, render: v => <Badge status={v ? 'success' : 'default'} text={v ? '活跃' : '停用'} /> },
    { title: '创建时间', dataIndex: 'created_at', width: 120, render: t => t?.substring(0, 10) },
  ]

  return (
    <div className="page-container fade-in-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">👥 用户管理</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>共 {users.length} 名用户</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {Object.entries(ROLE_CONFIG).map(([role, config]) => {
          const count = users.filter(u => u.role === role).length
          return (
            <div key={role} style={{
              background: 'var(--bg-secondary)', border: `1px solid ${config.color}44`,
              borderLeft: `4px solid ${config.color}`, borderRadius: 10, padding: 16
            }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: config.color }}>{count}</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{config.label}</div>
            </div>
          )
        })}
      </div>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <Table columns={columns} dataSource={users} rowKey="id" loading={loading} pagination={false} />
      </div>
    </div>
  )
}
