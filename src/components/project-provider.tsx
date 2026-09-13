'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export interface Project {
  id: string;
  name: string;
  section: string;
  status: string;
  start_date: string;
  end_date: string;
  manager: string;
  progress: number;
  progress_source?: 'contract_value' | 'pending_prices';
  pricing_complete?: boolean;
}

interface ProjectContextType {
  currentProject: Project;
  setCurrentProject: (project: Project) => void;
  allProjects: Project[];
  isReady: boolean;
  refreshProjects: () => Promise<void>;
}

const defaultProject: Project = {
  id: 'p1',
  name: '加载中...',
  section: '',
  status: 'in_progress',
  start_date: '',
  end_date: '',
  manager: '',
  progress: 0,
};

const ProjectContext = createContext<ProjectContextType | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [currentProject, setCurrentProject] = useState<Project>(defaultProject);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [isReady, setIsReady] = useState(false);

  const refreshProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects', { cache: 'no-store' });
      const data: unknown = await res.json();
      if (!Array.isArray(data)) return;
      const projectList = data as Project[];
      setAllProjects(projectList);
      if (projectList.length > 0) {
        const savedProjectId = window.localStorage.getItem('current-project-id');
        const savedProject = projectList.find((project) => project.id === savedProjectId);
        setCurrentProject(savedProject ?? projectList[0]);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const handleSetProject = useCallback((project: Project) => {
    setCurrentProject(project);
    window.localStorage.setItem('current-project-id', project.id);
  }, []);

  return (
    <ProjectContext.Provider value={{ currentProject, setCurrentProject: handleSetProject, allProjects, isReady, refreshProjects }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}

export function ProjectSelector() {
  const { currentProject, setCurrentProject, allProjects } = useProject();
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = useCallback((project: Project) => {
    setCurrentProject(project);
    setIsOpen(false);
  }, [setCurrentProject]);

  const shortProjectName = currentProject.name
    .replace(/(?:高速公路|高速)?机电(?:安装)?工程.*$/, '')
    .replace(/施工(?:总承包)?项目.*$/, '')
    .trim() || currentProject.name;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 py-1.5 rounded-lg hover:opacity-80 active:opacity-60 transition-opacity"
      >
        <span className="max-w-[140px] truncate text-base font-semibold text-white">
          {shortProjectName}
        </span>
        <ChevronDown className={`w-4 h-4 text-white/80 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[65]" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-full z-[70] mt-1 w-64 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg">
            <div className="p-2 border-b border-gray-50">
              <div className="text-xs text-gray-400 px-2 py-1">切换项目</div>
            </div>
            <div className="max-h-60 overflow-y-auto p-1">
              {allProjects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleSelect(project)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    currentProject.id === project.id
                      ? 'bg-[#E8F0FE] text-[#1E5AA8]'
                      : 'text-[#1A1A2E] active:bg-gray-50'
                  }`}
                >
                  <div className="font-medium">{project.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{project.section}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
