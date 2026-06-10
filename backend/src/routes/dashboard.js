const express = require('express');
const { getDb } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/dashboard/overview
router.get('/overview', (req, res) => {
  const db = getDb();
  const { version_id } = req.query;
  const vf = version_id ? 'AND d.version_id = ?' : '';
  const vp = version_id ? [version_id] : [];

  const total = db.prepare(`SELECT COUNT(*) as count FROM defects d WHERE 1=1 ${vf}`).get(...vp).count;
  const open = db.prepare(`SELECT COUNT(*) as count FROM defects d WHERE d.status NOT IN ('closed','rejected') ${vf}`).get(...vp).count;
  const fatal = db.prepare(`SELECT COUNT(*) as count FROM defects d WHERE d.severity='fatal' AND d.status NOT IN ('closed','rejected') ${vf}`).get(...vp).count;
  const critical = db.prepare(`SELECT COUNT(*) as count FROM defects d WHERE d.severity='critical' AND d.status NOT IN ('closed','rejected') ${vf}`).get(...vp).count;
  const weekNew = db.prepare(`SELECT COUNT(*) as count FROM defects d WHERE d.created_at >= datetime('now','-7 days') ${vf}`).get(...vp).count;
  const activeAlerts = db.prepare(`SELECT COUNT(*) as count FROM alerts WHERE is_resolved=0`).get().count;
  const closeRate = total > 0 ? (((total - open) / total) * 100).toFixed(1) : 0;

  res.json({
    success: true, data: {
      total, open, fatal, critical, weekNew, activeAlerts, closeRate: parseFloat(closeRate)
    }
  });
});

// GET /api/dashboard/severity-distribution
router.get('/severity-distribution', (req, res) => {
  const db = getDb();
  const { version_id } = req.query;
  const vf = version_id ? 'AND version_id = ?' : '';
  const vp = version_id ? [version_id] : [];
  const data = db.prepare(`SELECT severity, COUNT(*) as count FROM defects WHERE 1=1 ${vf} GROUP BY severity`).all(...vp);
  res.json({ success: true, data });
});

// GET /api/dashboard/status-distribution
router.get('/status-distribution', (req, res) => {
  const db = getDb();
  const { version_id } = req.query;
  const vf = version_id ? 'AND version_id = ?' : '';
  const vp = version_id ? [version_id] : [];
  const data = db.prepare(`SELECT status, COUNT(*) as count FROM defects WHERE 1=1 ${vf} GROUP BY status`).all(...vp);
  res.json({ success: true, data });
});

// GET /api/dashboard/trend (last 30 days)
router.get('/trend', (req, res) => {
  const db = getDb();
  const { version_id, days = 30 } = req.query;
  const vf = version_id ? 'AND version_id = ?' : '';
  const vp = version_id ? [version_id] : [];

  const newTrend = db.prepare(`
    SELECT date(created_at) as date, COUNT(*) as count FROM defects
    WHERE created_at >= datetime('now', '-${parseInt(days)} days') ${vf}
    GROUP BY date(created_at) ORDER BY date
  `).all(...vp);

  const closedTrend = db.prepare(`
    SELECT date(closed_at) as date, COUNT(*) as count FROM defects
    WHERE closed_at IS NOT NULL AND closed_at >= datetime('now', '-${parseInt(days)} days') ${vf}
    GROUP BY date(closed_at) ORDER BY date
  `).all(...vp);

  res.json({ success: true, data: { newTrend, closedTrend } });
});

// GET /api/dashboard/module-distribution
router.get('/module-distribution', (req, res) => {
  const db = getDb();
  const { version_id } = req.query;
  const vf = version_id ? 'AND version_id = ?' : '';
  const vp = version_id ? [version_id] : [];
  const data = db.prepare(`
    SELECT module, COUNT(*) as total,
      SUM(CASE WHEN severity='fatal' THEN 1 ELSE 0 END) as fatal,
      SUM(CASE WHEN severity='critical' THEN 1 ELSE 0 END) as critical
    FROM defects WHERE module != '' ${vf}
    GROUP BY module ORDER BY total DESC LIMIT 10
  `).all(...vp);
  res.json({ success: true, data });
});

// GET /api/dashboard/root-cause
router.get('/root-cause', (req, res) => {
  const db = getDb();
  const { version_id } = req.query;
  const vf = version_id ? 'AND version_id = ?' : '';
  const vp = version_id ? [version_id] : [];
  const data = db.prepare(`
    SELECT root_cause_category as category, COUNT(*) as count FROM defects
    WHERE root_cause_category IS NOT NULL AND root_cause_category != '' ${vf}
    GROUP BY root_cause_category ORDER BY count DESC
  `).all(...vp);
  res.json({ success: true, data });
});

// GET /api/dashboard/product-health
router.get('/product-health', (req, res) => {
  const db = getDb();
  const products = db.prepare(`
    SELECT p.id, p.name, p.type,
      (SELECT COUNT(*) FROM defects d JOIN test_versions tv ON d.version_id = tv.id WHERE tv.product_id = p.id) as total,
      (SELECT COUNT(*) FROM defects d JOIN test_versions tv ON d.version_id = tv.id WHERE tv.product_id = p.id AND d.severity='fatal' AND d.status NOT IN ('closed','rejected')) as fatal_open,
      (SELECT COUNT(*) FROM defects d JOIN test_versions tv ON d.version_id = tv.id WHERE tv.product_id = p.id AND d.status IN ('closed','rejected')) as closed
    FROM products p WHERE p.status='active'
  `).all();

  const health = products.map(p => ({
    ...p,
    health_score: p.total === 0 ? 100 : Math.max(0, Math.round(100 - (p.fatal_open * 20) - ((p.total - p.closed) / Math.max(p.total, 1) * 30)))
  }));
  res.json({ success: true, data: health });
});

module.exports = router;
