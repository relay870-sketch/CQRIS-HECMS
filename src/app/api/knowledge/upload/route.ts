import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import fs from 'fs';
import { S3Storage, FetchClient, KnowledgeClient, Config, DataSourceType, HeaderUtils } from 'coze-coding-dev-sdk';
import { getDb, initDbWithSeed } from '@/lib/db';
import { isS3Configured, saveLocalFile, extractLocalText, resolveLocalFile } from '@/lib/storage';
import { writeAuditLog } from '@/lib/audit';

initDbWithSeed();

export const runtime = 'nodejs';

// POST /api/knowledge/upload - Upload document, parse, and index to knowledge base
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const projectId = (formData.get('projectId') as string) || '通用';
    const docCategory = (formData.get('category') as string) || '其他';

    if (!file) {
      return NextResponse.json({ error: '请选择文件' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
    ];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|docx|xlsx|pptx|txt|csv)$/i)) {
      return NextResponse.json({ error: '不支持的文件格式，请上传 PDF/Word/Excel/PPT/TXT/CSV 文件' }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const db = getDb();

    // 解析项目名称（云端路径用于构建 S3 key）
    const project = db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId) as { name?: string } | undefined;
    const projectName = project?.name || projectId;

    const docType = file.name.match(/\.(pdf|docx|xlsx|pptx|txt|csv)$/i)?.[1] || 'other';
    const typeMap: Record<string, string> = {
      pdf: 'drawing',
      docx: 'other',
      xlsx: 'bill',
      pptx: 'other',
      txt: 'other',
      csv: 'bill',
    };
    const type = typeMap[docType] || 'other';
    const uploadDate = new Date().toISOString().split('T')[0];
    const docId = randomUUID();

    // ---------- 本地模式：未配置 S3 时文件保存到本地，不依赖云端服务 ----------
    if (!isS3Configured()) {
      const storageUri = saveLocalFile(file.name, fileBuffer);
      const content = await extractLocalText(file.name, fileBuffer);

      try {
        db.prepare(`
          INSERT INTO documents (id, name, type, category, version, upload_date, is_latest, project_id, storage_uri, file_size, content)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          docId,
          file.name,
          type,
          docCategory,
          'V1.0',
          uploadDate,
          1,
          projectId,
          storageUri,
          file.size,
          content,
        );
      } catch (error) {
        // 插入失败时清理已保存的本地文件，避免产生孤儿文件
        try {
          const localPath = resolveLocalFile(storageUri);
          if (localPath) {
            fs.unlinkSync(localPath);
          }
        } catch (cleanupError) {
          console.error('清理上传失败的文件失败:', cleanupError);
        }
        throw error;
      }

      await writeAuditLog(db, request, { projectId, module: 'documents', action: 'upload', entityType: '资料文档', entityId: docId, summary: `上传资料：${file.name}（${docCategory}）`, after: { name: file.name, category: docCategory, size: file.size } });

      return NextResponse.json({
        success: true,
        fileName: file.name,
        storageUri,
        projectId,
        category: docCategory,
        documentId: docId,
        message: '文档上传成功（本地模式）',
      });
    }

    // ---------- 云端模式：S3 对象存储 + Coze 解析 + 知识索引 ----------
    const config = new Config();
    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });

    // Step 1: Upload file to object storage
    const fileKey = await storage.uploadFile({
      fileContent: fileBuffer,
      fileName: `knowledge/${projectName}/${file.name}`,
      contentType: file.type || 'application/octet-stream',
    });

    // Step 2: Generate presigned URL for parsing
    const fileUrl = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 3600,
    });

    // Step 3: Parse document content using FetchClient
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const fetchClient = new FetchClient(config, customHeaders);
    let textContent = '';

    try {
      const fetchResponse = await fetchClient.fetch(fileUrl);
      if (fetchResponse.status_code === 0 && fetchResponse.content) {
        textContent = fetchResponse.content
          .filter((item: { type: string }) => item.type === 'text')
          .map((item: { text?: string }) => item.text || '')
          .join('\n');
      }
    } catch {
      // If parsing fails, use file name as fallback content
      textContent = `文档名称: ${file.name}\n所属项目: ${projectName}\n分类: ${docCategory}\n上传时间: ${new Date().toISOString()}`;
    }

    // If no text content extracted, create a metadata entry
    if (!textContent.trim()) {
      textContent = `文档名称: ${file.name}\n所属项目: ${projectName}\n分类: ${docCategory}\n文件类型: ${file.name.split('.').pop()?.toUpperCase()}\n上传时间: ${new Date().toLocaleString('zh-CN')}`;
    }

    // Add project context to the content
    const enrichedContent = `[项目文档] ${projectName} - ${docCategory}\n文件名: ${file.name}\n---\n${textContent}`;

    // Step 4: Index to knowledge base
    const knowledgeClient = new KnowledgeClient(config, customHeaders);
    const addResponse = await knowledgeClient.addDocuments(
      [{
        source: DataSourceType.TEXT,
        raw_data: enrichedContent,
      }],
      'coze_doc_knowledge'
    );

    if (addResponse.code !== 0) {
      return NextResponse.json({
        error: '知识库索引失败',
        detail: addResponse.msg,
        fileKey,
        fileName: file.name,
      }, { status: 500 });
    }

    // Step 5: Save document record to database
    db.prepare(`
      INSERT INTO documents (id, name, type, category, version, upload_date, is_latest, project_id, storage_uri, file_size, content)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      docId,
      file.name,
      type,
      docCategory,
      'V1.0',
      uploadDate,
      1,
      projectId,
      fileKey,
      file.size,
      textContent,
    );

    await writeAuditLog(db, request, { projectId, module: 'documents', action: 'upload', entityType: '资料文档', entityId: docId, summary: `上传资料：${file.name}（${docCategory}）`, after: { name: file.name, category: docCategory, size: file.size } });
    return NextResponse.json({
      success: true,
      fileName: file.name,
      fileKey,
      projectId,
      projectName,
      category: docCategory,
      docId: addResponse.doc_ids?.[0],
      documentId: docId,
      message: '文档上传并索引成功',
    });
  } catch (error) {
    console.error('Upload error:', error);
    await writeAuditLog(getDb(), request, { module: 'documents', action: 'upload', entityType: '资料文档', summary: `资料上传失败：${error instanceof Error ? error.message : '未知错误'}`, result: 'failure' });
    return NextResponse.json({ 
      error: '上传失败',
      detail: error instanceof Error ? error.message : '未知错误',
    }, { status: 500 });
  }
}
