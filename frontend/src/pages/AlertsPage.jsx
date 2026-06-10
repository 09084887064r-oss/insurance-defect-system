import React, { useEffect, useState } from 'react'
import { Table, Button, Tag, Card, Modal, Form, Input, Select, Space, message, Badge, Popconfirm, Tooltip } from 'antd'
import { PlusOutlined, ThunderboltOutlined, CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { alertApi, versionApi } from '../services/api'
import { useAuthStore } from '../store'

const LEVEL_CONFIG = {
  critical: { label: '🔴 紧急', color: '#dc2626', bg: 'rgba(220,38,38,0.1)', border: 'rgba(220,38,38,0.3)' },
  warning: { label: '🟠 警告', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)' },
  info: { label: '🟡 关注', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.3)' },
}
const RULE_TYPE_LABELS = {
  fatal_count: '致命缺陷数量',
  critical_ratio: '严重缺陷占比(%)',
  unhandled_days: '超时未处理(天)',
  daily_increase: '每日新增数量',
}

export default function AlertsPage() {
  const { user } = useAuthStore()
  const [alerts, setAlerts] = useState([])
  const [rules, setRules] = useState([])
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(false)
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [activeTab, setActiveTab] = useState('alerts')
  const [form] = Form.useForm()

  useEffect(() => {
    loadData()
    versionApi.list().then(r => setVersions(r.data.data))
  }, [])

  const loadData = async () => {
    setLoading(true)
    const [ar, ru] = await Promise.all([alertApi.list(), alertApi.rules()])
    setAlerts(ar.data.data)
    setRules(ru.data.data)
    setLoading(false)
  }

  const triggerCheck = async () => {
    await alertApi.triggerCheck()
    message.success('预警检查已触发，请稍候刷新查看结果')
    setTimeout(loadData, 2000)
  }

  const resolveAlert = async (id) => {
    await alertApi.resolve(id)
    message.success('已标记为已处理')
    loadData()
  }

  const createRule = async (values) => {
    await alertApi.createRule(values)
    message.success('预警规则创建成功')
    setShowRuleModal(false)
    form.resetFields()
    loadData()
  }

  const deleteRule = async (id) => {
    await alertApi.deleteRule(id)
    message.success('规则已删除')
    loadData()
  }

  const unresolvedCount = alerts.filter(a => !a.is_resolved).length

  return (
    <div className="page-container fade-in-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">🚨 预警中心</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            {unresolvedCount > 0 ? <span style={{ color: '#ef4444' }}>⚠️ {unresolvedCount} 个未处理预警</span> : '暂无未处理预警'}
          </div>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>刷新</Button>
          <Button icon={<ThunderboltOutlined />} onClick={triggerCheck} type="default">立即检查</Button>
          {['admin', 'manager'].includes(user?.role) && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowRuleModal(true)}
              style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', border: 'none' }}>
              新建规则
            </Button>
          )}
        </Space>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {[['alerts', `触发记录 (${alerts.length})`], ['rules', `预警规则 (${rules.length})`]].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 500, fontSize: 13,
            background: activeTab === key ? 'var(--accent)' : 'transparent',
            color: activeTab === key ? 'white' : 'var(--text-secondary)',
            transition: 'all 0.2s'
          }}>{label}</button>
        ))}
      </div>

      {/* Alert records */}
      {activeTab === 'alerts' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {alerts.map(a => (
            <div key={a.id} style={{
              background: LEVEL_CONFIG[a.alert_level]?.bg || 'var(--bg-secondary)',
              border: `1px solid ${LEVEL_CONFIG[a.alert_level]?.border || 'var(--border)'}`,
              borderRadius: 10, padding: 16,
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              opacity: a.is_resolved ? 0.5 : 1,
              transition: 'opacity 0.2s'
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, color: LEVEL_CONFIG[a.alert_level]?.color, fontSize: 14 }}>
                    {LEVEL_CONFIG[a.alert_level]?.label}
                  </span>
                  <Tag style={{ fontSize: 11, margin: 0 }}>{a.rule_name}</Tag>
                  {a.version_name && <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>{a.product_name} · {a.version_name}</Tag>}
                  {a.is_resolved && <Tag color="success" style={{ fontSize: 11, margin: 0 }}>✓ 已处理</Tag>}
                </div>
                <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginBottom: 4 }}>{a.message}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>触发时间：{a.triggered_at?.substring(0, 16)}</div>
              </div>
              {!a.is_resolved && ['admin', 'manager'].includes(user?.role) && (
                <Button size="small" type="primary" ghost icon={<CheckCircleOutlined />} onClick={() => resolveAlert(a.id)}>
                  标记处理
                </Button>
              )}
            </div>
          ))}
          {alerts.length === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div>暂无预警记录，系统运行正常</div>
            </div>
          )}
        </div>
      )}

      {/* Rules */}
      {activeTab === 'rules' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rules.map(r => (
            <div key={r.id} style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: 16,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderLeft: `4px solid ${LEVEL_CONFIG[r.alert_level]?.color || '#4f46e5'}`
            }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</span>
                  <Badge status={r.is_active ? 'success' : 'default'} text={r.is_active ? '启用' : '停用'} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {RULE_TYPE_LABELS[r.rule_type]} ≥ <b style={{ color: LEVEL_CONFIG[r.alert_level]?.color }}>{r.threshold}</b>
                  {' '}→ {LEVEL_CONFIG[r.alert_level]?.label}
                  {r.version_name && <span> · {r.product_name} v{r.version_name}</span>}
                  {!r.version_id && <span> · 全局规则</span>}
                </div>
              </div>
              {['admin', 'manager'].includes(user?.role) && (
                <Popconfirm title="确认删除该预警规则？" onConfirm={() => deleteRule(r.id)}>
                  <Button size="small" danger ghost>删除</Button>
                </Popconfirm>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Rule Modal */}
      <Modal title="新建预警规则" open={showRuleModal} onCancel={() => { setShowRuleModal(false); form.resetFields() }}
        footer={null} width={500}>
        <Form form={form} layout="vertical" onFinish={createRule} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="规则名称" rules={[{ required: true }]}>
            <Input placeholder="如：致命缺陷数量预警" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="rule_type" label="规则类型" rules={[{ required: true }]}>
              <Select placeholder="选择规则类型">
                {Object.entries(RULE_TYPE_LABELS).map(([k, v]) => <Select.Option key={k} value={k}>{v}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="threshold" label="触发阈值" rules={[{ required: true }]}>
              <Input type="number" placeholder="数值" />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="alert_level" label="预警级别" rules={[{ required: true }]}>
              <Select placeholder="选择预警级别">
                {Object.entries(LEVEL_CONFIG).map(([k, v]) => <Select.Option key={k} value={k}>{v.label}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item name="version_id" label="适用版本（空=全局）">
              <Select placeholder="全部版本" allowClear>
                {versions.map(v => <Select.Option key={v.id} value={v.id}>{v.product_name} - {v.version}</Select.Option>)}
              </Select>
            </Form.Item>
          </div>
          <Button type="primary" htmlType="submit" block
            style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', border: 'none', height: 42, fontWeight: 600 }}>
            创建规则
          </Button>
        </Form>
      </Modal>
    </div>
  )
}
