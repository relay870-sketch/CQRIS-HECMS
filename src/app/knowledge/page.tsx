'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useProject } from '@/components/project-provider';
import { Upload, Search, MessageSquare, FileText, Image, Table as TableIcon, File, Send, Bot, User, Loader2, Trash2, Eye, X } from 'lucide-react';

interface KnowledgeDocument {
  id: string;
  name: string;
  type: string;
  category: string;
  upload_date: string;
  project_id: string;
  storage_uri?: string;
}

interface SearchResult {
  text: string;
  content?: string;
  score: number;
  name?: string;
  category?: string;
  documentId?: string;
  docId?: string;
  hasFile?: boolean;
  metadata?: Record<string, unknown>;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  references?: SearchResult[];
}

/** 从搜索结果文本中提取 [文档名] 前缀 */
function extractNameFromText(text: string): string {
  const m = text.match(/^\[(.+?)\]/);
  return m ? m[1] : '';
}

/** 将 AI 返回的系统内核对路径显示为可点击链接。 */
function MessageContent({ content }: { content: string }) {
  const parts = content.split(/(\/(?:project|manage|records)(?:\/[^\s；，。]*)?(?:\?[^\s；，。]*)?)/g);
  return <p className="whitespace-pre-wrap">{parts.map((part, index) => /^\/(?:project|manage|records)/.test(part)
    ? <a key={`${part}-${index}`} href={part} className="font-medium text-[#1E5AA8] underline decoration-[#1E5AA8]/30 underline-offset-2">查看对应数据</a>
    : <span key={index}>{part}</span>)}</p>;
}

export default function KnowledgePage() {
  const { currentProject, isReady } = useProject();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'documents' | 'chat'>('documents');
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; status: string }[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDocuments();
  }, [currentProject.id]);

  // 恢复 URL 中的 tab / 搜索词状态（从预览页返回时保持所在 tab 与搜索结果）
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab === 'chat') {
      setActiveTab('chat');
    }
    const q = params.get('q');
    if (q) {
      setSearchQuery(q);
      void runSearch(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeTab = (tab: 'documents' | 'chat') => {
    setActiveTab(tab);
    // 同步到 URL；搜索词保留
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (tab === 'chat') {
      window.history.replaceState(
        null,
        '',
        `/knowledge?tab=chat${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      );
    } else {
      window.history.replaceState(null, '', q ? `/knowledge?q=${encodeURIComponent(q)}` : '/knowledge');
    }
  };

  useEffect(() => {
    const container = chatScrollRef.current;
    if (!container) return;
    const frame = window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/documents?projectId=${currentProject.id}`);
      const data = await res.json();
      setDocuments(data);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const progress: { name: string; status: string }[] = [];
    
    for (const file of Array.from(files)) {
      progress.push({ name: file.name, status: '上传中...' });
      setUploadProgress([...progress]);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('projectId', currentProject.id);
      formData.append('category', '其他');

      try {
        const res = await fetch('/api/knowledge/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        
        if (data.success) {
          const idx = progress.findIndex(p => p.name === file.name);
          if (idx >= 0) progress[idx].status = '上传成功';
        } else {
          const idx = progress.findIndex(p => p.name === file.name);
          if (idx >= 0) progress[idx].status = `失败: ${data.error}`;
        }
      } catch {
        const idx = progress.findIndex(p => p.name === file.name);
        if (idx >= 0) progress[idx].status = '上传失败';
      }
      setUploadProgress([...progress]);
    }

    setUploading(false);
    fetchDocuments();
    e.target.value = '';
  };

  const runSearch = async (query: string) => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch('/api/knowledge/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), topK: 5 }),
      });
      const data = await res.json();
      setSearchResults(data.results || []);
      // 把搜索词同步到 URL，返回/刷新时可恢复搜索状态
      window.history.replaceState(
        null,
        '',
        `/knowledge?q=${encodeURIComponent(query.trim())}`,
      );
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  };

  // 输入即搜（300ms 防抖）
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchInput = (value: string) => {
    setSearchQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      void runSearch(value);
    }, 300);
  };

  const handleChat = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage = chatInput;
    setChatInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setChatLoading(true);

    try {
      const res = await fetch('/api/knowledge/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: messages.slice(-6),
          projectId: currentProject.id,
          projectName: currentProject.name,
        }),
      });

      if (!res.ok) throw new Error('Chat request failed');

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader available');

      let assistantContent = '';
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.content) {
                assistantContent += data.content;
                setMessages(prev => {
                  const newMsgs = [...prev];
                  newMsgs[newMsgs.length - 1] = { role: 'assistant', content: assistantContent };
                  return newMsgs;
                });
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: '抱歉，发生了错误，请重试。' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'drawing': return <Image className="w-5 h-5 text-[#1E5AA8]" />;
      case 'bill': return <TableIcon className="w-5 h-5 text-[#16A34A]" />;
      default: return <File className="w-5 h-5 text-gray-400" />;
    }
  };

  const getTypeName = (type: string) => {
    switch (type) {
      case 'drawing': return '图纸';
      case 'bill': return '清单';
      case 'change': return '变更';
      default: return '其他';
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!confirm('确定要删除这个文档吗？')) return;
    
    try {
      const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE' });
      const data = await res.json();
      
      if (data.success) {
        fetchDocuments(); // Refresh the list
      } else {
        alert(data.error || '删除失败');
      }
    } catch (error) {
      console.error('Delete error:', error);
      alert('删除失败');
    }
  };

  const handlePreviewDocument = (docId: string) => {
    // 站内跳转到预览页（同标签页），预览页左上角返回可回到列表
    router.push(`/documents/${docId}/preview`);
  };

  const clearChat = async () => {
    if (messages.length === 0) return;
    if (confirm('确定清空当前对话吗？')) {
      try {
        await fetch(`/api/chat/memory?projectId=${currentProject.id}`, { method: 'DELETE' });
      } catch (error) {
        console.error('清空记忆失败:', error);
      }
      setMessages([]);
      setChatInput('');
    }
  };

  // 按项目加载 AI 问答历史（永久记忆，切换项目互不影响）
  useEffect(() => {
    if (!isReady || currentProject.name === '加载中...') return;
    let cancelled = false;
    fetch(`/api/chat/memory?projectId=${currentProject.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.messages) ? data.messages : [];
        setMessages(
          list.map((m: { role: string; content: string }) => ({
            role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
            content: m.content,
          })),
        );
      })
      .catch((error) => console.error('加载问答历史失败:', error));
    return () => {
      cancelled = true;
    };
  }, [currentProject.id, isReady]);

  return (
    <div className={activeTab === 'chat'
      ? 'flex h-[calc(100dvh-112px-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] min-h-0 flex-col overflow-hidden bg-[#F5F6F8]'
      : 'min-h-screen bg-[#F5F6F8] pb-6'}>
      {/* Tabs */}
      <div className="shrink-0 border-b border-gray-100 bg-white px-4 py-2">
        <div className="flex gap-1">
          {[
            { key: 'documents', label: '文档管理', icon: FileText },
            { key: 'chat', label: 'AI问答', icon: MessageSquare },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => changeTab(tab.key as 'documents' | 'chat')}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key ? 'bg-[#1E5AA8] text-white' : 'text-gray-500'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div className="px-4 py-3">
          {/* Upload Area */}
          <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#1E5AA8]/30 rounded-xl p-6 cursor-pointer hover:bg-[#E8F0FE]/30 transition-colors">
              <Upload className="w-8 h-8 text-[#1E5AA8] mb-2" />
              <span className="text-sm font-medium text-[#1E5AA8]">点击上传文档</span>
              <span className="text-xs text-gray-400 mt-1">支持 PDF、Word、Excel、PPT、TXT</span>
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Upload Progress */}
          {uploadProgress.length > 0 && (
            <div className="bg-white rounded-xl p-4 shadow-sm mb-4">
              <h3 className="text-sm font-medium text-[#1A1A2E] mb-2">上传进度</h3>
              <div className="space-y-2">
                {uploadProgress.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 truncate mr-2">{item.name}</span>
                    <span className={`text-xs ${item.status === '上传成功' ? 'text-[#16A34A]' : item.status.includes('失败') ? 'text-red-500' : 'text-[#1E5AA8]'}`}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 搜索（输入即搜） */}
          <div className="bg-white rounded-xl p-3 shadow-sm mb-4">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                placeholder="搜索项目文档（输入即搜）..."
                className="w-full pl-9 pr-9 py-2.5 bg-[#F5F6F8] rounded-lg text-sm text-[#1A1A2E] placeholder:text-gray-300"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => handleSearchInput('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 p-0.5"
                  aria-label="清除搜索"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Document List / Search Results */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="text-sm font-medium text-[#1A1A2E] mb-3">
              {searchQuery.trim()
                ? searching
                  ? '搜索中...'
                  : `搜索结果（${searchResults.length}）`
                : '项目文档'}
            </h3>
            {searchQuery.trim() ? (
              searching ? (
                <div className="text-center py-8 text-gray-400">搜索中...</div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-8">
                  <Search className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400">未找到相关内容</p>
                  <p className="text-gray-300 text-xs mt-1">试试其他关键词</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {searchResults.map((result, idx) => {
                    const name = result.name || extractNameFromText(result.text);
                    const targetDocId = result.documentId;
                    // 仅当有本地文档 id 且存在实际文件时提供跳转预览
                    const canOpen = !!targetDocId && result.hasFile !== false;
                    const snippet = result.content || result.text;
                    return (
                      <div
                        key={idx}
                        onClick={canOpen ? () => handlePreviewDocument(targetDocId!) : undefined}
                        className={`p-3 bg-[#F5F6F8] rounded-xl ${
                          canOpen ? 'cursor-pointer active:bg-[#E8F0FE] transition-colors' : ''
                        }`}
                      >
                        {name && (
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="text-sm font-medium text-[#1A1A2E] truncate">{name}</span>
                            <span className="text-xs text-gray-400 shrink-0">
                              相关度 {Math.round(result.score * 100)}%
                            </span>
                          </div>
                        )}
                        <p className="text-sm text-[#1A1A2E] leading-relaxed line-clamp-3">{snippet}</p>
                        {canOpen && (
                          <div className="mt-2 text-xs text-[#1E5AA8] font-medium">查看文档 ›</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            ) : loading ? (
              <div className="text-center py-8 text-gray-400">加载中...</div>
            ) : documents.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-gray-200 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">暂无文档</p>
                <p className="text-gray-300 text-xs mt-1">上传文档后会自动加入知识库</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => handlePreviewDocument(doc.id)}
                    className="flex items-center gap-3 p-3 bg-[#F5F6F8] rounded-xl cursor-pointer active:bg-[#E8F0FE] transition-colors"
                  >
                    {getFileIcon(doc.type)}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#1A1A2E] truncate">{doc.name}</div>
                      <div className="text-xs text-gray-400">
                        {getTypeName(doc.type)} · {doc.upload_date}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {doc.storage_uri && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePreviewDocument(doc.id); }}
                          className="p-2 text-[#1E5AA8] hover:bg-[#E8F0FE] rounded-lg transition-colors"
                          title="预览"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteDocument(doc.id); }}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="删除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Chat Tab */}
      {activeTab === 'chat' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {messages.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-100 shrink-0">
              <span className="text-xs text-gray-400">共 {messages.length} 条对话</span>
              <button
                onClick={clearChat}
                className="flex items-center gap-1 text-xs text-red-500 hover:bg-red-50 rounded-lg px-2 py-1 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                清空对话
              </button>
            </div>
          )}
          <div ref={chatScrollRef} className="min-h-0 flex-1 touch-pan-y space-y-4 overflow-y-auto overscroll-contain px-4 py-3 [-webkit-overflow-scrolling:touch]">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <Bot className="w-12 h-12 text-[#1E5AA8] mx-auto mb-3" />
                <p className="text-[#1A1A2E] font-medium">AI 知识助手</p>
                <p className="text-gray-400 text-sm mt-1">查询项目、清单、考勤、施工记录和知识库</p>
                <div className="mt-4 space-y-2">
                  {['生成今天的施工日报', '本月谁加班最多？', '哪些清单子目还没有完成？', '最近7天有哪些合同外施工？'].map((q) => (
                    <button
                      key={q}
                      onClick={() => { setChatInput(q); }}
                      className="block w-full text-left px-4 py-2 bg-white rounded-lg text-sm text-gray-600 hover:bg-[#E8F0FE] transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 bg-[#1E5AA8] rounded-full flex items-center justify-center shrink-0">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                )}
                <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-[#1E5AA8] text-white'
                    : 'bg-white text-[#1A1A2E] shadow-sm'
                }`}>
                  <MessageContent content={msg.content}/>
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 bg-gray-200 rounded-full flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-gray-500" />
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-2">
                <div className="w-7 h-7 bg-[#1E5AA8] rounded-full flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-white px-3 py-2 rounded-xl shadow-sm">
                  <Loader2 className="w-4 h-4 animate-spin text-[#1E5AA8]" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="px-4 py-3 bg-white border-t border-gray-100 shrink-0">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                placeholder="输入您的问题..."
                className="flex-1 px-4 py-3 bg-[#F5F6F8] rounded-lg text-sm text-[#1A1A2E] placeholder:text-gray-300"
              />
              <button
                onClick={handleChat}
                disabled={chatLoading || !chatInput.trim()}
                className="px-4 py-3 bg-[#1E5AA8] text-white rounded-lg disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
