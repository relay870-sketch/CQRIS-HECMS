export interface AttendanceWorkItem {
  attendance: 'full' | 'half' | 'none';
  overtimeHours: number;
  workers: string[];
}

export function buildDailyAttendance(items: AttendanceWorkItem[]) {
  const result = new Map<string, { attendance: 'full' | 'half'; overtimeHours: number }>();
  for (const item of items) {
    if (item.attendance === 'none') continue;
    for (const workerId of item.workers) {
      const current = result.get(workerId);
      result.set(workerId, {
        attendance: current?.attendance === 'full' || item.attendance === 'full' ? 'full' : 'half',
        overtimeHours: Math.max(current?.overtimeHours || 0, item.overtimeHours),
      });
    }
  }
  return result;
}

export function calculateRevertedQuantity(currentQuantity: number, reportQuantity: number): number {
  return Math.max(0, currentQuantity - Math.max(0, reportQuantity));
}
