const express = require('express');
const { getDb } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/reports/summary/:version_id
router.get('/summary/:version_id', (req, res) => {
  const db = getDb();
  const versionId = req.params.version_id;

  const version = db.prepare(`
    SELECT tv.*, p.name as product_name, p.type as product_type, u.name as manager_name
    FROM test_versions tv JOIN products p ON tv.product_id = p.id LEFT JOIN users u ON tv.manager_id = u.id
    WHERE tv.id = ?
  `).get(versionId);
  if (!version) return res.status(404).json({ success: false, message: '版本不存在' });

  const summary = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN severity='fatal' THEN 1 ELSE 0 END) as fatal,
      SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) as critical,
      SUM(CASE WHEN severity='major' THEN 1 ELSE 0 END) as major,
      SUM(CASE WHEN severity='minor' THEN 1 ELSE 0 END) as minor,
      SUM(CASE WHEN status='closed' THEN 1 ELSE 0 END) as closed,
      SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN status NOT IN ('closed','rejected') THEN 1 ELSE 0 END) as open
    FROM defects WHERE version_id = ?
  `).get(versionId);

  const byModule = db.prepare(`
    SELECT module, COUNT(*) as count,
      SUM(CASE WHEN severity='fatal' THEN 1 ELSE 0 END) as fatal,
      SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) as critical
    FROM defects WHERE version_id = ? AND module != ''
    GROUP BY module ORDER BY count DESC
  `).all(versionId);

  const byRootCause = db.prepare(`
    SELECT root_cause_category as category, COUNT(*) as count
    FROM defects WHERE version_id = ? AND root_cause_category != ''
    GROUP BY root_cause_category ORDER BY count DESC
  `).all(versionId);

  const fatalDefects = db.prepare(`
    SELECT d.id, d.title, d.severity, d.status, d.module, d.created_at, u.name as assignee_name
    FROM defects d LEFT JOIN users u ON d.assignee_id = u.id
    WHERE d.version_id = ? AND d.severity = 'fatal'
    ORDER BY d.created_at DESC
  `).all(versionId);

  const closeRate = summary.total > 0 ? ((summary.closed / summary.total) * 100).toFixed(1) : 0;

  res.json({
    success: true,
    data: {
      version, summary, byModule, byRootCause, fatalDefects,
      closeRate: parseFloat(closeRate),
      generatedAt: new Date().toISOString()
    }
  });
});

module.exports = router;
