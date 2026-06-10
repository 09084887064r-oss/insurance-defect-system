const { getDb } = require('../database/init');
const { v4: uuidv4 } = require('uuid');
const { broadcast } = require('./sse');
const { createNotification } = require('./notifications');

/**
 * Core alert engine - checks all active rules and triggers alerts
 */
function runAlertCheck() {
  const db = getDb();
  console.log('[AlertEngine] 开始预警检查...');

  const activeRules = db.prepare(`
    SELECT ar.*, tv.version as version_name, p.name as product_name
    FROM alert_rules ar
    LEFT JOIN test_versions tv ON ar.version_id = tv.id
    LEFT JOIN products p ON tv.product_id = p.id
    WHERE ar.is_active = 1
  `).all();

  let triggeredCount = 0;

  for (const rule of activeRules) {
    const triggered = checkRule(db, rule);
    if (triggered) triggeredCount++;
  }

  console.log(`[AlertEngine] 检查完成，触发预警 ${triggeredCount} 条`);
}

function checkRule(db, rule) {
  let shouldAlert = false;
  let message = '';
  let details = {};

  const versionFilter = rule.version_id ? 'AND d.version_id = ?' : '';
  const versionParam = rule.version_id ? [rule.version_id] : [];

  switch (rule.rule_type) {
    case 'fatal_count': {
      const result = db.prepare(`
        SELECT COUNT(*) as count FROM defects d
        WHERE d.severity = 'fatal' AND d.status NOT IN ('closed', 'rejected') ${versionFilter}
      `).get(...versionParam);
      if (result.count >= rule.threshold) {
        shouldAlert = true;
        message = `🔴 致命缺陷数量预警：当前致命缺陷 ${result.count} 条，已超过阈值 ${rule.threshold} 条`;
        details = { current: result.count, threshold: rule.threshold };
      }
      break;
    }
    case 'critical_ratio': {
      const total = db.prepare(`SELECT COUNT(*) as count FROM defects d WHERE d.status NOT IN ('closed','rejected') ${versionFilter}`).get(...versionParam);
      const critical = db.prepare(`SELECT COUNT(*) as count FROM defects d WHERE d.severity IN ('fatal','critical') AND d.status NOT IN ('closed','rejected') ${versionFilter}`).get(...versionParam);
      if (total.count > 0) {
        const ratio = (critical.count / total.count) * 100;
        if (ratio >= rule.threshold) {
          shouldAlert = true;
          message = `🟠 严重缺陷占比预警：严重/致命缺陷占比 ${ratio.toFixed(1)}%，已超过阈值 ${rule.threshold}%`;
          details = { ratio: ratio.toFixed(1), threshold: rule.threshold, critical: critical.count, total: total.count };
        }
      }
      break;
    }
    case 'unhandled_days': {
      const result = db.prepare(`
        SELECT COUNT(*) as count FROM defects d
        WHERE d.status IN ('new') AND d.severity IN ('fatal','critical')
        AND julianday('now') - julianday(d.created_at) >= ? ${versionFilter}
      `).get(rule.threshold, ...versionParam);
      if (result.count > 0) {
        shouldAlert = true;
        message = `🟡 超时未处理预警：有 ${result.count} 条严重/致命缺陷超过 ${rule.threshold} 天未处理`;
        details = { count: result.count, days: rule.threshold };
      }
      break;
    }
    case 'daily_increase': {
      const result = db.prepare(`
        SELECT COUNT(*) as count FROM defects d
        WHERE d.created_at >= datetime('now', '-1 day') ${versionFilter}
      `).get(...versionParam);
      if (result.count >= rule.threshold) {
        shouldAlert = true;
        message = `🟡 缺陷增长率预警：近24小时新增缺陷 ${result.count} 条，已超过阈值 ${rule.threshold} 条`;
        details = { count: result.count, threshold: rule.threshold };
      }
      break;
    }
  }

  if (shouldAlert) {
    // Check if same rule triggered in last 2 hours (avoid spam)
    const recentAlert = db.prepare(`
      SELECT id FROM alerts WHERE rule_id = ? AND triggered_at > datetime('now', '-2 hours')
    `).get(rule.id);

    if (!recentAlert) {
      const alertId = uuidv4();
      db.prepare(`
        INSERT INTO alerts (uuid, rule_id, version_id, message, details, alert_level)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(alertId, rule.id, rule.version_id, message, JSON.stringify(details), rule.alert_level);

      // Notify all managers and admins
      const managers = db.prepare(`SELECT id FROM users WHERE role IN ('admin','manager') AND is_active = 1`).all();
      for (const mgr of managers) {
        createNotification(db, mgr.id, 'alert', `预警触发: ${rule.name}`, message, '/alerts', rule.alert_level);
      }

      // Broadcast via SSE
      broadcast({
        type: 'alert',
        level: rule.alert_level,
        message,
        rule_name: rule.name,
        details
      });

      console.log(`[AlertEngine] 触发预警: ${message}`);
      return true;
    }
  }
  return false;
}

module.exports = { runAlertCheck, checkRule };
