import { NextRequest, NextResponse } from 'next/server';
import { KnowledgeClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getDb, initDbWithSeed } from '@/lib/db';
import { isCozeApiConfigured } from '@/lib/storage';

initDbWithSeed();

export const runtime = 'nodejs';

interface DocumentRow {
  id: string;
  name: string;
  category: string;
  type: string;
  content: string | null;
  upload_date: string;
  project_id: string;
  storage_uri: string | null;
}

// POST /api/knowledge/search - Semantic search in knowledge base
export async function POST(request: NextRequest) {
  try {
    const { query, topK = 5 } = await request.json();

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json({ error: '请输入搜索内容' }, { status: 400 });
    }

    // ---------- 本地模式：未配置 Coze AI 服务时使用数据库关键词检索 ----------
    if (!isCozeApiConfigured()) {
      const db = getDb();
      const k = Math.min(topK, 10);
      const like = `%${query.trim()}%`;
      const rows = db.prepare(`
        SELECT id, name, category, type, content, upload_date, project_id, storage_uri
        FROM documents
        WHERE name LIKE ? OR category LIKE ? OR content LIKE ?
        ORDER BY upload_date DESC
        LIMIT ?
      `).all(like, like, like, k) as DocumentRow[];

      const results = rows.map((row) => {
        const name = row.name || '';
        const category = row.category || '';
        const content = (row.content || '').slice(0, 200);
        let score = 0.5;
        if (name.includes(query.trim())) score = 1;
        else if (category.includes(query.trim())) score = 0.8;
        const text = content ? `[${name}]\n${content}` : `[${name}]`;
        return {
          text,
          content,
          score,
          docId: row.id,
          documentId: row.id,
          name,
          category,
          hasFile: !!row.storage_uri,
        };
      });

      return NextResponse.json({
        success: true,
        query: query.trim(),
        results,
        total: results.length,
        mode: 'local',
      });
    }

    // ---------- 云端模式：Coze 语义搜索 ----------
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const client = new KnowledgeClient(new Config(), customHeaders);

    const searchResponse = await client.search(
      query.trim(),
      undefined, // search all datasets
      Math.min(topK, 10),
      0.3 // min score threshold
    );

    if (searchResponse.code !== 0) {
      return NextResponse.json({
        error: '搜索失败',
        detail: searchResponse.msg,
      }, { status: 500 });
    }

    const results = (searchResponse.chunks || []).map((chunk) => ({
      text: chunk.content,
      content: chunk.content,
      score: chunk.score,
      docId: chunk.doc_id,
    }));

    return NextResponse.json({
      success: true,
      query: query.trim(),
      results,
      total: results.length,
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({
      error: '搜索失败',
      detail: error instanceof Error ? error.message : '未知错误',
    }, { status: 500 });
  }
}
