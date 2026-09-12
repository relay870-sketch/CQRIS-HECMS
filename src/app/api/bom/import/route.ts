import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

interface ImportItem {
  code?: unknown;
  name?: unknown;
  unit?: unknown;
  total_qty?: unknown;
  unit_price?: unknown;
  completed_qty?: unknown;
  system?: unknown;
}

function toStr(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      project_id?: unknown;
      items?: unknown;
      system?: unknown;
    };
    const { project_id, items } = body;
    const system = typeof body.system === 'string' && body.system.trim() ? body.system.trim() : null;

    if (!project_id || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: '缺少项目 ID 或导入数据' },
        { status: 400 }
      );
    }

    const db = getDb();
    let created = 0;
    let updated = 0;

    // 批量插入（显式生成 id，避免主键为 NULL）
    const insertStmt = db.prepare(`
      INSERT INTO bom_items (id, project_id, code, name, unit, total_qty, completed_qty, unit_price, system)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const updateStmt = db.prepare(`UPDATE bom_items SET name = ?, unit = ?, total_qty = ?, completed_qty = ?, unit_price = ?, system = ? WHERE id = ?`);
    const findExisting = db.prepare('SELECT id, completed_qty FROM bom_items WHERE project_id = ? AND code = ? LIMIT 1');
    const insertAdjustment = db.prepare(`INSERT INTO bom_adjustments
      (id, project_id, bom_item_id, before_qty, after_qty, delta_qty, reason, operator)
      VALUES (?, ?, ?, ?, ?, ?, 'Excel导入修正', '管理员')`);

    const insertMany = db.transaction((list: ImportItem[]) => {
      for (const item of list) {
        const code = toStr(item.code).trim();
        const name = toStr(item.name).trim();
        const totalQty = toNum(item.total_qty);
        const completedQty = toNum(item.completed_qty);
        const rowSystem = system || toStr(item.system).trim() || null;
        if (!code || !name || totalQty <= 0 || completedQty < 0 || completedQty > totalQty) {
          throw new Error(`清单“${name || code || '未命名'}”的数据无效，请检查编号、名称、总工程量和已完成数量`);
        }
        const existing = findExisting.get(project_id, code) as { id: string; completed_qty: number } | undefined;
        if (existing) {
          updateStmt.run(name, toStr(item.unit) || '米', totalQty, completedQty, toNum(item.unit_price), rowSystem, existing.id);
          if (existing.completed_qty !== completedQty) insertAdjustment.run(randomUUID(), project_id, existing.id, existing.completed_qty, completedQty, completedQty - existing.completed_qty);
          updated++;
        } else {
          const id = randomUUID();
          insertStmt.run(id, project_id, code, name, toStr(item.unit) || '米', totalQty, completedQty, toNum(item.unit_price), rowSystem);
          created++;
        }
      }
    });

    insertMany(items as ImportItem[]);

    await writeAuditLog(db, request, { projectId: String(project_id), module: 'bom', action: 'import', entityType: '工程量清单', summary: `导入清单：新增 ${created} 项，更新 ${updated} 项`, after: { created, updated, total: created + updated } });

    return NextResponse.json({
      success: true,
      count: created + updated,
      created,
      updated,
    });
  } catch (error) {
    console.error('批量导入清单失败:', error);
    await writeAuditLog(getDb(), request, { module: 'bom', action: 'import', entityType: '工程量清单', summary: `清单导入失败：${error instanceof Error ? error.message : '未知错误'}`, result: 'failure' });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '批量导入失败' },
      { status: 500 }
    );
  }
}
