const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const projectPath = process.env.COZE_WORKSPACE_PATH || process.cwd();
const shouldDelete = process.argv.includes('--delete');
const db = new Database(path.join(projectPath, 'data', 'construction.db'), { readonly: true });
const referenced = new Set();
for (const report of db.prepare('SELECT project_id, photos FROM reports').all()) {
  try {
    const photos = JSON.parse(report.photos || '[]');
    for (const photo of Array.isArray(photos) ? photos : []) {
      if (photo && typeof photo.name === 'string') referenced.add(`${report.project_id}/${path.basename(photo.name)}`);
    }
  } catch { /* 忽略无法解析的历史字段 */ }
}
db.close();

const root = path.join(projectPath, 'data', 'photos');
const cutoff = Date.now() - 24 * 60 * 60 * 1000;
let removed = 0;
if (fs.existsSync(root)) {
  for (const projectId of fs.readdirSync(root)) {
    const projectDir = path.join(root, projectId);
    if (!fs.statSync(projectDir).isDirectory()) continue;
    for (const name of fs.readdirSync(projectDir)) {
      const file = path.join(projectDir, name);
      const stat = fs.statSync(file);
      if (stat.isFile() && stat.mtimeMs < cutoff && !referenced.has(`${projectId}/${name}`)) {
        if (shouldDelete) fs.unlinkSync(file);
        removed++;
      }
    }
  }
}
console.log(shouldDelete
  ? `Photo cleanup completed: ${removed} orphan file(s) removed.`
  : `Photo cleanup preview: ${removed} orphan file(s) would be removed. Run with --delete to confirm.`);
