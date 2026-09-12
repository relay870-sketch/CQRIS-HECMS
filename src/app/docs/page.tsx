'use client';

import { useState } from 'react';
import {
  FolderOpen, FileText, FileSpreadsheet, FileCheck,
  ChevronRight, ChevronDown, Search, AlertCircle, Eye,
} from 'lucide-react';
import { projects, documents, getDocumentsByProject } from '@/lib/mock-data';

const typeIcons: Record<string, React.ElementType> = {
  '施工图纸': FileText,
  '工程量清单': FileSpreadsheet,
  '变更签证': FileCheck,
  '其他资料': FileText,
};

const typeColors: Record<string, string> = {
  '施工图纸': 'bg-blue-50 text-[#1E5AA8]',
  '工程量清单': 'bg-green-50 text-[#16A34A]',
  '变更签证': 'bg-orange-50 text-[#E8740C]',
  '其他资料': 'bg-gray-50 text-gray-600',
};

export default function DocsPage() {
  const [selectedProject, setSelectedProject] = useState(projects[0].id);
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewDoc, setPreviewDoc] = useState<string | null>(null);

  const projectDocs = getDocumentsByProject(selectedProject);

  // Group by folder
  const folders = projectDocs.reduce<Record<string, typeof projectDocs>>((acc, doc) => {
    if (!acc[doc.folder]) acc[doc.folder] = [];
    acc[doc.folder].push(doc);
    return acc;
  }, {});

  const filteredFolders = searchQuery
    ? Object.fromEntries(
        Object.entries(folders).map(([folder, docs]) => [
          folder,
          docs.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase())),
        ]).filter(([, docs]) => docs.length > 0)
      ) as Record<string, typeof projectDocs>
    : folders;

  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      {/* Header */}
      <div className="bg-[#1E5AA8] px-4 pt-10 pb-4">
        <h1 className="text-white text-lg font-bold">项目文档中心</h1>
        <p className="text-blue-200 text-xs mt-0.5">施工图纸、清单、变更文件</p>
      </div>

      {/* Project selector */}
      <div className="px-4 -mt-2">
        <div className="bg-white rounded-xl shadow-sm p-1 flex gap-1 overflow-x-auto no-scrollbar">
          {projects.map(p => (
            <button
              key={p.id}
              onClick={() => { setSelectedProject(p.id); setExpandedFolder(null); }}
              className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedProject === p.id
                  ? 'bg-[#1E5AA8] text-white'
                  : 'text-gray-500'
              }`}
            >
              {p.name.length > 10 ? p.name.slice(0, 10) + '...' : p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="px-4 mt-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索文档..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full py-2.5 pl-9 pr-3 border border-gray-200 rounded-lg text-sm bg-white"
          />
        </div>
      </div>

      {/* Document list */}
      <div className="px-4 py-3 space-y-2">
        {Object.entries(filteredFolders).map(([folder, docs]) => (
          <div key={folder} className="bg-white rounded-xl shadow-sm overflow-hidden">
            <button
              onClick={() => setExpandedFolder(expandedFolder === folder ? null : folder)}
              className="w-full flex items-center justify-between p-4"
            >
              <div className="flex items-center gap-2">
                <FolderOpen size={18} className="text-[#E8740C]" />
                <span className="text-sm font-medium text-gray-800">{folder}</span>
                <span className="text-xs text-gray-400">({docs.length})</span>
              </div>
              {expandedFolder === folder ? (
                <ChevronDown size={16} className="text-gray-400" />
              ) : (
                <ChevronRight size={16} className="text-gray-400" />
              )}
            </button>

            {expandedFolder === folder && (
              <div className="border-t border-gray-50">
                {docs.map(doc => {
                  const Icon = typeIcons[doc.type] || FileText;
                  const colorClass = typeColors[doc.type] || 'bg-gray-50 text-gray-600';
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0"
                    >
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colorClass}`}>
                        <Icon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-gray-800 truncate">{doc.name}</span>
                          {doc.isObsolete && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-500 rounded-full whitespace-nowrap">
                              已作废
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-400">{doc.version}</span>
                          <span className="text-[10px] text-gray-300">|</span>
                          <span className="text-[10px] text-gray-400">{doc.uploadTime}</span>
                          <span className="text-[10px] text-gray-300">|</span>
                          <span className="text-[10px] text-gray-400">{doc.size}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setPreviewDoc(doc.id)}
                        className="p-2 text-[#1E5AA8]"
                      >
                        <Eye size={18} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {Object.keys(filteredFolders).length === 0 && (
          <div className="text-center py-12">
            <FolderOpen size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-400">暂无文档</p>
          </div>
        )}
      </div>

      {/* Preview modal */}
      {previewDoc && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center" onClick={() => setPreviewDoc(null)}>
          <div
            className="bg-white w-full max-w-[480px] rounded-t-2xl p-6 pb-8"
            onClick={e => e.stopPropagation()}
          >
            {(() => {
              const doc = documents.find(d => d.id === previewDoc);
              if (!doc) return null;
              const Icon = typeIcons[doc.type] || FileText;
              return (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-gray-800">文档详情</h3>
                    <button onClick={() => setPreviewDoc(null)} className="text-gray-400 text-sm">关闭</button>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-6 flex flex-col items-center mb-4">
                    <Icon size={48} className="text-[#1E5AA8] mb-3" />
                    <h4 className="text-sm font-medium text-gray-800 text-center">{doc.name}</h4>
                    <p className="text-xs text-gray-400 mt-1">{doc.type} · {doc.version}</p>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-2 border-b border-gray-50">
                      <span className="text-gray-500">专业分类</span>
                      <span className="text-gray-800">{doc.folder}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-50">
                      <span className="text-gray-500">文件大小</span>
                      <span className="text-gray-800">{doc.size}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-50">
                      <span className="text-gray-500">上传时间</span>
                      <span className="text-gray-800">{doc.uploadTime}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-gray-50">
                      <span className="text-gray-500">版本</span>
                      <span className="text-gray-800">{doc.version}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-gray-500">状态</span>
                      <span className={doc.isObsolete ? 'text-red-500' : 'text-[#16A34A]'}>
                        {doc.isObsolete ? '已作废' : '有效'}
                      </span>
                    </div>
                  </div>
                  {doc.type === '施工图纸' && (
                    <button className="w-full mt-4 py-3 bg-[#1E5AA8] text-white rounded-xl font-medium text-sm">
                      在线预览PDF
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
