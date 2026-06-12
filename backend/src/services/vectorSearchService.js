const { getDb } = require('../database/init')

// ── 1. 中文 N-Gram 切词提取器 ──────────────────────────────
function tokenize(text) {
  if (!text) return []
  // 过滤特殊字符，保留中英文和数字
  const cleaned = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ').toLowerCase()
  const words = cleaned.split(/\s+/).filter(w => w.length > 0)
  const tokens = []

  for (const w of words) {
    if (/[\u4e00-\u9fa5]/.test(w)) {
      // 提取单字
      for (let i = 0; i < w.length; i++) {
        tokens.push(w[i])
      }
      // 提取 2-Gram
      for (let i = 0; i < w.length - 1; i++) {
        tokens.push(w.substring(i, i + 2))
      }
      // 提取 3-Gram
      for (let i = 0; i < w.length - 2; i++) {
        tokens.push(w.substring(i, i + 3))
      }
    } else {
      // 英文和数字本身作为一个 token
      tokens.push(w)
    }
  }
  return tokens
}

// ── 2. 本地 VSM TF-IDF 引擎 ────────────────────────────────
let vsmIndex = null // 内存缓存

function rebuildVSMIndex() {
  const db = getDb()
  const defects = db.prepare('SELECT * FROM defect_db').all()
  
  if (defects.length === 0) {
    vsmIndex = { docs: [], idf: new Map() }
    return
  }

  const docCount = defects.length
  const docTerms = []
  const docFreqs = new Map() // term -> docs count containing term

  // 统计词频 (TF) 和 文档频率统计 (DF)
  for (const d of defects) {
    // 拼接关键文本构建文档表征
    const docText = `${d.biz_type} ${d.title} ${d.description || ''} ${d.func_module || ''} ${d.scenario || ''} ${d.fix_summary || ''}`
    const tokens = tokenize(docText)
    const tfMap = new Map()
    
    for (const t of tokens) {
      tfMap.set(t, (tfMap.get(t) || 0) + 1)
    }

    docTerms.push({
      defect: d,
      tf: tfMap,
      length: tokens.length
    })

    // 统计 DF (包含该 term 的文档数)
    for (const term of tfMap.keys()) {
      docFreqs.set(term, (docFreqs.get(term) || 0) + 1)
    }
  }

  // 计算 IDF: log(1 + N / DF)
  const idfMap = new Map()
  for (const [term, df] of docFreqs.entries()) {
    idfMap.set(term, Math.log(1 + docCount / df))
  }

  // 计算每个文档的 TF-IDF 权重向量
  const docsVectors = docTerms.map(dt => {
    const vector = new Map()
    for (const [term, tfVal] of dt.tf.entries()) {
      const tf = tfVal / dt.length // 归一化词频
      const idf = idfMap.get(term) || 0
      vector.set(term, tf * idf)
    }
    return {
      defect: dt.defect,
      vector
    }
  })

  vsmIndex = {
    docs: docsVectors,
    idf: idfMap
  }
}

// 获取 VSM 索引
function getVSMIndex() {
  if (!vsmIndex) {
    rebuildVSMIndex()
  }
  return vsmIndex
}

// 计算两个 VSM 向量的余弦相似度
function cosineSimilarityVSM(vecA, vecB) {
  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (const [term, valA] of vecA.entries()) {
    normA += valA * valA
    if (vecB.has(term)) {
      dotProduct += valA * vecB.get(term)
    }
  }

  for (const valB of vecB.values()) {
    normB += valB * valB
  }

  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

// 执行本地 VSM 检索
function searchVSM(queryText, bizType = null, limit = 5) {
  const index = getVSMIndex()
  if (index.docs.length === 0) return []

  const queryTokens = tokenize(queryText)
  const queryTF = new Map()
  for (const t of queryTokens) {
    queryTF.set(t, (queryTF.get(t) || 0) + 1)
  }

  // 构造查询向量
  const queryVector = new Map()
  for (const [term, tfVal] of queryTF.entries()) {
    const tf = tfVal / queryTokens.length
    const idf = index.idf.get(term) || 0
    queryVector.set(term, tf * idf)
  }

  // 对所有文档计算相似度
  const results = []
  for (const doc of index.docs) {
    // 若指定了主业务类型，优先过滤，其他类型相似度打折或过滤（这里采取过滤策略以提高精确度）
    if (bizType && doc.defect.biz_type !== bizType) {
      continue
    }

    const similarity = cosineSimilarityVSM(queryVector, doc.vector)
    results.push({
      defect: doc.defect,
      score: similarity
    })
  }

  // 降序排列
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(r => r.defect)
}

// ── 3. Ollama 稠密嵌入向量客户端 ──────────────────────────────
async function fetchOllamaEmbedding(text) {
  const llmUrl = process.env.LLM_API_URL || "http://127.0.0.1:11434/v1/chat/completions"
  
  // 自动推断 Ollama embedding 终结点
  let embedUrl
  if (llmUrl.includes('/v1/chat/completions')) {
    embedUrl = llmUrl.replace('/v1/chat/completions', '/api/embeddings')
  } else if (llmUrl.includes('/v1')) {
    embedUrl = llmUrl.replace('/v1', '/api/embeddings')
  } else {
    embedUrl = llmUrl + '/api/embeddings'
  }

  const modelName = process.env.LLM_EMBED_MODEL || "nomic-embed-text"

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 600) // 600ms 短超时，防止卡死

  try {
    const response = await fetch(embedUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        prompt: text
      }),
      signal: controller.signal
    })
    
    clearTimeout(timeoutId)
    
    if (response.ok) {
      const res = await response.json()
      if (res.embedding && Array.isArray(res.embedding)) {
        return res.embedding
      }
    }
  } catch (err) {
    clearTimeout(timeoutId)
  }
  return null
}

// 计算稠密向量的余弦相似度
function cosineSimilarityDense(vecA, vecB) {
  if (vecA.length !== vecB.length) return 0
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ── 4. 混合向量检索服务主接口 ──────────────────────────────
async function searchSimilarDefects(queryText, bizType = null, limit = 5) {
  // 1. 尝试获取查询用例的 Ollama Dense Embedding 稠密向量
  const queryEmbedding = await fetchOllamaEmbedding(queryText)

  if (queryEmbedding) {
    try {
      const db = getDb()
      
      // 2. 拉取所有同业务类型（或全部）的历史缺陷
      let defects
      if (bizType) {
        defects = db.prepare('SELECT * FROM defect_db WHERE biz_type = ?').all(bizType)
      } else {
        defects = db.prepare('SELECT * FROM defect_db').all()
      }

      const scoredDefects = []
      
      for (const d of defects) {
        // 从 defect_embeddings 表读取缓存
        let cache = db.prepare('SELECT vector_json FROM defect_embeddings WHERE defect_id = ?').get(d.defect_id)
        let vector = null
        
        if (cache) {
          vector = JSON.parse(cache.vector_json)
        } else {
          // 缓存未命中，调用 Ollama 为该条历史缺陷生成 Embedding
          const docText = `${d.title} ${d.description || ''} ${d.scenario || ''}`
          vector = await fetchOllamaEmbedding(docText)
          if (vector) {
            db.prepare('INSERT OR REPLACE INTO defect_embeddings (defect_id, vector_json) VALUES (?, ?)')
              .run(d.defect_id, JSON.stringify(vector))
          }
        }

        if (vector) {
          const similarity = cosineSimilarityDense(queryEmbedding, vector)
          scoredDefects.push({ defect: d, score: similarity })
        }
      }

      if (scoredDefects.length > 0) {
        db._flush() // 刷新写入缓存
        console.log(`[Embedding Search] 🚀 成功使用 Ollama 神经网络嵌入向量进行余弦相似度检索 (召回 ${scoredDefects.length} 条)`)
        return scoredDefects
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map(r => r.defect)
      }
    } catch (err) {
      console.warn('[Embedding Search] 大模型向量数据库匹配异常，准备降级到本地 VSM:', err.message)
    }
  }

  // 3. 兜底策略：使用高保真本地 VSM TF-IDF 分词向量引擎
  console.log('[VSM Search] ⚡ 降级采用本地自适应分词向量空间模型进行 Cosine 检索')
  return searchVSM(queryText, bizType, limit)
}

module.exports = {
  tokenize,
  rebuildVSMIndex,
  searchSimilarDefects
}
