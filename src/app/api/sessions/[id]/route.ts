import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { SessionState, Card } from '@/lib/rssb/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/sessions/[id] — full session including state blob
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await db.session.findUnique({ where: { id } });
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ session });
}

// PUT /api/sessions/[id] — update name and/or state
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof body.name === 'string') data.name = body.name;
  if (body.state) {
    const state = body.state as SessionState;
    const cards: Card[] = state.cards || [];
    data.state = JSON.stringify(state);
    data.fileName = state.fileName || '';
    data.pharmacyName = state.counterHeader?.pharmacyName || '';
    data.voucherCount = cards.length;
    data.verifiedCount = cards.filter(c => c.status === 'verified').length;
    data.fraudCount = cards.filter(c => c.classifications?.fraud).length;
    data.matchCount = state.matchResults ? Object.keys(state.matchResults).length : 0;
    data.stage = state.stage || 'summary';
  }

  const updated = await db.session.update({ where: { id }, data });
  return NextResponse.json({ session: updated });
}

// DELETE /api/sessions/[id] — remove a session (clears its memory)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await db.session.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
