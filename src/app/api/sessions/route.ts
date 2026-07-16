import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { SessionState, Card } from '@/lib/rssb/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function deriveMeta(state: SessionState) {
  const cards: Card[] = state.cards || [];
  return {
    voucherCount: cards.length,
    verifiedCount: cards.filter(c => c.status === 'verified').length,
    fraudCount: cards.filter(c => c.classifications?.fraud).length,
    matchCount: state.matchResults ? Object.keys(state.matchResults).length : 0,
    pharmacyName: state.counterHeader?.pharmacyName || '',
    stage: state.stage || 'summary',
  };
}

// GET /api/sessions — list all sessions (metadata only, no state blob)
export async function GET() {
  const sessions = await db.session.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, name: true, fileName: true, pharmacyName: true,
      voucherCount: true, verifiedCount: true, fraudCount: true, matchCount: true,
      stage: true, createdAt: true, updatedAt: true,
    },
  });
  return NextResponse.json({ sessions });
}

// POST /api/sessions — create or upsert a session from a state object
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !body.state) {
    return NextResponse.json({ error: 'Missing state' }, { status: 400 });
  }
  const state = body.state as SessionState;
  const name = body.name || state.fileName || 'Untitled session';
  const fileName = state.fileName || '';
  const meta = deriveMeta(state);

  let id = body.id as string | undefined;

  if (id) {
    // Update existing
    const updated = await db.session.update({
      where: { id },
      data: {
        name,
        fileName,
        state: JSON.stringify(state),
        ...meta,
      },
    });
    return NextResponse.json({ session: updated });
  }

  // Create new
  const created = await db.session.create({
    data: {
      name,
      fileName,
      state: JSON.stringify(state),
      ...meta,
    },
  });
  return NextResponse.json({ session: created });
}
