const REPORTER_MANAGE_API_PREFIXES = [
  '/api/projects',
  '/api/workers',
  '/api/locations',
  '/api/attendance',
  '/api/systems',
  '/api/bom',
];

function matchesApiPath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function reporterCanWrite(method: string, path: string): boolean {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = path.length > 1 ? path.replace(/\/+$/, '') : path;

  // 报工人员可新建、校验和修改报工，但不可删除施工记录。
  if (matchesApiPath(normalizedPath, '/api/reports')) {
    return ['POST', 'PUT', 'PATCH'].includes(normalizedMethod);
  }

  if (normalizedMethod === 'POST' && matchesApiPath(normalizedPath, '/api/photos/upload')) return true;
  if (normalizedMethod === 'POST' && matchesApiPath(normalizedPath, '/api/bom/match')) return true;

  return REPORTER_MANAGE_API_PREFIXES.some((prefix) => matchesApiPath(normalizedPath, prefix));
}
