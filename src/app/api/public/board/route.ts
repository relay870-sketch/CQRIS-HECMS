import { NextResponse } from 'next/server';
import { chinaDate, getPublicBoardData } from '@/lib/public-board';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedDate = searchParams.get('date') || chinaDate();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : chinaDate();
  const projectId = searchParams.get('projectId') || '';
  const response = NextResponse.json(getPublicBoardData(date, projectId));
  response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  return response;
}
