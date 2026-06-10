import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Tag, Button, Timeline, Input, Form, Select, Space, Spin, Divider, Badge, message, Modal } from 'antd'
import { ArrowLeftOutlined, EditOutlined, UserAddOutlined, SendOutlined } from '@ant-design/icons'
import { defectApi, userApi } from '../services/api'
import { useAuthStore } from '../store'

const SEVERITY_MAP = { fatal: { label: '致命', className: 'tag-fatal' }, critical: { label: '严重', className: 'tag-critical' }, major: { label: '一般', className: 'tag-major' }, minor: { label: '提示', className: 'tag-minor' } }
const STATUS_MAP = { new: '新建', assigned: '已指派', in_progress: '修复中', fixed: '已修复', pending_verify: '待验证', closed: '已关闭', reopened: '重新开启', rejected: '已拒绝' }
const STATUS_TRANSITIONS = { new: ['assigned', 'rejected'], assigned: ['in_progress', 'rejected'], in_progress: ['fixed', 'rejected'], fixed: ['pending_verify'], pending_verify: ['closed', 'reopened'], closed: ['reopened'], reopened: ['assigned', 'in_progress'], rejected: ['reopened'] }
const STATUS_COLORS = { new: '#6366f1', assigned: '#3b82f6', in_progress: '#f59e0b', fixed: '#10b981', pending_verify: '#a78bfa', closed: '#64748b', reopened: '#ef4444', rejected: '#475569' }

export default function DefectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [defect, setDefect] = useState(null)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState([])
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadDefect()
    userApi.list().then(r => setUsers(r.data.data))
  }, [id])

  const loadDefect = async () => {
    setLoading(true)
    try {
      const r = await defectApi.get(id)
      setDefect(r.data.data)
    } finally {
      setLoading(false)
    }
  }

  const changeStatus = async (newStatus) => {
    await defectApi.changeStatus(id, { status: newStatus })
    message.success('状态已更新')
    loadDefect()
  }

  const assign = async (userId) => {
    await defectApi.assign(id, { assignee_id: userId })
    message.success('指派成功')
    loadDefect()
  }

  const submitComment = async () => {
    if (!comment.trim()) return
    setSubmitting(true)
    await defectApi.addComment(id, { content: comment })
    setComment('')
    setSubmitting(false)
    loadDefect()
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}><Spin size="large" /></div>
  if (!defect) return null

  const allowedTransitions = STATUS_TRANSITIONS[defect.status] || []

  return (
    <div className="page-container fade-in-up">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Button type="link" icon={<ArrowLeftOutlined />} onClick={() => navigate('/defects')} style={{ padding: 0, marginBottom: 12, color: 'var(--text-muted)' }}>
          返回缺陷列表
        </Button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>#{defect.id}</span>
              <Tag className={SEVERITY_MAP[defect.severity]?.className}>{SEVERITY_MAP[defect.severity]?.label}</Tag>
              <Tag className={`status-${defect.status}`}>{STATUS_MAP[defect.status]}</Tag>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{defect.title}</h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
              📁 {defect.product_name} · {defect.version_name} · {defect.module || '未分类'} · 提交人：{defect.reporter_name} · {defect.created_at?.substring(0, 16)}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16 }}>
        {/* Left: Detail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Description */}
          <Card title="缺陷描述">
            <div style={{ color: 'var(--text-secondary)', lineHeight: 1.8 }}>{defect.description || '（无描述）'}</div>
          </Card>

          {/* Steps */}
          <Card title="复现步骤">
            <pre style={{ whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.8, margin: 0 }}>
              {defect.steps_to_reproduce || '（未填写）'}
            </pre>
          </Card>

          {/* Expected vs Actual */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Card title="预期结果" size="small">
              <div style={{ color: '#6ee7b7', fontSize: 13 }}>{defect.expected_result || '（未填写）'}</div>
            </Card>
            <Card title="实际结果" size="small">
              <div style={{ color: '#fca5a5', fontSize: 13 }}>{defect.actual_result || '（未填写）'}</div>
            </Card>
          </div>

          {/* Root cause */}
          {(defect.root_cause || defect.root_cause_category) && (
            <Card title="根因分析">
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {defect.root_cause_category && <Tag color="purple">{defect.root_cause_category}</Tag>}
                {defect.risk_level && <Tag color={defect.risk_level === 'high' ? 'red' : 'orange'}>风险：{defect.risk_level}</Tag>}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{defect.root_cause}</div>
            </Card>
          )}

          {/* Comments & History */}
          <Card title={`评论与跟进 (${defect.comments?.length || 0})`}>
            <Timeline
              items={defect.comments?.map(c => ({
                color: c.type === 'status_change' ? '#f59e0b' : c.type === 'assignment' ? '#3b82f6' : '#4f46e5',
                children: (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                      <b style={{ color: 'var(--text-primary)' }}>{c.user_name}</b> · {c.created_at?.substring(0, 16)}
                      {c.type !== 'comment' && <Tag style={{ marginLeft: 8, fontSize: 10 }}>{c.type === 'status_change' ? '状态变更' : '指派变更'}</Tag>}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{c.content}</div>
                  </div>
                )
              }))}
            />

            {/* Add comment */}
            <Divider style={{ borderColor: 'var(--border)' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Input.TextArea
                value={comment} onChange={e => setComment(e.target.value)}
                placeholder="添加评论..." rows={2} style={{ flex: 1 }}
                onKeyDown={e => { if (e.ctrlKey && e.key === 'Enter') submitComment() }}
              />
              <Button type="primary" icon={<SendOutlined />} loading={submitting} onClick={submitComment}
                style={{ height: 'auto', background: '#4f46e5', border: 'none' }}>
                发送
              </Button>
            </div>
          </Card>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Status change */}
          <Card title="状态操作" size="small">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allowedTransitions.map(s => (
                <Button key={s} size="small" block
                  style={{ background: `${STATUS_COLORS[s]}22`, borderColor: STATUS_COLORS[s], color: STATUS_COLORS[s] }}
                  onClick={() => changeStatus(s)}>
                  → {STATUS_MAP[s]}
                </Button>
              ))}
              {allowedTransitions.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>当前状态无可用操作</div>}
            </div>
          </Card>

          {/* Assignment */}
          <Card title="指派处理人" size="small">
            <Select
              style={{ width: '100%' }} placeholder="选择处理人"
              value={defect.assignee_id}
              onChange={assign}
              options={users.filter(u => u.role === 'developer').map(u => ({ value: u.id, label: u.name }))}
            />
          </Card>

          {/* Info */}
          <Card title="缺陷信息" size="small">
            {[
              ['产品', defect.product_name],
              ['版本', defect.version_name],
              ['模块', defect.module || '-'],
              ['环境', defect.environment || '-'],
              ['优先级', defect.priority],
              ['报告人', defect.reporter_name],
              ['处理人', defect.assignee_name || '未指派'],
              ['关闭时间', defect.closed_at?.substring(0, 10) || '-'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}
