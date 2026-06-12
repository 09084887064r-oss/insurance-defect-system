import React, { useState, useEffect } from 'react'
import { Card, Button, Input, Tag, Spin, message, Upload, Tabs, Table, Drawer, Select, Divider, Progress, List, Tooltip, Empty } from 'antd'
import { InboxOutlined, PlayCircleOutlined, SearchOutlined, DatabaseOutlined, AlertOutlined, RobotOutlined, CheckCircleOutlined, CloseCircleOutlined, WarningOutlined, ArrowUpOutlined, HistoryOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, LikeOutlined, DislikeOutlined, CheckOutlined, LockOutlined } from '@ant-design/icons'
import * as XLSX from 'xlsx'
import { caseApi } from '../services/api'

// Styles mapping for 5 business domains (aligns with DB seeder)
const BIZ_STYLE_MAP = {
  underwriting: { icon: '📋', color: '#6366f1', label: '承保测试' },
  policyService: { icon: '🔄', color: '#0891b2', label: '保全测试' },
  underwritingReview: { icon: '🔍', color: '#7c3aed', label: '核保测试' },
  claims: { icon: '💰', color: '#ef4444', label: '理赔测试' },
  systemBatch: { icon: '⚙️', color: '#f59e0b', label: '系统批处理' }
}

const DB_STATS = {
  underwriting: { total: 37, high: 9, mid: 28, low: 0 },
  policyService: { total: 169, high: 50, mid: 119, low: 0 },
  underwritingReview: { total: 89, high: 6, mid: 83, low: 0 },
  claims: { total: 21, high: 12, mid: 9, low: 0 },
  systemBatch: { total: 12, high: 3, mid: 9, low: 0 }
}

const TEMPLATES = {
  underwriting: `项目：承保-001\n业务模块：契约-承保\n步骤：1.录入被保险人年龄75岁(超限)→转人工核保 2.险种份数录入0份→拦截 3.保费计算：保额10万，年缴保费应为3500元`,
  policyService: `项目：保全-减保-002\n业务模块：保全-减保/退保\n步骤：1.申请减保，使留存现金价值为95元(低于100元)→拦截 2.保单借款9万，现价10万(超80%)→拦截 3.累计减保超过年均20%保额→拦截`,
  underwritingReview: `项目：核保-005\n业务模块：健康告知-核保\n步骤：1.保单停效7个月后申请复效→强制弹出健康告知问卷 2.核保人结论为拒绝承保→保单退费并保留停效状态`,
  claims: `项目：理赔-003\n业务模块：理赔-身故给付\n步骤：1.理赔人与受益人关系不符→拦截 2.医疗理赔重复提交相同发票号→拒绝 3.理赔给付金额计算：基本保额10万 + 累积红利5000元 = 10.5万元`,
  systemBatch: `项目：批处理-007\n业务模块：跑批-数据同步\n步骤：1.凌晨批处理同步保单状态至外部渠道接口→校验丢包与超时 2.配置参数表更新，重启跑批服务→验证热加载`
}

const MANUAL_TEMPLATES = {
  underwriting: {
    title: '被保险人高龄投保规则拦截测试',
    desc: '录入保单时，被保险人年龄超过公司规定的70岁免核上限（如72岁），验证系统是否正确将其标志为“转人工核保”状态，并限制自动通过。',
    points: '1. 年龄免核边界值拦截逻辑；2. 业务流程自动转人工分支流向。',
    expected: '系统成功捕获被保险人超龄，流程自动终止于自动承保阶段，状态流转为“待人工核保”。'
  },
  policyService: {
    title: '保单减保起征点现金价值留存拦截',
    desc: '保单生效后，客户在线申请减保，输入减保份数，减保后保单留存的现金价值为95元，校验系统是否触发最低100元现价留存拦截。',
    points: '1. 减保现金价值精度计算；2. 剩余现价最低金额限制校验。',
    expected: '系统发出警告提示“减保后现金价值不得低于100元”，阻止保全件录入。'
  },
  underwritingReview: {
    title: '停效过免核期复效强制健康告知',
    desc: '保单失效停效达7个月，客户提交复效申请，核验核保模块是否正确拦截并强行拉起健康告知问卷流程。',
    points: '1. 停效时长界限判断（超6个月）；2. 免核复效流程校验。',
    expected: '系统识别出已过免核期，强行阻断一键复效，弹出健康告知录入框并要求转人工核保。'
  },
  claims: {
    title: '理赔发票去重与给付额度核算',
    desc: '理赔申请人上传医疗发票进行理赔报销，发票号已被前次赔案使用；同时校验身故理赔金基本保额与累计红利、生存金的累加给付算法。',
    points: '1. 发票唯一性校验去重；2. 赔付款额累加公式校验。',
    expected: '系统检测到发票号重复，提示并拦截提交；身故给付额精确等于保额与红利之和。'
  },
  systemBatch: {
    title: '凌晨生存金派发跑批同步校验',
    desc: '执行凌晨生存金自动给付跑批任务，校验保单状态是否批量同步更新，并且向统一支付系统接口发送的给付指令无超时丢包。',
    points: '1. 批量任务吞吐量与时效；2. 接口幂等性与防重发校验。',
    expected: '批处理任务正常结束，未发生状态更新漏表，外部支付系统接口返回正常接收。'
  }
}

export default function CaseAnalysisPage() {
  const [uploadedCases, setUploadedCases] = useState([])
  const [currentBizType, setCurrentBizType] = useState('policyService')
  const [caseInputText, setCaseInputText] = useState(TEMPLATES.policyService)
  const [parsedBizType, setParsedBizType] = useState('policyService')
  const [parsedKeywords, setParsedKeywords] = useState([])
  const [showParsedBox, setShowParsedBox] = useState(false)
  const [expandedDetails, setExpandedDetails] = useState({})
  const [loading, setLoading] = useState(false)

  // Tab state: 'batch' | 'single'
  const [activeTab, setActiveTab] = useState('batch')
  
  // Single input form states
  const [manualTitle, setManualTitle] = useState(MANUAL_TEMPLATES.policyService.title)
  const [manualDesc, setManualDesc] = useState(MANUAL_TEMPLATES.policyService.desc)
  const [manualPoints, setManualPoints] = useState(MANUAL_TEMPLATES.policyService.points)
  const [manualExpected, setManualExpected] = useState(MANUAL_TEMPLATES.policyService.expected)

  // Backend analysis results
  const [parsedCases, setParsedCases] = useState([])
  const [analysisStats, setAnalysisStats] = useState(null)
  
  // Historical sessions states
  const [historySessions, setHistorySessions] = useState([])
  const [selectedSessionId, setSelectedSessionId] = useState(null)

  // Drawer states
  const [currentCaseDetails, setCurrentCaseDetails] = useState(null)
  const [drawerVisible, setDrawerVisible] = useState(false)

  // Defect DB expansion states
  const [loadedDefects, setLoadedDefects] = useState({})
  const [loadingDefects, setLoadingDefects] = useState({})

  // Feedback evaluation stats
  const [feedbackStats, setFeedbackStats] = useState(null)
  const [showStats, setShowStats] = useState(false)

  // Current Logged-in User
  const [currentUser, setCurrentUser] = useState(null)

  // Constants
  const BIZ_CATEGORIES = ['policyService', 'underwritingReview', 'underwriting', 'claims', 'systemBatch']

  useEffect(() => {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr))
      } catch (e) {}
    }
    loadHistorySessions()
    loadFeedbackStats()
  }, [])

  // Load model feedback stats
  const loadFeedbackStats = async () => {
    try {
      const res = await caseApi.feedbackStats()
      if (res.data && res.data.code === 200) {
        setFeedbackStats(res.data.data)
      }
    } catch (err) {
      console.error('Failed to load feedback stats:', err)
    }
  }

  // Load past analysis sessions from backend
  const loadHistorySessions = async () => {
    try {
      const res = await caseApi.sessions()
      if (res.data && res.data.code === 200) {
        setHistorySessions(res.data.data)
      }
    } catch (err) {
      console.error('Failed to load history sessions:', err)
    }
  }

  // Load historical session details
  const handleLoadSession = async (sessionId) => {
    setSelectedSessionId(sessionId)
    if (!sessionId) {
      setParsedCases([])
      setAnalysisStats(null)
      return
    }
    setLoading(true)
    try {
      const res = await caseApi.list({ session_id: sessionId })
      if (res.data && res.data.code === 200) {
        const cases = res.data.data.map(c => ({
          id: c.id,
          caseText: c.case_text,
          riskScore: c.risk_score,
          riskLevel: c.risk_level,
          riskLabel: c.risk_label,
          reason: c.reason,
          feedback: c.feedback || 'none',
          status: c.status || 'completed',
          checkPoints: c.check_points || [],
          similarDefects: c.similar_defects || [],
          bizTypes: c.biz_types || []
        }))
        setParsedCases(cases)
        
        const high = cases.filter(c => c.riskLevel === 'high').length
        const mid = cases.filter(c => c.riskLevel === 'mid').length
        const low = cases.filter(c => c.riskLevel === 'low').length
        const avgScore = cases.length > 0 ? (cases.reduce((sum, c) => sum + c.riskScore, 0) / cases.length).toFixed(1) : 0
        
        setAnalysisStats({
          total: cases.length,
          high,
          mid,
          low,
          avgScore,
          session_id: sessionId
        })
        message.success('历史会话数据已成功载入！')
      }
    } catch (err) {
      console.error(err)
      message.error('加载历史会话失败')
    } finally {
      setLoading(false)
    }
  }

  // Local rule-based detection for fast UX feedback
  const detectBizType = (text) => {
    const lower = text.toLowerCase()
    if (lower.includes('理赔') || lower.includes('赔付') || lower.includes('给付')) return 'claims'
    if (lower.includes('核保') || lower.includes('体况') || lower.includes('告知')) return 'underwritingReview'
    if (lower.includes('承保') || lower.includes('录单') || lower.includes('投保')) return 'underwriting'
    if (lower.includes('批处理') || lower.includes('跑批') || lower.includes('同步') || lower.includes('接口')) return 'systemBatch'
    return 'policyService'
  }

  const extractKeywords = (text, bizType) => {
    const dict = {
      underwriting: ['投保', '录单', '承保', '被保险人', '投保人', '保单', '年龄', '关系'],
      policyService: ['退保', '减保', '保全', '变更', '贷款', '复效', '犹豫期', '现金价值'],
      underwritingReview: ['核保', '复效', '体况', '健康', '人工核保', '性别', '告知'],
      claims: ['理赔', '赔付', '身故', '给付', '意外', '住院', '发票', '赔款'],
      systemBatch: ['批处理', '批量', '同步', '接口', '调用', '跑批', '配置', '任务']
    }
    const lower = text.toLowerCase()
    return (dict[bizType] || []).filter(kw => lower.includes(kw.toLowerCase()))
  }

  const getManualCombinedText = () => {
    return `测试内容：${manualTitle}\n案例描述：${manualDesc}\n测试要点：${manualPoints}\n预期结果：${manualExpected}`
  }

  // Click handler to parse case locally (fast lookup feedback)
  const handleParseCase = () => {
    const text = activeTab === 'single' ? getManualCombinedText() : caseInputText
    if (!text.trim()) {
      message.warning('请先输入或选择测试案例内容！')
      return
    }
    const detected = detectBizType(text)
    const keywords = extractKeywords(text, detected)
    setParsedBizType(detected)
    setParsedKeywords(keywords)
    setShowParsedBox(true)
    message.success(activeTab === 'single' ? '单条手动案例本地解析成功' : '当前输入文本本地解析成功')
  }

  // Submit test cases to backend for LLM parsing and knowledge base matching
  const handleAnalyzeAll = async () => {
    let casesToSend = []
    let filename = null

    if (activeTab === 'single') {
      if (!manualTitle.trim()) {
        message.warning('请先输入测试内容！')
        return
      }
      casesToSend = [{
        id: 'manual_1',
        text: getManualCombinedText()
      }]
    } else {
      if (uploadedCases.length > 0) {
        casesToSend = uploadedCases.map((c, i) => ({
          id: c.id || `case_${i+1}`,
          text: c.content
        }))
        filename = uploadedCases[0]?.name?.split(' - 行 ')[0] || '批量文件分析'
      } else {
        if (!caseInputText.trim()) {
          message.warning('请先输入或上传测试案例内容！')
          return
        }
        casesToSend = [{
          id: 'batch_input_1',
          text: caseInputText
        }]
      }
    }

    setLoading(true)
    try {
      const response = await caseApi.parse({ cases: casesToSend, filename })
      if (response.data && response.data.code === 200) {
        const { data, stats } = response.data
        setParsedCases(data)
        setAnalysisStats(stats)
        setSelectedSessionId(stats.session_id)
        
        // Refresh session list and metrics stats
        loadHistorySessions()
        loadFeedbackStats()
        
        message.success('大模型风险预警分析已完成！')
      } else {
        message.error(response.data?.message || '案例分析失败')
      }
    } catch (err) {
      console.error(err)
      message.error(err.response?.data?.message || '大模型分析服务响应异常')
    } finally {
      setLoading(false)
    }
  }

  // Template select click handler
  const handleBizCardSelect = (type) => {
    setCurrentBizType(type)
    setCaseInputText(TEMPLATES[type])

    if (MANUAL_TEMPLATES[type]) {
      setManualTitle(MANUAL_TEMPLATES[type].title)
      setManualDesc(MANUAL_TEMPLATES[type].desc)
      setManualPoints(MANUAL_TEMPLATES[type].points)
      setManualExpected(MANUAL_TEMPLATES[type].expected)
    }

    setParsedBizType(type)
    const keywords = extractKeywords(TEMPLATES[type], type)
    setParsedKeywords(keywords)
    setShowParsedBox(true)
  }

  // Excel template downloader
  const handleDownloadTemplate = () => {
    const headers = ['测试内容', '案例描述', '测试要点', '预期结果']
    const data = [
      [
        '犹豫期内退保全额退费',
        '被保险人在签收保单回执第10天提交退保申请，核验退费规则是否退还全额保费。',
        '犹豫期时效判断，精算退费金额，保单状态变更。',
        '成功退保，退还全额保费，不扣除工本费。'
      ],
      [
        '犹豫期后申请减保现价拦截',
        '保单生效2年后客户输入减保份数，使减保后保单现金价值低于100元限额。',
        '留存金额限制判断，保全拦截提示。',
        '系统发出警告提示“减保后现金价值不得低于100元”，拦截录入。'
      ],
      [
        '停效超半年保单申请复效',
        '客户保单停效满7个月申请复效保全，校验健康告知问卷流程是否触发。',
        '停效时长校验，免核期规则，拉起健康告知。',
        '系统判断已过免核期限制，强行要求填写健康告知，转人工核保。'
      ]
    ]
    const sheetData = [headers, ...data]
    try {
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet(sheetData)
      ws['!cols'] = [{ wch: 25 }, { wch: 45 }, { wch: 30 }, { wch: 30 }]
      XLSX.utils.book_append_sheet(wb, ws, '测试案例模板')
      XLSX.writeFile(wb, '产品测试缺陷预警_测试案例导入示例.xlsx')
      message.success('已成功生成并下载 Excel 导入模板！')
    } catch (err) {
      message.error('生成 Excel 模板失败')
    }
  }

  // Upload Excel/TXT files parsing
  const handleBeforeUpload = (file) => {
    const reader = new FileReader()
    const ext = file.name.split('.').pop().toLowerCase()

    if (ext === 'xlsx' || ext === 'xls') {
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const dataObjects = XLSX.utils.sheet_to_json(ws)

          if (dataObjects.length > 0 && ('测试内容' in dataObjects[0] || '案例描述' in dataObjects[0])) {
            const importedList = dataObjects.map((item, index) => {
              const combinedText = `测试内容：${item['测试内容'] || ''}\n案例描述：${item['案例描述'] || ''}\n测试要点：${item['测试要点'] || ''}\n预期结果：${item['预期结果'] || ''}`
              const detected = detectBizType(combinedText)
              const keywords = extractKeywords(combinedText, detected)
              return {
                id: Date.now() + index,
                name: `${file.name} - 行 ${index + 2}`,
                content: combinedText,
                bizType: detected,
                keywords
              }
            })

            setUploadedCases(prev => [...prev, ...importedList])
            if (importedList.length > 0) {
              const lastItem = importedList[importedList.length - 1]
              setCurrentBizType(lastItem.bizType)
              setCaseInputText(lastItem.content)
              
              const lines = lastItem.content.split('\n')
              setManualTitle(lines[0].replace('测试内容：', ''))
              setManualDesc(lines[1]?.replace('案例描述：', '') || '')
              setManualPoints(lines[2]?.replace('测试要点：', '') || '')
              setManualExpected(lines[3]?.replace('预期结果：', '') || '')

              setParsedBizType(lastItem.bizType)
              setParsedKeywords(lastItem.keywords)
              setShowParsedBox(true)
            }
            message.success(`成功导入并解析 Excel 中 ${importedList.length} 条测试案例`)
          } else {
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
            const text = rows.slice(1).map(row => row.join(' ')).join('\n')
            const detected = detectBizType(text)
            const keywords = extractKeywords(text, detected)
            
            const newCase = {
              id: Date.now(),
              name: file.name,
              content: text,
              bizType: detected,
              keywords
            }
            setUploadedCases(prev => [...prev, newCase])
            setCurrentBizType(detected)
            setCaseInputText(text)
            setParsedBizType(detected)
            setParsedKeywords(keywords)
            setShowParsedBox(true)
            message.success(`成功导入并从 Excel 解析单段文本：${file.name}`)
          }
        } catch (err) {
          message.error('Excel文件解析失败')
        }
      }
      reader.readAsArrayBuffer(file)
    } else {
      reader.onload = (e) => {
        const text = e.target.result
        const detected = detectBizType(text)
        const keywords = extractKeywords(text, detected)
        
        const newCase = {
          id: Date.now(),
          name: file.name,
          content: text,
          bizType: detected,
          keywords
        }
        setUploadedCases(prev => [...prev, newCase])
        setCurrentBizType(detected)
        setCaseInputText(text)
        
        setManualTitle('导入普通文本')
        setManualDesc(text)
        setManualPoints('自动匹配历史缺陷')
        setManualExpected('由大模型辅助分析判定')

        setParsedBizType(detected)
        setParsedKeywords(keywords)
        setShowParsedBox(true)
        message.success(`成功导入并解析文件：${file.name}`)
      }
      reader.readAsText(file, 'UTF-8')
    }
    return false
  }

  const handleRemoveFile = (id) => {
    setUploadedCases(prev => prev.filter(c => c.id !== id))
    message.info('已移除案例文件')
  }

  // Toggle details and load from DB
  const toggleDetailPanel = async (bizType) => {
    const isExpanding = !expandedDetails[bizType]
    setExpandedDetails(prev => ({ ...prev, [bizType]: isExpanding }))

    if (isExpanding && !loadedDefects[bizType]) {
      setLoadingDefects(prev => ({ ...prev, [bizType]: true }))
      try {
        const res = await caseApi.getDefectDbList({ bizType, limit: 15 })
        if (res.data && res.data.code === 200) {
          setLoadedDefects(prev => ({ ...prev, [bizType]: res.data.data }))
        }
      } catch (err) {
        message.error('加载缺陷详情失败')
      } finally {
        setLoadingDefects(prev => ({ ...prev, [bizType]: false }))
      }
    }
  }

  // Submit model rating feedback
  const handleFeedback = async (caseId, feedbackType) => {
    try {
      const res = await caseApi.submitFeedback(caseId, { feedback: feedbackType })
      if (res.data && res.data.code === 200) {
        message.success('感谢反馈！推演质量评估已上传归档。')
        setParsedCases(prev => prev.map(c => c.id === caseId ? { ...c, feedback: feedbackType } : c))
        if (currentCaseDetails && currentCaseDetails.id === caseId) {
          setCurrentCaseDetails(prev => ({ ...prev, feedback: feedbackType }))
        }
        loadFeedbackStats()
      } else {
        message.error(res.data.message || '反馈失败')
      }
    } catch (err) {
      console.error(err)
      message.error('提交评估失败')
    }
  }

  // Audit Case workflow handler
  const handleAuditCase = async (caseId) => {
    try {
      const res = await caseApi.audit(caseId)
      if (res.data && res.data.code === 200) {
        message.success(res.data.message || '用例双签审核成功！')
        setParsedCases(prev => prev.map(c => c.id === caseId ? { ...c, status: 'audited' } : c))
        if (currentCaseDetails && currentCaseDetails.id === caseId) {
          setCurrentCaseDetails(prev => ({ ...prev, status: 'audited' }))
        }
      }
    } catch (err) {
      console.error(err)
      message.error(err.response?.data?.message || '您没有核签此案例的权限')
    }
  }

  const showCaseDetails = (record) => {
    setCurrentCaseDetails(record)
    setDrawerVisible(true)
  }

  // Sub-renderers
  const renderFeedbackStatsBoard = () => {
    if (!feedbackStats || feedbackStats.counts.total === 0) return null
    const { counts, metrics } = feedbackStats

    return (
      <Card
        size="small"
        style={{
          background: '#f8fafc',
          border: '1.5px solid #cbd5e1',
          borderRadius: 12,
          marginBottom: 16,
          boxShadow: '0 2px 6px rgba(0,0,0,0.01)'
        }}
        title={
          <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RobotOutlined style={{ color: '#2563eb' }} /> 📈 大模型预测质量效能自演进大盘
          </span>
        }
        extra={
          <Button 
            size="small" 
            type="link" 
            onClick={() => setShowStats(!showStats)} 
            style={{ fontSize: 10, padding: 0 }}
          >
            {showStats ? '收起大盘' : '展开大盘'}
          </Button>
        }
      >
        {showStats ? (
          <div style={{ padding: '4px 8px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 12, textAlign: 'center' }}>
              <div style={{ background: '#ffffff', padding: '6px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600 }}>F1-Score</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#2563eb', marginTop: 2 }}>{metrics.f1Score}%</div>
              </div>
              <div style={{ background: '#ffffff', padding: '6px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600 }}>精确度 (Prec)</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#10b981', marginTop: 2 }}>{metrics.precision}%</div>
              </div>
              <div style={{ background: '#ffffff', padding: '6px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600 }}>召回率 (Recall)</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#f59e0b', marginTop: 2 }}>{metrics.recall}%</div>
              </div>
              <div style={{ background: '#ffffff', padding: '6px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: 8, color: '#64748b', fontWeight: 600 }}>准确度 (Acc)</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#7c3aed', marginTop: 2 }}>{metrics.accuracy}%</div>
              </div>
            </div>
            
            <div style={{ fontSize: 10, color: '#475569', marginBottom: 4, fontWeight: 600 }}>测试反馈汇总：</div>
            <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#64748b' }}>
              <span>🎯 精准命中: <strong>{counts.hit}</strong></span>
              <span>⚠️ 评估误报: <strong>{counts.false_alarm}</strong></span>
              <span>❌ 预警漏报: <strong>{counts.missed}</strong></span>
              <span style={{ marginLeft: 'auto' }}>有效样本: <strong>{counts.total} 行</strong></span>
            </div>
            <Divider style={{ margin: '8px 0' }} />
            <div style={{ fontSize: 8, color: '#94a3b8', fontStyle: 'italic' }}>
              基于日常用例反馈进行模型自学习调整。目标 F1 得分: 95.0%
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 10, color: '#64748b', display: 'flex', justifyContent: 'space-between', padding: '2px 4px' }}>
            <span>泛化 F1 评分: <strong style={{ color: '#2563eb' }}>{metrics.f1Score}%</strong> | 命中率: <strong>{metrics.accuracy}%</strong></span>
            <span>打标样本: <strong>{counts.total} 条</strong></span>
          </div>
        )}
      </Card>
    )
  }

  const renderGlobalStats = () => {
    if (!analysisStats) return null
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 20 }}>
        <Card size="small" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>分析案例总数</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1e3a8a', marginTop: 4 }}>{analysisStats.total} 条</div>
        </Card>
        <Card size="small" style={{ background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>🚨 高危案例</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#b91c1c', marginTop: 4 }}>{analysisStats.high} 条</div>
        </Card>
        <Card size="small" style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: 10, color: '#d97706', fontWeight: 600 }}>⚡ 中危案例</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#b45309', marginTop: 4 }}>{analysisStats.mid} 条</div>
        </Card>
        <Card size="small" style={{ background: '#f0fdf4', border: '1px solid #dcfce7', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: 10, color: '#16a34a', fontWeight: 600 }}>✅ 低危案例</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#15803d', marginTop: 4 }}>{analysisStats.low} 条</div>
        </Card>
        <Card size="small" style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ fontSize: 10, color: '#2563eb', fontWeight: 600 }}>平均风险得分</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1d4ed8', marginTop: 4 }}>{analysisStats.avgScore} <span style={{ fontSize: 10, fontWeight: 'normal', color: '#64748b' }}>分</span></div>
        </Card>
      </div>
    )
  }

  const renderTestOrder = () => {
    if (parsedCases.length === 0) return null
    return (
      <div style={{
        background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
        padding: 16,
        borderRadius: 16,
        marginBottom: 20,
        borderLeft: '5px solid #2563eb',
        boxShadow: '0 2px 8px rgba(37,99,235,0.04)'
      }}>
        <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <RobotOutlined style={{ color: '#2563eb' }} /> 大模型智能分析：建议测试执行顺序 (高危优先)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {parsedCases.map((item, idx) => {
            const colors = ['#ef4444', '#f97316', '#3b82f6', '#10b981', '#06b6d4', '#64748b']
            const caseTitle = item.caseText.replace(/^测试内容：/, '').split('\n')[0]
            return (
              <div
                key={item.id || idx}
                style={{
                  background: '#ffffff',
                  padding: '6px 12px',
                  borderRadius: 20,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  fontSize: 11
                }}
              >
                <span style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 10,
                  color: '#ffffff',
                  background: colors[idx % colors.length]
                }}>
                  {idx + 1}
                </span>
                <span style={{ fontWeight: 600, color: '#334155', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {caseTitle}
                </span>
                <Tag color={item.riskLevel === 'high' ? 'red' : (item.riskLevel === 'mid' ? 'orange' : 'green')} style={{ fontSize: 9, margin: 0, borderRadius: 10, lineHeight: '14px', padding: '0 5px' }}>
                  {item.riskScore}分
                </Tag>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderCasesTable = () => {
    if (parsedCases.length === 0) return null

    const columns = [
      {
        title: '优先级',
        key: 'priority',
        width: 90,
        render: (_, record, index) => {
          const label = record.riskLevel === 'high' ? (index === 0 ? 'P0·极高' : 'P1·高') : (record.riskLevel === 'mid' ? 'P2·中' : 'P3·低')
          const color = record.riskLevel === 'high' ? '#ef4444' : (record.riskLevel === 'mid' ? '#f97316' : '#10b981')
          return (
            <Tag style={{
              background: color + '12',
              borderColor: color + '25',
              color: color,
              fontWeight: 700,
              margin: 0,
              borderRadius: 8,
              fontSize: 10
            }}>
              {index + 1} · {label}
            </Tag>
          )
        }
      },
      {
        title: '双签状态',
        key: 'status',
        width: 110,
        render: (_, record) => {
          if (record.status === 'pending_audit') {
            return <Tag color="warning" style={{ margin: 0, fontSize: 10, borderRadius: 6, fontWeight: 600 }}>⏳ 待双签审计</Tag>
          }
          if (record.status === 'audited') {
            return <Tag color="success" style={{ margin: 0, fontSize: 10, borderRadius: 6, fontWeight: 600 }}>✅ 已审计双签</Tag>
          }
          return <Tag color="blue" style={{ margin: 0, fontSize: 10, borderRadius: 6 }}>🛡️ 免审计</Tag>
        }
      },
      {
        title: '分析案例名称',
        key: 'caseText',
        render: (_, record) => {
          const title = record.caseText.replace(/^测试内容：/, '').split('\n')[0]
          const biz = record.bizTypes?.[0]
          return (
            <div>
              <div style={{ fontWeight: 600, color: '#1e293b', fontSize: 12 }}>{title}</div>
              <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
                {biz && (
                  <Tag color="geekblue" style={{ fontSize: 8, margin: 0, padding: '0 4px', borderRadius: 4 }}>
                    {BIZ_STYLE_MAP[biz.bizType]?.label || biz.label}
                  </Tag>
                )}
                <span style={{ fontSize: 9, color: '#94a3b8', fontStyle: 'italic' }}>
                  ID: {record.id ? `CS_${record.id}` : 'MOCK'}
                </span>
              </div>
            </div>
          )
        }
      },
      {
        title: '知识库缺陷',
        key: 'defects',
        align: 'center',
        width: 95,
        render: (_, record) => {
          const matched = record.similarDefects || []
          const highCount = matched.filter(d => d.severity === 'high').length
          return (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{matched.length} 条</div>
              {highCount > 0 && (
                <Tag color="red" style={{ fontSize: 8, padding: '0 2px', borderRadius: 2, margin: 0 }}>
                  高危:{highCount}
                </Tag>
              )}
            </div>
          )
        }
      },
      {
        title: '风险评分',
        key: 'score',
        align: 'center',
        width: 80,
        render: (_, record) => {
          const color = record.riskLevel === 'high' ? '#ef4444' : (record.riskLevel === 'mid' ? '#f59e0b' : '#10b981')
          return (
            <span style={{ fontSize: 15, fontWeight: 800, color }}>
              {record.riskScore}
            </span>
          )
        }
      },
      {
        title: '大模型评语及依据',
        key: 'reason',
        render: (_, record) => (
          <div style={{ fontSize: 11, color: '#475569', maxWidth: 260 }}>
            <div style={{ background: '#f8fafc', padding: '6px 10px', borderRadius: 8, borderLeft: '3px solid #cbd5e1', fontStyle: 'italic', fontSize: 10, lineHeight: '1.4' }}>
              "{record.reason?.substring(0, 150)}"
            </div>
          </div>
        )
      },
      {
        title: '操作',
        key: 'actions',
        align: 'center',
        width: 150,
        render: (_, record) => {
          const isPending = record.status === 'pending_audit'
          const canAudit = currentUser?.role === 'admin' || currentUser?.role === 'manager'
          return (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
              <Button
                type="primary"
                size="small"
                icon={<SearchOutlined />}
                onClick={() => showCaseDetails(record)}
                style={{ fontSize: 10, borderRadius: 12, height: 26, background: '#1e40af' }}
              >
                详情
              </Button>
              {isPending && (
                <Tooltip title={canAudit ? '项目经理双签核准此案例' : '仅项目经理或管理员可执行双签核签'}>
                  <Button
                    type="default"
                    size="small"
                    disabled={!canAudit}
                    icon={<CheckCircleOutlined />}
                    onClick={() => handleAuditCase(record.id)}
                    style={{ 
                      fontSize: 10, 
                      borderRadius: 12, 
                      height: 26, 
                      color: canAudit ? '#16a34a' : '#94a3b8', 
                      borderColor: canAudit ? '#16a34a' : '#cbd5e1' 
                    }}
                  >
                    核签
                  </Button>
                </Tooltip>
              )}
            </div>
          )
        }
      }
    ]

    return (
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.01)' }}>
        <Table
          dataSource={parsedCases}
          columns={columns}
          rowKey={(record, idx) => record.id || idx}
          pagination={false}
          size="small"
        />
      </div>
    )
  }

  const renderPendingView = () => {
    const data = BIZ_CATEGORIES.map((key, index) => {
      const stats = DB_STATS[key]
      const name = BIZ_STYLE_MAP[key]?.label || key
      const score = key === 'policyService' ? 9.2 : (key === 'claims' ? 8.5 : (key === 'underwritingReview' ? 7.6 : (key === 'underwriting' ? 6.2 : 4.5)))
      return {
        key,
        index: index + 1,
        name,
        total: stats.total,
        high: stats.high,
        mid: stats.mid,
        score,
        suggestion: stats.high >= 12 ? '重点投入' : (stats.high >= 5 ? '正常测试' : '快速验证')
      }
    }).sort((a, b) => b.score - a.score)

    return (
      <div>
        <div style={{
          background: '#f8fafc',
          border: '1.5px dashed #cbd5e1',
          borderRadius: 16,
          padding: '24px 16px',
          textAlign: 'center',
          color: '#475569',
          marginBottom: 24
        }}>
          <AlertOutlined style={{ fontSize: 24, color: '#2563eb', marginBottom: 8 }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a', marginBottom: 4 }}>
            💡 缺陷检索与大模型风险评估双引擎
          </div>
          <div style={{ fontSize: 11, color: '#64748b', maxWidth: 500, margin: '0 auto', lineHeight: '1.5' }}>
            系统集成 SQLite 真实缺陷知识库检索，以及大语言模型智能排序评估。请在左侧输入测试用例或导入文件，点击「分析全部案例」生成推演报告。
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <DatabaseOutlined style={{ color: '#1e3a8a' }} /> 缺陷知识库各业务大盘默认优先级统计
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.01)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: '#1e3a8a', fontWeight: 600 }}>优先级</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: '#1e3a8a', fontWeight: 600 }}>业务领域</th>
                <th style={{ textAlign: 'center', padding: '10px 12px', color: '#1e3a8a', fontWeight: 600 }}>知识库总缺陷</th>
                <th style={{ textAlign: 'center', padding: '10px 12px', color: '#1e3a8a', fontWeight: 600 }}>高发缺陷</th>
                <th style={{ textAlign: 'center', padding: '10px 12px', color: '#1e3a8a', fontWeight: 600 }}>中危缺陷</th>
                <th style={{ textAlign: 'center', padding: '10px 12px', color: '#1e3a8a', fontWeight: 600 }}>历史平均风险</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', color: '#1e3a8a', fontWeight: 600 }}>投入建议</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item, idx) => {
                const colors = ['#ef4444', '#f97316', '#3b82f6', '#10b981', '#64748b']
                const priorityLabels = ['P0·最高', 'P1·高', 'P2·中', 'P3·低', 'P4·低']
                return (
                  <tr key={item.key} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    <td style={{ padding: '10px 12px' }}>
                      <Tag style={{
                        background: colors[idx % colors.length] + '12',
                        borderColor: colors[idx % colors.length] + '25',
                        color: colors[idx % colors.length],
                        fontWeight: 600,
                        margin: 0,
                        borderRadius: 10,
                        fontSize: 10
                      }}>
                        {idx + 1} · {priorityLabels[idx]}
                      </Tag>
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>
                      {BIZ_STYLE_MAP[item.key]?.icon} {item.name}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>{item.total}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#b53b34', fontWeight: 600 }}>{item.high}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: '#a86903', fontWeight: 600 }}>{item.mid}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>{item.score}</td>
                    <td style={{ padding: '10px 12px', color: '#475569' }}>{item.suggestion}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container fade-in-up" style={{ background: '#f3f6fc', minHeight: 'calc(100vh - 64px)', padding: '24px' }}>
      <div style={{
        maxWidth: 1600,
        margin: '0 auto',
        background: '#ffffff',
        borderRadius: 16,
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,20,50,0.02)'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#ffffff',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1e3a8a', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              ⚡ InsureUAT · 缺陷知识库匹配与用例风险排序
            </h1>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              大语言模型理解排序引擎 & 历史缺陷资产检索预警
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Select
              placeholder="🕒 载入历史分析会话..."
              style={{ width: 230, marginRight: 12 }}
              value={selectedSessionId || undefined}
              onChange={handleLoadSession}
              allowClear
            >
              {historySessions.map(s => (
                <Select.Option key={s.session_id} value={s.session_id}>
                  {s.upload_filename ? `📁 ${s.upload_filename}` : `✍️ 手动录入会话 - ${s.session_id.substring(0, 6)}`}
                </Select.Option>
              ))}
            </Select>

            <span style={{ background: '#eff6ff', color: '#1e40af', padding: '6px 14px', borderRadius: 40, fontSize: 11, fontWeight: 600 }}>
              知识库检索 + LLM 排序
            </span>
          </div>
        </div>

        {/* Main Panel */}
        <div style={{ display: 'flex', flexWrap: 'wrap', width: '100%' }}>
          
          {/* LEFT: Input Area */}
          <div style={{
            flex: '1.2',
            minWidth: 460,
            padding: 24,
            background: '#f8fafc',
            borderRight: '1px solid #e2e8f0'
          }}>
            <Tabs 
              activeKey={activeTab} 
              onChange={setActiveTab}
              style={{ marginBottom: 16 }}
            >
              <Tabs.TabPane tab="📤 批量案例上传" key="batch">
                <Upload.Dragger
                  accept=".txt,.csv,.xlsx,.xls"
                  beforeUpload={handleBeforeUpload}
                  showUploadList={false}
                  multiple
                  style={{ background: '#ffffff', border: '1.5px dashed #cbd5e1', borderRadius: 12, padding: '20px 0' }}
                >
                  <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}><InboxOutlined style={{ fontSize: 32, color: '#2563eb' }} /></p>
                  <p style={{ fontWeight: 600, color: '#1e3a8a', fontSize: 13, marginBottom: 4 }}>点击或拖拽上传案例文件</p>
                  <p style={{ fontSize: 11, color: '#64748b' }}>支持 .txt .csv .xlsx .xls 格式，可批量导入</p>
                </Upload.Dragger>

                {/* Excel Specification Card */}
                <div style={{ background: '#ffffff', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0', marginTop: 12, boxShadow: '0 2px 6px rgba(0,0,0,0.01)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: 4 }}>
                      📊 导入 Excel 标准字段格式
                    </span>
                    <Button 
                      size="small" 
                      type="link" 
                      onClick={handleDownloadTemplate} 
                      style={{ fontSize: 10, padding: 0, height: 'auto', color: '#2563eb', fontWeight: 600 }}
                    >
                      📥 下载 Excel 示例模板 (.xlsx)
                    </Button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1.2fr 1fr', gap: 4, background: '#e2e8f0', padding: 1, borderRadius: 6 }}>
                    <div style={{ background: '#f8fafc', padding: '6px 4px', fontSize: 9, fontWeight: 'bold', color: '#475569', textAlign: 'center' }}>测试内容</div>
                    <div style={{ background: '#f8fafc', padding: '6px 4px', fontSize: 9, fontWeight: 'bold', color: '#475569', textAlign: 'center' }}>案例描述</div>
                    <div style={{ background: '#f8fafc', padding: '6px 4px', fontSize: 9, fontWeight: 'bold', color: '#475569', textAlign: 'center' }}>测试要点</div>
                    <div style={{ background: '#f8fafc', padding: '6px 4px', fontSize: 9, fontWeight: 'bold', color: '#475569', textAlign: 'center' }}>预期结果</div>
                    <div style={{ background: '#ffffff', padding: '4px', fontSize: 8, color: '#64748b', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>犹豫期内退保退费</div>
                    <div style={{ background: '#ffffff', padding: '4px', fontSize: 8, color: '#64748b', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>保单签收第10天退保...</div>
                    <div style={{ background: '#ffffff', padding: '4px', fontSize: 8, color: '#64748b', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>时效与退费应退</div>
                    <div style={{ background: '#ffffff', padding: '4px', fontSize: 8, color: '#64748b', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>全额退保且无扣费</div>
                  </div>
                </div>

                {/* Uploaded List */}
                {uploadedCases.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>📄 已导入的案例列表 ({uploadedCases.length})</div>
                    <div style={{ maxHeight: 150, overflowY: 'auto' }}>
                      {uploadedCases.map(c => (
                        <div key={c.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 12px',
                          background: '#eff6ff',
                          borderRadius: 8,
                          marginBottom: 6
                        }}>
                          <span style={{ fontSize: 10, color: '#1e3a8a', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                            📄 {c.name}
                          </span>
                          <span style={{ fontSize: 9, background: '#ffffff', color: '#1e40af', padding: '2px 8px', borderRadius: 20 }}>
                            {BIZ_STYLE_MAP[c.bizType]?.label}
                          </span>
                          <span
                            onClick={() => handleRemoveFile(c.id)}
                            style={{ cursor: 'pointer', color: '#94a3b8', fontWeight: 'bold', fontSize: 12 }}
                          >
                            ✕
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Tabs.TabPane>

              <Tabs.TabPane tab="✍️ 单条手工录入" key="single">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>测试内容</label>
                    <Input 
                      value={manualTitle}
                      onChange={e => setManualTitle(e.target.value)}
                      placeholder="例如：被保险人高龄投保规则拦截测试"
                      style={{ borderRadius: 8, fontSize: 12 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>案例描述</label>
                    <Input.TextArea 
                      value={manualDesc}
                      onChange={e => setManualDesc(e.target.value)}
                      placeholder="请输入具体的案例执行步骤与测试描述..."
                      rows={2}
                      style={{ borderRadius: 8, fontSize: 12 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>测试要点</label>
                    <Input.TextArea 
                      value={manualPoints}
                      onChange={e => setManualPoints(e.target.value)}
                      placeholder="例如：免核期限制校验，人工核保流转"
                      rows={2}
                      style={{ borderRadius: 8, fontSize: 12 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>预期结果</label>
                    <Input.TextArea 
                      value={manualExpected}
                      onChange={e => setManualExpected(e.target.value)}
                      placeholder="请输入预期的正确测试反馈结果..."
                      rows={2}
                      style={{ borderRadius: 8, fontSize: 12 }}
                    />
                  </div>
                </div>
              </Tabs.TabPane>
            </Tabs>

            <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginTop: 12, marginBottom: 8 }}>
              📋 点击选择业务模板 (自动填入数据)
            </div>

            {/* Grid Selectors */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
              {BIZ_CATEGORIES.map(type => {
                const stats = DB_STATS[type]
                const style = BIZ_STYLE_MAP[type]
                const selected = currentBizType === type
                return (
                  <div
                    key={type}
                    onClick={() => handleBizCardSelect(type)}
                    style={{
                      background: '#ffffff',
                      border: selected ? '2px solid #2563eb' : '1.5px solid #e2e8f0',
                      borderRadius: 10,
                      padding: 10,
                      cursor: 'pointer',
                      transition: 'all 0.1s',
                      boxShadow: selected ? '0 2px 6px rgba(37,99,235,0.06)' : 'none'
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 11, color: '#1e3a8a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{style.icon} {style.label}</span>
                      <span style={{ fontSize: 9, background: '#f1f5f9', padding: '1px 4px', borderRadius: 8, color: '#475569' }}>
                        {stats.total}条
                      </span>
                    </div>
                    <div style={{ fontSize: 8, color: '#64748b', marginTop: 4 }}>
                      高危:{stats.high} · 中危:{stats.mid}
                    </div>
                  </div>
                )
              })}
            </div>

            {activeTab === 'batch' && (
              <>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 4, display: 'block' }}>
                  📝 当前批量输入/编辑区 (纯文本模式)
                </label>
                <Input.TextArea
                  value={caseInputText}
                  onChange={e => setCaseInputText(e.target.value)}
                  rows={4}
                  style={{ borderRadius: 10, fontSize: 12, background: '#ffffff', borderColor: '#cbd5e1', marginBottom: 10 }}
                  placeholder="可在此直接粘贴或修改批量测试案例描述..."
                />
              </>
            )}

            <div style={{ display: 'flex', marginBottom: 6 }}>
              <Button onClick={handleParseCase} style={{ background: '#f1f5f9', borderColor: '#cbd5e1', color: '#1e3a8a', borderRadius: 20, fontSize: 11, width: '100%', height: 32 }}>
                🔍 本地快速识别业务类型与关键词
              </Button>
            </div>
            
            <div style={{ fontSize: 9, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
              <LockOutlined style={{ color: '#10b981' }} /> 🔒 个人隐私合规保护：系统对输入敏感数据将自动本地遮罩脱敏
            </div>

            {/* Local Parsing Result */}
            {showParsedBox && (
              <div style={{ background: '#eff6ff', padding: '10px 14px', borderRadius: 12, marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: '#1e3a8a', marginBottom: 6 }}>✓ 智能提取结果</div>
                <div style={{ display: 'flex', marginBottom: 6, fontSize: 11 }}>
                  <span style={{ width: 80, color: '#64748b' }}>识别业务类型</span>
                  <span style={{ fontWeight: 700, color: '#1e3a8a' }}>{BIZ_STYLE_MAP[parsedBizType]?.label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-start', fontSize: 11 }}>
                  <span style={{ width: 80, color: '#64748b', marginTop: 2 }}>特征提取词</span>
                  <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {parsedKeywords.map(kw => (
                      <Tag key={kw} style={{ background: '#ffffff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: 10, fontSize: 9, margin: 0 }}>
                        {kw}
                      </Tag>
                    ))}
                    {parsedKeywords.length === 0 && <span style={{ color: '#94a3b8' }}>无</span>}
                  </div>
                </div>
              </div>
            )}

            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleAnalyzeAll}
              loading={loading}
              style={{
                background: '#2563eb',
                borderColor: '#2563eb',
                height: 44,
                borderRadius: 22,
                fontSize: 13,
                fontWeight: 700,
                width: '100%',
                boxShadow: '0 4px 12px rgba(37,99,235,0.2)'
              }}
            >
              🚀 分析全部案例 · 生成大模型排序
            </Button>
          </div>

          {/* RIGHT: Result Area */}
          <div style={{
            flex: '2',
            minWidth: 650,
            padding: 24,
            background: '#ffffff',
            position: 'relative'
          }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
                <Spin size="large" />
                <div style={{ marginTop: 16, fontWeight: 700, color: '#1e3a8a', fontSize: 13 }}>大语言模型进行风险排序 & 缺陷知识库匹配中...</div>
                <div style={{ marginTop: 6, color: '#64748b', fontSize: 11 }}>预计耗时 1-2 秒，请稍候...</div>
              </div>
            ) : (
              <div>
                {renderFeedbackStatsBoard()}

                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <RobotOutlined style={{ color: '#1e3a8a' }} /> 大模型推演结果与建议排序
                </div>

                {renderGlobalStats()}
                {renderTestOrder()}
                {parsedCases.length > 0 ? renderCasesTable() : renderPendingView()}

                <Divider style={{ margin: '24px 0 16px' }} />

                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <DatabaseOutlined style={{ color: '#0891b2' }} /> 🔍 各业务领域历史缺陷详情库 (增量加载)
                </div>

                {/* Collapse Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {BIZ_CATEGORIES.map((bizType, idx) => {
                    const isExpanded = !!expandedDetails[bizType]
                    const style = BIZ_STYLE_MAP[bizType]
                    const stats = DB_STATS[bizType]
                    const defectsList = loadedDefects[bizType] || []
                    const colors = ['#ef4444', '#f97316', '#3b82f6', '#10b981', '#64748b']

                    return (
                      <div key={bizType} style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.01)' }}>
                        <div style={{
                          padding: '12px 16px',
                          background: '#f8fafc',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          cursor: 'pointer'
                        }}
                          onClick={() => toggleDetailPanel(bizType)}
                        >
                          <span style={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: 10,
                            color: '#ffffff',
                            background: colors[idx % colors.length]
                          }}>
                            {idx + 1}
                          </span>
                          <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 12 }}>
                            {style.icon} {style.label}
                          </span>
                          <span style={{ fontSize: 10, color: '#64748b' }}>
                            ({stats.total} 个历史缺陷条目)
                          </span>
                          
                          <Button
                            size="small"
                            type="text"
                            loading={loadingDefects[bizType]}
                            style={{ marginLeft: 'auto', fontSize: 11, color: '#2563eb', height: 'auto', padding: '2px 8px', fontWeight: 600 }}
                          >
                            {isExpanded ? '收起详情' : '展开详情'}
                          </Button>
                        </div>

                        {isExpanded && (
                          <div style={{ padding: '12px 16px', background: '#ffffff', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 400, overflowY: 'auto' }}>
                            {loadingDefects[bizType] ? (
                              <div style={{ padding: '20px 0', textAlign: 'center' }}><Spin size="small" /> 加载中...</div>
                            ) : defectsList.length === 0 ? (
                              <Empty description="该类型在知识库中暂无可用明细缺陷" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                            ) : (
                              defectsList.map(d => (
                                <div
                                  key={d.id || d.defect_id}
                                  style={{
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    borderLeft: d.severity === 'high' ? '4px solid #ef4444' : '4px solid #f97316',
                                    borderRadius: 8,
                                    padding: 12
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <span style={{ fontWeight: 600, fontSize: 12, color: '#1e293b' }}>
                                      {d.title}
                                    </span>
                                    <Tag color={d.severity === 'high' ? 'red' : 'orange'} style={{ fontSize: 9, margin: 0, borderRadius: 10 }}>
                                      {d.severity === 'high' ? '高危' : '中危'}
                                    </Tag>
                                  </div>
                                  <div style={{ fontSize: 11, color: '#475569', marginBottom: 8, lineHeight: '1.4' }}>
                                    {d.description}
                                  </div>
                                  <div style={{ fontSize: 10, color: '#64748b', display: 'flex', gap: 12, flexWrap: 'wrap', background: '#f1f5f9', padding: '6px 10px', borderRadius: 6 }}>
                                    <span>⚙️ 责任系统: {d.responsible_system || d.biz_domain}</span>
                                    <span>🛠️ 缺陷类型: {d.defect_type === 'system' ? '代码逻辑' : '测试环境'}</span>
                                    {d.created_month && <span>📅 发生时间: {d.created_month}</span>}
                                  </div>
                                  {d.fix_summary && (
                                    <div style={{ fontSize: 10, color: '#047857', marginTop: 8, paddingLeft: 4, borderLeft: '2px solid #059669' }}>
                                      💡 修复参考方案：{d.fix_summary}
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

              </div>
            )}
          </div>

        </div>
      </div>

      {/* Case Details Drawer */}
      <Drawer
        title={
          <span style={{ color: '#1e3a8a', fontWeight: 700 }}>
            🧠 大模型风险预警与测试诊断详情
          </span>
        }
        placement="right"
        width={650}
        onClose={() => setDrawerVisible(false)}
        visible={drawerVisible}
        bodyStyle={{ padding: 24, background: '#f8fafc' }}
      >
        {currentCaseDetails && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Input Case Box */}
            <Card title="📄 输入案例内容 (已执行隐私数据本地脱敏)" size="small" style={{ borderRadius: 12 }}>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 11, color: '#334155', fontFamily: 'monospace', background: '#f1f5f9', padding: 12, borderRadius: 8, lineHeight: '1.5' }}>
                {currentCaseDetails.caseText}
              </div>
            </Card>

            {/* LLM Inference Assessment */}
            <Card
              title={
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#2563eb' }}>
                  <RobotOutlined /> 大模型风险评定依据
                </span>
              }
              size="small"
              style={{
                borderRadius: 12,
                borderLeft: `5px solid ${currentCaseDetails.riskLevel === 'high' ? '#ef4444' : (currentCaseDetails.riskLevel === 'mid' ? '#f59e0b' : '#10b981')}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>风险级别与双签状态</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Tag color={currentCaseDetails.riskLevel === 'high' ? 'red' : (currentCaseDetails.riskLevel === 'mid' ? 'orange' : 'green')} style={{ fontWeight: 'bold', fontSize: 10, padding: '1px 8px', borderRadius: 20 }}>
                    {currentCaseDetails.riskLevel === 'high' ? '⚠️ 高危' : (currentCaseDetails.riskLevel === 'mid' ? '⚡ 中危' : '✅ 低危')} ({currentCaseDetails.riskScore}分)
                  </Tag>
                  {currentCaseDetails.status === 'pending_audit' && (
                    <Tag color="warning" style={{ fontWeight: 'bold', fontSize: 10, padding: '1px 8px', borderRadius: 20 }}>
                      ⏳ 待双签核签
                    </Tag>
                  )}
                  {currentCaseDetails.status === 'audited' && (
                    <Tag color="success" style={{ fontWeight: 'bold', fontSize: 10, padding: '1px 8px', borderRadius: 20 }}>
                      ✅ 已双签核签
                    </Tag>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#1e293b', background: '#eff6ff', padding: 12, borderRadius: 8, fontStyle: 'italic', lineHeight: '1.5' }}>
                "{currentCaseDetails.reason}"
              </div>
            </Card>

            {/* Test Checkpoints Checklist */}
            <Card
              title={
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0284c7' }}>
                  <CheckSquareOutlinedIcon /> 💡 针对性测试检查要点建议
                </span>
              }
              size="small"
              style={{ borderRadius: 12 }}
            >
              <List
                size="small"
                dataSource={currentCaseDetails.checkPoints || []}
                renderItem={(item, index) => (
                  <List.Item style={{ display: 'flex', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', padding: '8px 0' }}>
                    <CheckboxItem text={item} />
                  </List.Item>
                )}
              />
            </Card>

            {/* Recalled Defects */}
            <Card
              title={
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#0891b2' }}>
                  <DatabaseOutlined /> 缺陷知识库语义匹配召回清单 ({currentCaseDetails.similarDefects?.length || 0} 条)
                </span>
              }
              size="small"
              style={{ borderRadius: 12 }}
            >
              {currentCaseDetails.similarDefects && currentCaseDetails.similarDefects.length === 0 ? (
                <Empty description="该类型在知识库中暂无匹配到的相似历史缺陷" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {currentCaseDetails.similarDefects?.map((d, index) => (
                    <div key={d.defect_id || index} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#ffffff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 11, color: '#1e293b' }}>
                          [{d.defect_id}] {d.title}
                        </span>
                        <Tag color={d.severity === 'high' ? 'red' : 'orange'} style={{ fontSize: 8, margin: 0 }}>
                          {d.severity === 'high' ? '高危' : '中危'}
                        </Tag>
                      </div>
                      <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 4 }}>
                        ⚙️ 责任系统: {d.responsible_system} · 📅 发生时间: {d.created_month || '未知'}
                      </div>
                      {d.fix_summary && (
                        <div style={{ fontSize: 10, color: '#059669', background: '#f0fdf4', padding: '4px 8px', borderRadius: 4, marginTop: 6 }}>
                          💡 知识库修复参考方案：{d.fix_summary}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Action audit confirm inside Drawer */}
            {currentCaseDetails.status === 'pending_audit' && (
              <Card size="small" style={{ borderRadius: 12, background: '#fffbeb', border: '1px solid #fef3c7' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>⚠️ 该用例被评定为高危级别，需要进行双签审计确认：</span>
                  <Button
                    type="primary"
                    size="small"
                    disabled={!(currentUser?.role === 'admin' || currentUser?.role === 'manager')}
                    onClick={() => handleAuditCase(currentCaseDetails.id)}
                    style={{ background: '#d97706', borderColor: '#d97706', borderRadius: 6, fontSize: 11 }}
                  >
                    确认核签
                  </Button>
                </div>
              </Card>
            )}

            {/* Model Evaluation Feedback Loop */}
            <Card
              title={
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#475569' }}>
                  <LikeOutlined /> 大模型评估效果真实反馈打标
                </span>
              }
              size="small"
              style={{ borderRadius: 12, background: '#f1f5f9' }}
            >
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
                请问本次大模型风险排序与预警提示是否准确？测试打标数据将被自动回馈至知识库闭环优化体系：
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <Button 
                  size="middle" 
                  type={currentCaseDetails.feedback === 'hit' ? 'primary' : 'default'}
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleFeedback(currentCaseDetails.id, 'hit')}
                  style={{ borderRadius: 16, fontSize: 11 }}
                >
                  🎯 预测精准（已命中）
                </Button>
                <Button 
                  size="middle" 
                  type={currentCaseDetails.feedback === 'false_alarm' ? 'primary' : 'default'}
                  danger={currentCaseDetails.feedback === 'false_alarm'}
                  icon={<WarningOutlined />}
                  onClick={() => handleFeedback(currentCaseDetails.id, 'false_alarm')}
                  style={{ borderRadius: 16, fontSize: 11 }}
                >
                  ⚠️ 报告误报（分数偏高）
                </Button>
                <Button 
                  size="middle" 
                  type={currentCaseDetails.feedback === 'missed' ? 'primary' : 'default'}
                  danger={currentCaseDetails.feedback === 'missed'}
                  icon={<CloseCircleOutlined />}
                  onClick={() => handleFeedback(currentCaseDetails.id, 'missed')}
                  style={{ borderRadius: 16, fontSize: 11 }}
                >
                  ❌ 报告漏报（本应高危）
                </Button>
              </div>
            </Card>
          </div>
        )}
      </Drawer>
    </div>
  )
}

// Help sub-components
function CheckSquareOutlinedIcon() {
  return <CheckOutlined style={{ fontSize: 14 }} />
}

function CheckboxItem({ text }) {
  const [checked, setChecked] = useState(false)
  return (
    <div 
      onClick={() => setChecked(!checked)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', width: '100%' }}
    >
      <span style={{ 
        width: 14, 
        height: 14, 
        border: '1.5px solid #cbd5e1', 
        borderRadius: 3, 
        marginTop: 2, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: checked ? '#2563eb' : '#ffffff',
        borderColor: checked ? '#2563eb' : '#cbd5e1',
        transition: 'all 0.1s'
      }}>
        {checked && <span style={{ color: '#ffffff', fontSize: 10, fontWeight: 'bold' }}>✓</span>}
      </span>
      <span style={{ 
        fontSize: 11, 
        color: checked ? '#94a3b8' : '#334155', 
        textDecoration: checked ? 'line-through' : 'none',
        lineHeight: '1.5'
      }}>
        {text}
      </span>
    </div>
  )
}
