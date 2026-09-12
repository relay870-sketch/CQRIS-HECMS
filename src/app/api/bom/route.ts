import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getDb, initDbWithSeed } from '@/lib/db';
import { writeAuditLog } from '@/lib/audit';

initDbWithSeed();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const system = searchParams.get('system');
  const adjustmentsFor = searchParams.get('adjustmentsFor');

  const db = getDb();
  if (adjustmentsFor) {
    return NextResponse.json(db.prepare(`SELECT id, before_qty, after_qty, delta_qty, reason, operator, created_at
      FROM bom_adjustments WHERE bom_item_id = ? ORDER BY created_at DESC`).all(adjustmentsFor));
  }

  let query = 'SELECT * FROM bom_items WHERE 1=1';
  const params: string[] = [];
  if (projectId) { query += ' AND project_id = ?'; params.push(projectId); }
  if (system) { query += ' AND system = ?'; params.push(system); }
  query += ' ORDER BY code';

  return NextResponse.json(db.prepare(query).all(...params));
}

// Create new BOM item
export async function POST(request: Request) {
  const db = getDb();
  const body = await request.json();
  
  const { project_id, code, name, unit, total_qty, unit_price, system } = body;
  
  if (!project_id || !code || !name || !unit || !total_qty) {
    return NextResponse.json({ error: '缺少必填字段' }, { status: 400 });
  }

  // Check project exists
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(project_id);
  if (!project) {
    return NextResponse.json({ error: '项目不存在' }, { status: 404 });
  }

  // Check code uniqueness within project
  const existing = db.prepare('SELECT id FROM bom_items WHERE project_id = ? AND code = ?').get(project_id, code);
  if (existing) {
    return NextResponse.json({ error: '该清单编号已存在' }, { status: 400 });
  }

  const id = 'b' + Date.now();
  
  db.prepare(`
    INSERT INTO bom_items (id, project_id, code, name, unit, total_qty, completed_qty, unit_price, system)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(id, project_id, code, name, unit, total_qty, Number(unit_price) || 0, typeof system === 'string' && system ? system : null);

  const item = db.prepare('SELECT * FROM bom_items WHERE id = ?').get(id);
  await writeAuditLog(db, request, { projectId: project_id, module: 'bom', action: 'create', entityType: '清单子目', entityId: id, summary: `新增清单子目：${code} ${name}`, after: item });
  return NextResponse.json(item, { status: 201 });
}

// Update BOM item
export async function PUT(request: Request) {
  const db = getDb();
  const body = await request.json();
  
  const { id, code, name, unit, total_qty, completed_qty, unit_price, adjustment_reason, system } = body;
  
  if (!id) {
    return NextResponse.json({ error: '缺少清单ID' }, { status: 400 });
  }

  const existing = db.prepare('SELECT * FROM bom_items WHERE id = ?').get(id);
  if (!existing) {
    return NextResponse.json({ error: '清单项不存在' }, { status: 404 });
  }

  const currentItem = existing as { project_id: string; total_qty: number; completed_qty: number; unit_price: number };
  const nextTotalQty = total_qty !== undefined ? Number(total_qty) : currentItem.total_qty;
  const nextCompletedQty = completed_qty !== undefined ? Number(completed_qty) : currentItem.completed_qty;
  if (!Number.isFinite(nextTotalQty) || nextTotalQty <= 0) {
    return NextResponse.json({ error: '总工程量必须大于 0' }, { status: 400 });
  }
  if (!Number.isFinite(nextCompletedQty) || nextCompletedQty < 0 || nextCompletedQty > nextTotalQty) {
    return NextResponse.json({ error: `已完成数量应在 0～${nextTotalQty} 之间` }, { status: 400 });
  }
  const nextUnitPrice = unit_price !== undefined ? Number(unit_price) : currentItem.unit_price;
  if (!Number.isFinite(nextUnitPrice) || nextUnitPrice < 0) {
    return NextResponse.json({ error: '单价不能小于 0' }, { status: 400 });
  }
  const quantityChanged = nextCompletedQty !== currentItem.completed_qty;
  const reason = typeof adjustment_reason === 'string' ? adjustment_reason.trim() : '';
  if (quantityChanged && !reason) {
    return NextResponse.json({ error: '手动修正已完成数量时，请填写调整原因' }, { status: 400 });
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE bom_items SET 
      code = COALESCE(?, code),
      name = COALESCE(?, name),
      unit = COALESCE(?, unit),
      total_qty = COALESCE(?, total_qty),
      completed_qty = COALESCE(?, completed_qty),
      unit_price = COALESCE(?, unit_price),
      system = COALESCE(?, system)
    WHERE id = ?
    `).run(code || null, name || null, unit || null, nextTotalQty, nextCompletedQty, nextUnitPrice,
      typeof system === 'string' && system ? system : null, id);
    if (quantityChanged) {
      db.prepare(`INSERT INTO bom_adjustments
        (id, project_id, bom_item_id, before_qty, after_qty, delta_qty, reason, operator)
        VALUES (?, ?, ?, ?, ?, ?, ?, '管理员')`)
        .run(randomUUID(), currentItem.project_id, id, currentItem.completed_qty, nextCompletedQty,
          nextCompletedQty - currentItem.completed_qty, reason);
    }
  })();

  const item = db.prepare('SELECT * FROM bom_items WHERE id = ?').get(id);
  await writeAuditLog(db, request, { projectId: currentItem.project_id, module: 'bom', action: 'update', entityType: '清单子目', entityId: id, summary: `修改清单子目：${code || name || id}${quantityChanged ? `；完成量 ${currentItem.completed_qty} → ${nextCompletedQty}；原因：${reason}` : ''}`, before: existing, after: item });
  return NextResponse.json(item);
}

// Delete BOM item(s) - 支持单个 id 或批量 ids（逗号分隔）
export async function DELETE(request: Request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const ids = searchParams.get('ids');

  const idList = ids ? ids.split(',').map((s) => s.trim()).filter(Boolean) : (id ? [id] : []);
  if (idList.length === 0) {
    return NextResponse.json({ error: '缺少清单ID' }, { status: 400 });
  }

  const deletedItems = idList.map((itemId) => db.prepare('SELECT * FROM bom_items WHERE id = ?').get(itemId)).filter(Boolean) as Array<{ project_id?: string; code?: string; name?: string }>;
  db.transaction(() => {
    const stmt = db.prepare('DELETE FROM bom_items WHERE id = ?');
    for (const itemId of idList) {
      stmt.run(itemId);
    }
  })();

  await writeAuditLog(db, request, { projectId: deletedItems[0]?.project_id, module: 'bom', action: 'delete', entityType: '清单子目', summary: `删除清单子目 ${idList.length} 项`, before: deletedItems });

  return NextResponse.json({ success: true, deleted: idList.length });
}
