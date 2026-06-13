const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');
const { createNotification } = require('../services/notifications');

const router = express.Router();
router.use(authMiddleware);

const STATUS_TRANSITIONS = {
  new: ['assigned', 'rejected'],
  assigned: ['in_progress', 'rejected'],
  in_progress: ['fixed', 'rejected'],
  fixed: ['pending_verify'],
  pending_verify: ['closed', 'reopened'],
  closed: ['reopened'],
  reopened: ['assigned', 'in_progress'],
  rejected: ['reopened']
};

// GET /api/defects
router.get('/', (req, res) => {
  const db = getDb();
  const { version_id, severity, status, assignee_id, module, page = 1, limit = 20, search } = req.query;

  let sql = `
    SELECT d.*, 
      tv.version as version_name, p.name as product_name,
      r.name as reporter_name, a.name as assignee_name
    FROM defects d
    JOIN test_versions tv ON d.version_id = tv.id
    JOIN products p ON tv.product_id = p.id
    LEFT JOIN users r ON d.reporter_id = r.id
    LEFT JOIN users a ON d.assignee_id = a.id
    WHERE 1=1
  `;
  const params = [];

  if (version_id) { sql += ' AND d.version_id = ?'; params.push(version_id); }
  if (severity) { sql += ' AND d.severity = ?'; params.push(severity); }
  if (status) { sql += ' AND d.status = ?'; params.push(status); }
  if (assignee_id) { sql += ' AND d.assignee_id = ?'; params.push(assignee_id); }
  if (module) { sql += ' AND d.module = ?'; params.push(module); }
  if (search) { sql += ' AND (d.title LIKE ? OR d.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  const total = db.prepare(`SELECT COUNT(*) as count FROM (${sql})`).get(...params).count;
  sql += ` ORDER BY CASE d.severity WHEN 'fatal' THEN 1 WHEN 'critical' THEN 2 WHEN 'major' THEN 3 ELSE 4 END, d.created_at DESC`;
  sql += ' LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

  const defects = db.prepare(sql).all(...params);
  res.json({ success: true, data: defects, total, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/defects/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const defect = db.prepare(`
    SELECT d.*, tv.version as version_name, p.name as product_name, p.id as product_id,
      r.name as reporter_name, a.name as assignee_name, a.email as assignee_email
    FROM defects d
    JOIN test_versions tv ON d.version_id = tv.id
    JOIN products p ON tv.product_id = p.id
    LEFT JOIN users r ON d.reporter_id = r.id
    LEFT JOIN users a ON d.assignee_id = a.id
    WHERE d.id = ? OR d.uuid = ?
  `).get(req.params.id, req.params.id);
  if (!defect) return res.status(404).json({ success: false, message: '缺陷不存在' });

  const comments = db.prepare(`
    SELECT c.*, u.name as user_name, u.role as user_role
    FROM defect_comments c JOIN users u ON c.user_id = u.id
    WHERE c.defect_id = ? ORDER BY c.created_at ASC
  `).all(defect.id);

  res.json({ success: true, data: { ...defect, comments } });
});

// POST /api/defects
router.post('/', (req, res) => {
  const { version_id, title, description, severity, priority, module, environment, steps_to_reproduce, expected_result, actual_result, assignee_id, tags } = req.body;
  if (!version_id || !title || !severity) return res.status(400).json({ success: false, message: '版本、标题和严重等级不能为空' });
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO defects (uuid, version_id, title, description, severity, priority, module, environment, steps_to_reproduce, expected_result, actual_result, assignee_id, reporter_id, status, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)
  `).run(uuidv4(), version_id, title, description || '', severity, priority || 'medium', module || '', environment || '', steps_to_reproduce || '', expected_result || '', actual_result || '', assignee_id || null, req.user.id, JSON.stringify(tags || []));

  const defect = db.prepare('SELECT * FROM defects WHERE id = ?').get(result.lastInsertRowid);

  // Notify assignee
  if (assignee_id) {
    createNotification(db, assignee_id, 'defect_assigned', `新缺陷已指派给你`, `【${severity}】${title}`, `/defects/${defect.id}`, 'info');
  }

  res.status(201).json({ success: true, message: '缺陷创建成功', data: defect });
});

// PUT /api/defects/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const defect = db.prepare('SELECT * FROM defects WHERE id=? OR uuid=?').get(req.params.id, req.params.id);
  if (!defect) return res.status(404).json({ success: false, message: '缺陷不存在' });

  const { title, description, severity, priority, module, environment, steps_to_reproduce, expected_result, actual_result, root_cause, root_cause_category, risk_level, tags } = req.body;
  db.prepare(`
    UPDATE defects SET title=?, description=?, severity=?, priority=?, module=?, environment=?, steps_to_reproduce=?, expected_result=?, actual_result=?, root_cause=?, root_cause_category=?, risk_level=?, tags=?, updated_at=datetime('now','localtime')
    WHERE id=?
  `).run(title, description, severity, priority, module, environment, steps_to_reproduce, expected_result, actual_result, root_cause, root_cause_category, risk_level, JSON.stringify(tags || []), defect.id);

  res.json({ success: true, message: '缺陷更新成功', data: db.prepare('SELECT * FROM defects WHERE id=?').get(defect.id) });
});

// POST /api/defects/:id/status  — Status transition
router.post('/:id/status', (req, res) => {
  const db = getDb();
  const defect = db.prepare('SELECT * FROM defects WHERE id=? OR uuid=?').get(req.params.id, req.params.id);
  if (!defect) return res.status(404).json({ success: false, message: '缺陷不存在' });

  const { status, comment } = req.body;
  const allowed = STATUS_TRANSITIONS[defect.status] || [];
  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: `不允许从 ${defect.status} 转换到 ${status}` });
  }

  const closedAt = status === 'closed' ? "datetime('now','localtime')" : null;
  db.prepare(`UPDATE defects SET status=?, closed_at=${closedAt ? closedAt : 'closed_at'}, updated_at=datetime('now','localtime') WHERE id=?`).run(status, defect.id);

  // Add status change comment
  db.prepare(`INSERT INTO defect_comments (defect_id, user_id, content, type) VALUES (?, ?, ?, 'status_change')`).run(
    defect.id, req.user.id, comment || `状态变更：${defect.status} → ${status}`
  );

  res.json({ success: true, message: '状态更新成功' });
});

// POST /api/defects/:id/assign
router.post('/:id/assign', (req, res) => {
  const db = getDb();
  const { assignee_id } = req.body;
  const defect = db.prepare('SELECT * FROM defects WHERE id=? OR uuid=?').get(req.params.id, req.params.id);
  if (!defect) return res.status(404).json({ success: false, message: '缺陷不存在' });

  db.prepare(`UPDATE defects SET assignee_id=?, status='assigned', updated_at=datetime('now','localtime') WHERE id=?`).run(assignee_id, defect.id);
  db.prepare(`INSERT INTO defect_comments (defect_id, user_id, content, type) VALUES (?, ?, ?, 'assignment')`).run(defect.id, req.user.id, `缺陷已指派给新处理人`);

  if (assignee_id) {
    createNotification(db, assignee_id, 'defect_assigned', '缺陷已指派给你', defect.title, `/defects/${defect.id}`, 'info');
  }

  res.json({ success: true, message: '指派成功' });
});

// POST /api/defects/:id/comments
router.post('/:id/comments', (req, res) => {
  const db = getDb();
  const { content } = req.body;
  if (!content) return res.status(400).json({ success: false, message: '评论内容不能为空' });
  const defect = db.prepare('SELECT * FROM defects WHERE id=? OR uuid=?').get(req.params.id, req.params.id);
  if (!defect) return res.status(404).json({ success: false, message: '缺陷不存在' });

  const result = db.prepare(`INSERT INTO defect_comments (defect_id, user_id, content) VALUES (?, ?, ?)`).run(defect.id, req.user.id, content);
  const comment = db.prepare('SELECT c.*, u.name as user_name FROM defect_comments c JOIN users u ON c.user_id = u.id WHERE c.id=?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, data: comment });
});

// POST /api/defects/check-duplicate
router.post('/check-duplicate', (req, res) => {
  const { title, description, version_id } = req.body;
  if (!title) return res.status(400).json({ success: false, message: '标题不能为空' });

  const db = getDb();
  try {
    const duplicates = findDuplicateDefects(db, title, description, version_id);
    res.json({ success: true, data: duplicates });
  } catch (err) {
    console.error('[Defect Duplicate Check] 失败:', err);
    res.status(500).json({ success: false, message: '查重失败', error: err.message });
  }
});

const { tokenize } = require('../services/vectorSearchService');

function findDuplicateDefects(db, title, description, versionId, limit = 5) {
  const queryText = `${title} ${description || ''}`;
  const queryTokens = tokenize(queryText);
  if (queryTokens.length === 0) return [];

  // 获取系统中所有已记录缺陷
  const defects = db.prepare(`
    SELECT d.id, d.title, d.severity, d.status, d.module, d.description, tv.version as version_name, p.name as product_name
    FROM defects d
    JOIN test_versions tv ON d.version_id = tv.id
    JOIN products p ON tv.product_id = p.id
  `).all();

  if (defects.length === 0) return [];

  const docCount = defects.length;
  const docTerms = [];
  const docFreqs = new Map();

  for (const d of defects) {
    const docText = `${d.title} ${d.description || ''} ${d.module || ''}`;
    const tokens = tokenize(docText);
    const tfMap = new Map();
    for (const t of tokens) {
      tfMap.set(t, (tfMap.get(t) || 0) + 1);
    }
    docTerms.push({ defect: d, tf: tfMap, length: tokens.length });
    for (const term of tfMap.keys()) {
      docFreqs.set(term, (docFreqs.get(term) || 0) + 1);
    }
  }

  // 计算 IDF
  const idfMap = new Map();
  for (const [term, df] of docFreqs.entries()) {
    idfMap.set(term, Math.log(1 + docCount / df));
  }

  // 构建查询向量
  const queryTF = new Map();
  for (const t of queryTokens) {
    queryTF.set(t, (queryTF.get(t) || 0) + 1);
  }
  const queryVector = new Map();
  for (const [term, tfVal] of queryTF.entries()) {
    const tf = tfVal / queryTokens.length;
    const idf = idfMap.get(term) || 0;
    queryVector.set(term, tf * idf);
  }

  // 对所有记录计算 Cosine 相似度
  const scored = [];
  for (const dt of docTerms) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    const docVector = new Map();
    for (const [term, tfVal] of dt.tf.entries()) {
      const tf = tfVal / dt.length;
      const idf = idfMap.get(term) || 0;
      docVector.set(term, tf * idf);
    }

    for (const [term, valA] of queryVector.entries()) {
      normA += valA * valA;
      if (docVector.has(term)) {
        dotProduct += valA * docVector.get(term);
      }
    }
    for (const valB of docVector.values()) {
      normB += valB * valB;
    }

    const similarity = (normA === 0 || normB === 0) ? 0 : dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    
    // 仅召回相似度在 30% 以上的缺陷记录，代表存在重叠嫌疑
    if (similarity >= 0.30) {
      scored.push({
        id: dt.defect.id,
        title: dt.defect.title,
        severity: dt.defect.severity,
        status: dt.defect.status,
        version_name: dt.defect.version_name,
        product_name: dt.defect.product_name,
        score: Math.round(similarity * 100)
      });
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

module.exports = router;
