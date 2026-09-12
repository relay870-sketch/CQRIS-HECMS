'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, Loader2, FileWarning, FileText, Table as TableIcon } from 'lucide-react';

interface SheetData {
  name: string;
  rows: string[][];
}

interface PreviewData {
  format: 'binary' | 'text' | 'xlsx' | 'docx-html' | 'unsupported';
  fileName?: string;
  url?: string;
  downloadUrl?: string;
  contentType?: 'pdf' | 'image';
  content?: string;
  html?: string;
  sheets?: SheetData[];
  message?: string;
  error?: string;
  detail?: string;
}

export default function DocumentPreviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const docId = params.id;

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PreviewData | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/documents/${docId}/preview`)
      .then((res) => res.json())
      .then((json: PreviewData) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData({ format: 'unsupported', message: '预览数据加载失败' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [docId]);

  const handleDownload = () => {
    if (data?.downloadUrl) {
      window.open(data.downloadUrl, '_blank');
    }
  };

  const handleBack = () => {
    // 有历史记录时返回上一页；直接打开/刷新导致的空历史则回到知识库
    if (window.history.length > 1) {
      router.back();
    } else {
      router.replace('/knowledge');
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#F5F6F8]">
      {/* 顶栏 */}
      <header className="bg-white px-3 py-2.5 border-b border-gray-100 flex items-center gap-2 shrink-0">
        <button
          onClick={handleBack}
          className="p-2 -ml-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="返回"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-sm font-medium text-[#1A1A2E] truncate">
          {data?.fileName || '文档预览'}
        </h1>
        <button
          onClick={handleDownload}
          disabled={!data?.downloadUrl}
          className="flex items-center gap-1 px-3 py-1.5 bg-[#1E5AA8] text-white rounded-lg text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-3.5 h-3.5" />
          下载
        </button>
      </header>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <span className="text-sm">加载中...</span>
          </div>
        ) : data?.format === 'binary' ? (
          data.contentType === 'image' ? (
            <div className="h-full flex items-center justify-center p-4 bg-gray-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.url}
                alt={data.fileName || '图片预览'}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          ) : (
            <iframe src={data.url} className="w-full h-full border-0" title="PDF 预览" />
          )
        ) : data?.format === 'docx-html' && data.html ? (
          <iframe
            srcDoc={data.html}
            sandbox=""
            className="w-full h-full border-0 bg-white"
            title="Word 文档预览"
          />
        ) : data?.format === 'text' ? (
          <pre className="p-4 text-sm text-[#1A1A2E] whitespace-pre-wrap font-mono leading-relaxed">
            {data.content}
          </pre>
        ) : data?.format === 'xlsx' && data.sheets ? (
          <div className="p-3 space-y-4">
            {data.sheets.map((sheet, idx) => (
              <div key={idx} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
                  <TableIcon className="w-4 h-4 text-[#16A34A]" />
                  <span className="text-sm font-medium text-[#1A1A2E]">{sheet.name}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <tbody>
                      {sheet.rows.map((row, r) => (
                        <tr key={r} className={r === 0 ? 'bg-[#E8F0FE]' : r % 2 ? 'bg-[#FAFBFC]' : 'bg-white'}>
                          {row.map((cell, c) => (
                            <td
                              key={c}
                              className={`px-2.5 py-1.5 border border-gray-100 text-[#1A1A2E] ${
                                r === 0 ? 'font-medium text-[#1E5AA8]' : ''
                              }`}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center px-8 text-center">
            <FileWarning className="w-12 h-12 text-gray-300 mb-3" />
            <p className="text-sm text-[#1A1A2E] font-medium mb-1">无法在线预览</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              {data?.message || data?.detail || data?.error || '该文件格式暂不支持在线预览'}
            </p>
            {data?.downloadUrl && (
              <button
                onClick={handleDownload}
                className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-[#1E5AA8] text-white rounded-lg text-sm font-medium"
              >
                <Download className="w-4 h-4" />
                下载文件查看
              </button>
            )}
            {!data?.downloadUrl && (
              <div className="mt-4 flex items-center gap-1.5 text-xs text-gray-400">
                <FileText className="w-4 h-4" />
                该记录为历史元数据，无实际文件
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
