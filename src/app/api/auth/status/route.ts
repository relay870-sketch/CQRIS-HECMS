import { NextResponse } from 'next/server';
import { getDb, initDbWithSeed } from '@/lib/db';

initDbWithSeed();

export async function GET() {
  const admin = getDb().prepare("SELECT password_hash FROM accounts WHERE username = 'admin'").get() as { password_hash: string | null } | undefined;
  return NextResponse.json({ adminSetupRequired: !admin?.password_hash, registrationEnabled: true });
}
