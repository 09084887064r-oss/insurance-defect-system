import React, { useEffect, useState } from 'react'
import { Card, Button, Select, Spin, Statistic, Table, Tag, Divider, message } from 'antd'
import { DownloadOutlined, FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons'
import { reportApi, versionApi } from '../services/api'
import ReactECharts from 'echarts-for-react'

const SEVERITY_LABELS = { fatal: '致命', critical: '严重', major: '一般', minor: '提示' }

export default function ReportsPage() {
  const [versions, setVersions] = useState([])
  const [selectedVersion, setSelectedVersion] = useState(null)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    versionApi.list().then(r => {
      setVersions(r.data.data)
      if (r.data.data.length > 0) setSelectedVersion(r.data.data[0].id)
    })
  }, [])

  useEffect(() => {
    if (selectedVersion) loadReport(selectedVersion)
  }, [selectedVersion])

  const loadReport = async (vId) => {
    setLoading(true)
    try {
      const r = await reportApi.summary(vId)
      setReport(r.data.data)
    } finally {
      setLoading(false)
    }
  }

  const exportExcel = async () => {
    if (!report) return
    // Dynamic import to avoid initial bundle size
    const ExcelJS = (await import('exceljs')).default
    const { saveAs } = await import('file-saver')

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('缺陷汇总')

    ws.addRow(['保险产品UAT测试报告'])
    ws.addRow([`产品：${report.version.product_name}`, `版本：${report.version.version}`, `生成时间：${report.generatedAt?.substring(0, 19)}`])
    ws.addRow([])

    if (report.aiAnalysis) {
      ws.addRow(['🧠 AI UAT 质量根因诊断'])
      ws.addRow(['现状诊断', report.aiAnalysis.summaryDiagnosis])
      ws.addRow(['根因分析', report.aiAnalysis.rootCauseAnalysis])
      ws.addRow([])
      ws.addRow(['🎯 研发过程纠偏建议'])
      report.aiAnalysis.correctiveSuggestions.forEach((s, idx) => {
        ws.addRow([`建议 ${idx + 1}`, s])
      })
      ws.addRow([])
    }

    ws.addRow(['缺陷统计'])
    ws.addRow(['总数', '致命', '严重', '一般', '提示', '关闭数', '关闭率'])
    const s = report.summary
    ws.addRow([s.total, s.fatal, s.critical, s.major, s.minor, s.closed, `${report.closeRate}%`])
    ws.addRow([])
    ws.addRow(['致命缺陷清单'])
    ws.addRow(['ID', '标题', '严重等级', '状态', '模块', '处理人', '创建时间'])
    report.fatalDefects.forEach(d => ws.addRow([d.id, d.title, '致命', d.status, d.module, d.assignee_name || '未指派', d.created_at?.substring(0, 10)]))

    const buffer = await wb.xlsx.writeBuffer()
    saveAs(new Blob([buffer]), `测试报告_${report.version.product_name}_${report.version.version}.xlsx`)
    message.success('Excel报告已下载')
  }

  const exportPdf = async () => {
    if (!report) return
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')

    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text(`保险产品UAT测试报告`, 14, 20)
    doc.setFontSize(11)
    doc.text(`产品：${report.version.product_name}  |  版本：${report.version.version}`, 14, 30)
    doc.text(`生成时间：${report.generatedAt?.substring(0, 19)}`, 14, 37)

    let currentY = 42

    if (report.aiAnalysis) {
      doc.setFontSize(11)
      doc.text(`【AI UAT 质量根因诊断与建议】`, 14, currentY)
      doc.setFontSize(9)

      const diagText = `质量评估：${report.aiAnalysis.summaryDiagnosis}`
      const splitDiag = doc.splitTextToSize(diagText, 180)
      doc.text(splitDiag, 14, currentY + 6)
      currentY += 6 + splitDiag.length * 4 + 2

      const causeText = `根因分析：${report.aiAnalysis.rootCauseAnalysis}`
      const splitCause = doc.splitTextToSize(causeText, 180)
      doc.text(splitCause, 14, currentY)
      currentY += splitCause.length * 4 + 3

      doc.text(`研发建议：`, 14, currentY)
      currentY += 5
      report.aiAnalysis.correctiveSuggestions.forEach((s, idx) => {
        const suggText = `${idx + 1}. ${s}`
        const splitSugg = doc.splitTextToSize(suggText, 175)
        doc.text(splitSugg, 18, currentY)
        currentY += splitSugg.length * 4 + 1
      })
      currentY += 5
    }

    const s = report.summary
    autoTable(doc, {
      startY: currentY,
      head: [['总缺陷', '致命', '严重', '一般', '提示', '关闭数', '关闭率']],
      body: [[s.total, s.fatal, s.critical, s.major, s.minor, s.closed, `${report.closeRate}%`]],
    })

    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      head: [['模块', '总数', '致命', '严重']],
      body: report.byModule.map(m => [m.module, m.count, m.fatal, m.critical]),
    })

    doc.save(`测试报告_${report.version.product_name}_${report.version.version}.pdf`)
    message.success('PDF报告已下载')
  }

  const moduleChartOption = report ? {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 16, right: 16, top: 16, bottom: 16, containLabel: true },
    xAxis: { type: 'value', axisLabel: { color: '#94a3b8' }, splitLine: { lineStyle: { color: '#2d2d42' } } },
    yAxis: { type: 'category', data: report.byModule.map(m => m.module), axisLabel: { color: '#94a3b8' } },
    series: [
      { name: '致命', type: 'bar', stack: 'a', data: report.byModule.map(m => m.fatal), itemStyle: { color: '#dc2626' } },
      { name: '严重', type: 'bar', stack: 'a', data: report.byModule.map(m => m.critical), itemStyle: { color: '#ea580c' } },
      { name: '其他', type: 'bar', stack: 'a', data: report.byModule.map(m => m.count - m.fatal - m.critical), itemStyle: { color: '#4f46e5', borderRadius: [0, 4, 4, 0] } },
    ]
  } : {}

  return (
    <div className="page-container fade-in-up">
      <div className="page-header">
        <div>
          <h1 className="page-title">📄 测试报告</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>自动生成版本测试质量报告</div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Select style={{ width: 280 }} value={selectedVersion} onChange={setSelectedVersion} placeholder="选择测试版本">
            {versions.map(v => <Select.Option key={v.id} value={v.id}>{v.product_name} - {v.version}</Select.Option>)}
          </Select>
          <Button icon={<FileExcelOutlined />} onClick={exportExcel} disabled={!report} style={{ borderColor: '#10b981', color: '#10b981' }}>导出 Excel</Button>
          <Button icon={<FilePdfOutlined />} onClick={exportPdf} disabled={!report} danger>导出 PDF</Button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <Spin size="large" tip="生成报告中..." />
        </div>
      ) : report ? (
        <>
          {/* Report header */}
          <Card style={{ marginBottom: 16, background: 'linear-gradient(135deg, rgba(79,70,229,0.1), rgba(124,58,237,0.05))', borderColor: 'rgba(79,70,229,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{report.version.product_name}</h2>
                <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>
                  版本：{report.version.version} · 负责人：{report.version.manager_name} · 状态：{report.version.status} · 生成：{report.generatedAt?.substring(0, 19)}
                </div>
              </div>
              <div style={{
                fontSize: 48, fontWeight: 800,
                color: report.closeRate >= 80 ? '#10b981' : report.closeRate >= 60 ? '#f59e0b' : '#ef4444'
              }}>
                {report.closeRate}%
                <div style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', textAlign: 'center' }}>关闭率</div>
              </div>
            </div>
          </Card>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: '总缺陷', value: report.summary.total, color: 'var(--text-primary)' },
              { label: '致命', value: report.summary.fatal, color: '#dc2626' },
              { label: '严重', value: report.summary.critical, color: '#ea580c' },
              { label: '一般', value: report.summary.major, color: '#d97706' },
              { label: '提示', value: report.summary.minor, color: '#65a30d' },
              { label: '已关闭', value: report.summary.closed, color: '#10b981' },
              { label: '未关闭', value: report.summary.open, color: '#f59e0b' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* AI UAT Quality Diagnosis Card */}
          {report.aiAnalysis && (
            <Card
              style={{
                marginBottom: 16,
                background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-elevated))',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: 12,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
              }}
              title={
                <span style={{ color: 'var(--text-primary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>🧠</span> AI UAT 质量根因诊断与过程纠偏建议
                </span>
              }
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
                {/* Left side: Diagnosis */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: '#f43f5e', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      🚨 质量现状评估
                    </h3>
                    <div style={{
                      background: 'rgba(244, 63, 94, 0.05)',
                      borderLeft: '4px solid #f43f5e',
                      padding: '10px 14px',
                      borderRadius: '0 8px 8px 0',
                      color: 'var(--text-secondary)',
                      fontSize: 12.5,
                      lineHeight: '1.6'
                    }}>
                      {report.aiAnalysis.summaryDiagnosis}
                    </div>
                  </div>

                  <div>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      🔍 缺陷核心根因分析
                    </h3>
                    <div style={{
                      background: 'rgba(245, 158, 11, 0.05)',
                      borderLeft: '4px solid #f59e0b',
                      padding: '10px 14px',
                      borderRadius: '0 8px 8px 0',
                      color: 'var(--text-secondary)',
                      fontSize: 12.5,
                      lineHeight: '1.6'
                    }}>
                      {report.aiAnalysis.rootCauseAnalysis}
                    </div>
                  </div>
                </div>

                {/* Right side: Suggestions */}
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                    🎯 研发过程纠偏建议 (下个版本建议)
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {report.aiAnalysis.correctiveSuggestions.map((s, idx) => (
                      <div key={idx} style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'flex-start',
                        background: 'rgba(16, 185, 129, 0.03)',
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: '1px solid rgba(16, 185, 129, 0.08)'
                      }}>
                        <span style={{
                          background: '#10b981',
                          color: '#fff',
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 10,
                          fontWeight: 'bold',
                          flexShrink: 0,
                          marginTop: 2
                        }}>
                          {idx + 1}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: '1.5' }}>
                          {s}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            {/* By module chart */}
            <Card title="模块缺陷分布">
              <ReactECharts option={moduleChartOption} style={{ height: 240 }} />
            </Card>

            {/* By root cause */}
            <Card title="根因分析分布">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {report.byRootCause.map((r, i) => (
                  <div key={r.category} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 100, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right', flexShrink: 0 }}>{r.category}</div>
                    <div style={{ flex: 1, background: 'var(--bg-elevated)', borderRadius: 4, height: 20, overflow: 'hidden' }}>
                      <div style={{
                        width: `${(r.count / report.byRootCause[0]?.count * 100)}%`, height: '100%',
                        background: ['#4f46e5', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626'][i % 6],
                        borderRadius: 4, transition: 'width 0.5s ease'
                      }} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', width: 24, flexShrink: 0 }}>{r.count}</div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Fatal defects list */}
          <Card title={`🔴 致命缺陷清单 (${report.fatalDefects.length})`} style={{ marginBottom: 16 }}>
            <Table
              dataSource={report.fatalDefects}
              rowKey="id"
              size="small"
              pagination={false}
              columns={[
                { title: 'ID', dataIndex: 'id', width: 60 },
                { title: '缺陷标题', dataIndex: 'title', ellipsis: true },
                { title: '状态', dataIndex: 'status', width: 90, render: s => <Tag className={`status-${s}`}>{s}</Tag> },
                { title: '模块', dataIndex: 'module', width: 100 },
                { title: '处理人', dataIndex: 'assignee_name', width: 100, render: t => t || '未指派' },
                { title: '创建时间', dataIndex: 'created_at', width: 110, render: t => t?.substring(0, 10) },
              ]}
            />
          </Card>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--text-muted)' }}>请选择测试版本以生成报告</div>
      )}
    </div>
  )
}
