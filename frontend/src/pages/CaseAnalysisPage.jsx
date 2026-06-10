import React, { useState, useRef, useCallback } from 'react'
import {
  Button, Upload, Table, Tag, Progress, Drawer, Spin, Select,
  Tooltip, Badge, Card, Statistic, Empty, message, Tabs, Input
} from 'antd'
import {
  UploadOutlined, ThunderboltOutlined, SearchOutlined,
  FileExcelOutlined, InfoCircleOutlined, WarningOutlined,
  CheckCircleOutlined, RiseOutlined, ReloadOutlined
} from '@ant-design/icons'
import axios from 'axios'
import * as XLSX from 'xlsx'
import { useAuthStore } from '../store'

const API = axios.create({ baseURL: 'http://localhost:3001' })
API.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

const RISK_CONFIG = {
  high: { label: '高危', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', icon: '🔴' },
  mid:  { label: '中危', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', icon: '⚡' },
  low:  { label: '低危', color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', icon: '✅' },
}

const SEVERITY_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' }

export default function CaseAnalysisPage() {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [stats, setStats] = useState(null)
  const [bizFilter, setBizFilter] = useState('all')
  const [riskFilter, setRiskFilter] = useState('all')
  const [searchText, setSearchText] = useState('')
  const [selectedCase, setSelectedCase] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [manualText, setManualText] = useState('')
  const [activeTab, setActiveTab] = useState('upload')
  const fileRef = useRef()

  // 解析上传的文件内容
  const parseFileContent = async (file) => {
    return new Promise((resolve, reject) => {
      const ext = file.name.split('.').pop().toLowerCase()
      const reader = new FileReader()

      if (ext === 'txt' || ext === 'csv') {
        reader.onload = e => {
          const lines = e.target.result.split('\n').map(l => l.trim()).filter(l => l.length > 5)
          resolve(lines.map((text, i) => ({ id: `case_${i + 1}`, text })))
        }
        reader.readAsText(file, 'utf-8')
      } else if (ext === 'xlsx' || ext === 'xls') {
        reader.onload = e => {
          try {
            const wb = XLSX.read(e.target.result, { type: 'array' })
            const ws = wb.Sheets[wb.SheetNames[0]]
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
            const cases = rows
              .slice(1) // 跳过表头
              .map((row, i) => ({ id: `case_${i + 1}`, text: (row[0] || row[1] || '').toString().trim() }))
              .filter(c => c.text.length > 5)
            resolve(cases)
          } catch (e) { reject(e) }
        }
        reader.readAsArrayBuffer(file)
      } else {
        reject(new Error('不支持的文件格式'))
      }
    })
  }

  // 调用后端评分接口
  const analyzeCase = async (cases, filename) => {
    setLoading(true)
    try {
      const res = await API.post('/api/v1/cases/parse', { cases, filename })
      setResults(res.data.data)
      setStats(res.data.stats)
      message.success(`✅ 分析完成！共 ${res.data.stats.total} 条，高危 ${res.data.stats.high} 条`)
    } catch (e) {
      message.error('分析失败：' + (e.response?.data?.message || e.message))
    } finally {
      setLoading(false)
    }
  }

  // 文件上传处理
  const handleUpload = async (file) => {
    try {
      message.loading({ content: `正在解析文件 ${file.name}...`, key: 'parse' })
      const cases = await parseFileContent(file)
      if (cases.length === 0) { message.error('文件中没有有效的测试案例'); return false }
      message.success({ content: `解析到 ${cases.length} 条案例，正在分析...`, key: 'parse' })
      await analyzeCase(cases, file.name)
    } catch (e) {
      message.error('文件解析失败：' + e.message)
    }
    return false
  }

  // 手动输入单条分析
  const handleManualAnalyze = async () => {
    const lines = manualText.split('\n').map(l => l.trim()).filter(l => l.length > 3)
    if (!lines.length) { message.warning('请输入测试案例内容'); return }
    await analyzeCase(lines.map((text, i) => ({ id: `manual_${i + 1}`, text })), '手动输入')
    setActiveTab('result')
  }

  // 过滤结果
  const filteredResults = results.filter(r => {
    const matchBiz = bizFilter === 'all' || r.bizTypes?.some(b => b.bizType === bizFilter)
    const matchRisk = riskFilter === 'all' || r.riskLevel === riskFilter
    const matchSearch = !searchText || r.caseText?.includes(searchText)
    return matchBiz && matchRisk && matchSearch
  })

  const allBizTypes = [...new Set(results.flatMap(r => r.bizTypes?.map(b => b.bizType) || []))]

  const columns = [
    {
      title: '排序', width: 56, render: (_, __, idx) => (
        <span style={{ color: 'var(--text-muted)', fontSize: 12, fontFamily: 'monospace' }}>
          {String(idx + 1).padStart(2, '0')}
        </span>
      )
    },
    {
      title: '风险等级', dataIndex: 'riskLevel', width: 90,
      render: (level, r) => {
        const cfg = RISK_CONFIG[level] || RISK_CONFIG.low
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>{cfg.icon}</span>
            <Tag style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, fontWeight: 600, margin: 0 }}>
              {cfg.label}
            </Tag>
          </div>
        )
      }
    },
    {
      title: '风险评分', dataIndex: 'riskScore', width: 110,
      render: score => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 18, fontWeight: 700,
            color: score >= 8 ? '#ef4444' : score >= 5 ? '#f59e0b' : '#10b981'
          }}>{score}</span>
          <Progress
            percent={score * 10} size="small" showInfo={false}
            strokeColor={score >= 8 ? '#ef4444' : score >= 5 ? '#f59e0b' : '#10b981'}
            style={{ width: 48, margin: 0 }}
          />
        </div>
      )
    },
    {
      title: '测试案例内容', dataIndex: 'caseText', ellipsis: true,
      render: (text, r) => (
        <Button type="link" style={{ padding: 0, textAlign: 'left', height: 'auto', color: 'var(--text-primary)', fontWeight: 500, maxWidth: '100%' }}
          onClick={() => { setSelectedCase(r); setDrawerOpen(true) }}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 380 }}>
            {text}
          </span>
        </Button>
      )
    },
    {
      title: '业务类型', dataIndex: 'bizTypes', width: 160,
      render: types => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {types?.map(b => (
            <Tag key={b.bizType} style={{ fontSize: 11, margin: 0 }}>{b.icon} {b.label}</Tag>
          ))}
          {(!types || types.length === 0) && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>未识别</span>}
        </div>
      )
    },
    {
      title: '关联缺陷', dataIndex: 'similarDefects', width: 80, align: 'center',
      render: defects => (
        <Badge count={defects?.length || 0} showZero
          style={{ backgroundColor: defects?.length > 0 ? '#4f46e5' : '#64748b' }} />
      )
    },
    {
      title: '反馈状态', dataIndex: 'feedback', width: 100, align: 'center',
      render: feedback => {
        if (!feedback || feedback === 'none') {
          return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>未反馈</span>
        }
        const config = {
          hit: { label: '🎯 命中', color: 'success' },
          false_alarm: { label: '⚠️ 误报', color: 'warning' },
          missed: { label: '❌ 漏报', color: 'error' }
        }[feedback] || { label: '未知', color: 'default' }
        return <Tag color={config.color} style={{ margin: 0, fontWeight: 500 }}>{config.label}</Tag>
      }
    },
    {
      title: '操作', width: 72,
      render: (_, r) => (
        <Button size="small" type="link" onClick={() => { setSelectedCase(r); setDrawerOpen(true) }}>
          详情
        </Button>
      )
    },
  ]

  return (
    <div className="page-container fade-in-up">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">🎯 测试案例智能分析</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            基于规则引擎 · 历史缺陷库 328 条 · 风险自动排序
          </div>
        </div>
        {results.length > 0 && (
          <Button icon={<ReloadOutlined />} onClick={() => { setResults([]); setStats(null) }}>
            重新分析
          </Button>
        )}
      </div>

      {/* 统计卡片（有结果时显示） */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: '案例总数',   value: stats.total,    color: '#6366f1', icon: '📋' },
            { label: '高危案例',   value: stats.high,     color: '#ef4444', icon: '🔴' },
            { label: '中危案例',   value: stats.mid,      color: '#f59e0b', icon: '⚡' },
            { label: '低危案例',   value: stats.low,      color: '#10b981', icon: '✅' },
            { label: '平均风险分', value: stats.avgScore, color: '#3b82f6', icon: '📊' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
                </div>
                <span style={{ fontSize: 24 }}>{s.icon}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 主内容区 */}
      {results.length === 0 ? (
        <Tabs activeKey={activeTab} onChange={setActiveTab}
          items={[
            {
              key: 'upload', label: '📂 上传文件分析',
              children: (
                <Card style={{ marginTop: 8 }}>
                  <Upload.Dragger
                    accept=".xlsx,.xls,.csv,.txt"
                    beforeUpload={handleUpload}
                    showUploadList={false}
                    disabled={loading}
                    style={{ padding: '40px 0', background: 'var(--bg-elevated)', border: '2px dashed var(--border)' }}
                  >
                    {loading ? (
                      <div style={{ textAlign: 'center' }}>
                        <Spin size="large" />
                        <div style={{ marginTop: 16, color: 'var(--text-secondary)' }}>AI 风险评分中...</div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>📁</div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                          拖拽文件到此处，或点击上传
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                          支持 Excel (.xlsx/.xls)、CSV、TXT 格式<br />
                          Excel 第一列为测试案例内容，最多 500 条
                        </div>
                      </div>
                    )}
                  </Upload.Dragger>

                  <div style={{ marginTop: 24, padding: 16, background: 'var(--bg-elevated)', borderRadius: 8 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, fontWeight: 600 }}>
                      📋 Excel 格式示例：
                    </div>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-secondary)' }}>
                          {['测试案例内容（必填，第一列）', '案例编号（可选）', '优先级（可选）'].map(h => (
                            <th key={h} style={{ padding: '6px 10px', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'left' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ['客户申请减保，减保金额超过现金价值80%，系统允许通过', 'TC-001', '高'],
                          ['被保险人身故，受益人提交理赔申请，系统自动核赔', 'TC-002', '中'],
                        ].map((row, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                            {row.map((cell, j) => (
                              <td key={j} style={{ padding: '6px 10px', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )
            },
            {
              key: 'manual', label: '✏️ 手动输入分析',
              children: (
                <Card style={{ marginTop: 8 }}>
                  <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
                    每行一条测试案例，支持批量输入（最多50条）
                  </div>
                  <Input.TextArea
                    value={manualText}
                    onChange={e => setManualText(e.target.value)}
                    rows={10}
                    placeholder={`示例（每行一条）：\n客户申请减保，减保金额超过现金价值80%，系统允许通过\n被保险人身故，受益人提交理赔申请，系统自动核赔\n续保缴费成功后保单状态未更新`}
                    style={{ fontSize: 13 }}
                  />
                  <Button
                    type="primary" icon={<ThunderboltOutlined />} loading={loading}
                    onClick={handleManualAnalyze} style={{ marginTop: 12, background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', border: 'none', fontWeight: 600, height: 42 }}
                  >
                    开始风险分析
                  </Button>
                </Card>
              )
            }
          ]}
        />
      ) : (
        <>
          {/* 过滤栏 */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <Input
              prefix={<SearchOutlined />} placeholder="搜索案例内容..." allowClear style={{ width: 220 }}
              onChange={e => setSearchText(e.target.value)}
            />
            <Select value={riskFilter} onChange={setRiskFilter} style={{ width: 120 }}>
              <Select.Option value="all">全部风险</Select.Option>
              <Select.Option value="high">🔴 高危</Select.Option>
              <Select.Option value="mid">⚡ 中危</Select.Option>
              <Select.Option value="low">✅ 低危</Select.Option>
            </Select>
            <Select value={bizFilter} onChange={setBizFilter} style={{ width: 140 }}>
              <Select.Option value="all">全部业务类型</Select.Option>
              {allBizTypes.map(bt => (
                <Select.Option key={bt} value={bt}>{bt}</Select.Option>
              ))}
            </Select>
            <span style={{ color: 'var(--text-muted)', fontSize: 13, marginLeft: 'auto' }}>
              显示 {filteredResults.length} / {results.length} 条
            </span>
          </div>

          {/* 结果表格 */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <Table
              columns={columns} dataSource={filteredResults}
              rowKey="id" size="middle" scroll={{ x: 900 }}
              rowClassName={r => r.riskLevel === 'high' ? 'ant-table-row-fatal' : ''}
              pagination={{ pageSize: 20, showTotal: (t, r) => `第 ${r[0]}-${r[1]} 条，共 ${t} 条` }}
            />
          </div>
        </>
      )}

      {/* 案例详情抽屉 */}
      <Drawer
        title={<span>📋 案例详情 & 风险分析报告</span>}
        width={560} open={drawerOpen} onClose={() => setDrawerOpen(false)}
        styles={{ body: { padding: 20 } }}
      >
        {selectedCase && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 风险评分 */}
            <div style={{
              background: (RISK_CONFIG[selectedCase.riskLevel] || RISK_CONFIG.low).bg,
              border: `1px solid ${(RISK_CONFIG[selectedCase.riskLevel] || RISK_CONFIG.low).border}`,
              borderRadius: 10, padding: 20, textAlign: 'center'
            }}>
              <div style={{ fontSize: 48, fontWeight: 800, color: (RISK_CONFIG[selectedCase.riskLevel] || RISK_CONFIG.low).color }}>
                {selectedCase.riskScore}
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>
                {(RISK_CONFIG[selectedCase.riskLevel] || RISK_CONFIG.low).icon} {selectedCase.riskLabel}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                {selectedCase.bizTypes?.map(b => `${b.icon} ${b.label}`).join(' · ')}
              </div>
            </div>

            {/* 案例内容 */}
            <Card size="small" title="📝 测试案例内容">
              <div style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: 13 }}>
                {selectedCase.caseText}
              </div>
            </Card>

            {/* 评分依据 */}
            <Card size="small" title="🧠 AI 评分依据">
              <div style={{ color: 'var(--text-secondary)', lineHeight: 1.8, fontSize: 13 }}>
                {selectedCase.reason}
              </div>
            </Card>

            {/* 预警反馈 */}
            <Card size="small" title="🎯 预警反馈">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>准确性反馈：</span>
                {[
                  { value: 'hit', label: '🎯 命中', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
                  { value: 'false_alarm', label: '⚠️ 误报', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
                  { value: 'missed', label: '❌ 漏报', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
                ].map(btn => {
                  const active = (selectedCase.feedback || 'none') === btn.value
                  return (
                    <Button
                      key={btn.value}
                      size="small"
                      style={{
                        borderColor: active ? btn.color : 'var(--border)',
                        background: active ? btn.bg : 'transparent',
                        color: active ? btn.color : 'var(--text-secondary)',
                        fontWeight: active ? 600 : 400
                      }}
                      onClick={async () => {
                        try {
                          await API.post(`/api/v1/cases/${selectedCase.id}/feedback`, { feedback: btn.value })
                          message.success('反馈提交成功')
                          // 更新本地列表状态
                          const updated = results.map(r => r.id === selectedCase.id ? { ...r, feedback: btn.value } : r)
                          setResults(updated)
                          setSelectedCase({ ...selectedCase, feedback: btn.value })
                        } catch (e) {
                          message.error('提交反馈失败：' + (e.response?.data?.message || e.message))
                        }
                      }}
                    >
                      {btn.label}
                    </Button>
                  )
                })}
              </div>
            </Card>

            {/* 检查建议 */}
            {selectedCase.checkPoints?.length > 0 && (
              <Card size="small" title="✅ 检查建议">
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {selectedCase.checkPoints.map((p, i) => (
                    <li key={i} style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 6 }}>{p}</li>
                  ))}
                </ul>
              </Card>
            )}

            {/* 关联历史缺陷 */}
            {selectedCase.similarDefects?.length > 0 && (
              <Card size="small" title={`📚 关联历史缺陷（${selectedCase.similarDefects.length} 条）`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {selectedCase.similarDefects.map((d, i) => (
                    <div key={i} style={{
                      background: 'var(--bg-elevated)', borderRadius: 8, padding: 12,
                      borderLeft: `3px solid ${SEVERITY_COLOR[d.severity] || '#64748b'}`
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{d.title}</span>
                        <Tag style={{ fontSize: 10, color: SEVERITY_COLOR[d.severity] }}>{d.severity === 'high' ? '高危' : d.severity === 'medium' ? '中危' : '低危'}</Tag>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                        📅 {d.created_month} · 🖥️ {d.responsible_system}
                      </div>
                      <div style={{ fontSize: 12, color: '#a78bfa', background: 'rgba(167,139,250,0.1)', padding: '6px 8px', borderRadius: 4 }}>
                        💡 修复方案：{d.fix_summary}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}
