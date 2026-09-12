import { NextRequest, NextResponse } from 'next/server';
import { getChatHistory, clearChatHistory } from '@/lib/knowledge-tools';

// GET /api/chat/memory?projectId=xxx - 拉取该项目的历史问答（按时间正序）
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: '缺少项目 ID' }, { status: 400 });
  }
  const messages = getChatHistory(projectId, 50);
  return NextResponse.json({ success: true, messages });
}

// DELETE /api/chat/memory?projectId=xxx - 清空该项目的问答记忆
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: '缺少项目 ID' }, { status: 400 });
  }
  clearChatHistory(projectId);
  return NextResponse.json({ success: true, message: '对话记忆已清空' });
}
