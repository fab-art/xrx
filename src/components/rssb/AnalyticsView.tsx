import { useMemo } from 'react';
import { useSessionStore } from '@/store/session-store';
import { useCardHelpers } from './use-card-helpers';
import { CATEGORY_LABELS } from '@/lib/rssb/matching';
import { CLASSIFICATION_DEFS, MATCH_CATEGORIES } from '@/lib/rssb/config';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area, RadialBarChart, RadialBar,
  LineChart, Line, ComposedChart,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, Users, ShieldAlert, CheckCircle2,
  Activity, Building2, Stethoscope, AlertCircle, GitCompare, type LucideIcon,
} from 'lucide-react';
import type { MatchCategory } from '@/lib/rssb/types';

const CHART_COLORS = ['#0f766e', '#c99a2e', '#b91c1c', '#7c3aed', '#db2777', '#16a34a', '#ea580c', '#0284c7'];

export function AnalyticsView() {
  const cards = useSessionStore(s => s.cards);
  const matchResults = useSessionStore(s => s.matchResults);
  const matchOverrides = useSessionStore(s => s.matchOverrides);
  const helpers = useCardHelpers();

  const data = useMemo(() => {
    const total = cards.length;
    const verified = cards.filter(c => c.status === 'verified').length;
    const pending = total - verified;
    const fraudFlagged = cards.filter(c => c.classifications?.fraud).length;
    const pharmaFlagged = cards.filter(c => c.classifications?.pharma).length;
    const rssbFlagged = cards.filter(c => c.classifications?.rssb).length;
    const totalOriginal = cards.reduce((s, c) => s + (helpers.originalAmount(c) || 0), 0);
    const totalDeducted = cards.reduce((s, c) => s + (parseFloat(String(c.deduction)) || 0), 0);
    const totalApproved = totalOriginal - totalDeducted;

    // Match category counts
    const matchCounts: Record<MatchCategory, number> = { clean: 0, review: 0, fraud_risk: 0, orphan: 0 };
    if (matchResults) {
      cards.forEach(c => {
        const cat = matchOverrides[c.id] || matchResults[c.id]?.category;
        if (cat) matchCounts[cat] += 1;
      });
    }

    // Amount by facility (top 10)
    const facilityAmounts: Record<string, { count: number; total: number; approved: number }> = {};
    cards.forEach(c => {
      const f = helpers.facilityOf(c) || 'Unknown';
      if (!facilityAmounts[f]) facilityAmounts[f] = { count: 0, total: 0, approved: 0 };
      facilityAmounts[f].count += 1;
      facilityAmounts[f].total += helpers.originalAmount(c) || 0;
      facilityAmounts[f].approved += helpers.approvedAmount(c) || 0;
    });
    const topFacilities = Object.entries(facilityAmounts)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Daily amount trend
    const dailyAmounts: Record<string, { count: number; total: number }> = {};
    cards.forEach(c => {
      const d = helpers.dateOf(c);
      if (d) {
        const key = d.toISOString().slice(0, 10);
        if (!dailyAmounts[key]) dailyAmounts[key] = { count: 0, total: 0 };
        dailyAmounts[key].count += 1;
        dailyAmounts[key].total += helpers.originalAmount(c) || 0;
      }
    });
    const dailyTrend = Object.entries(dailyAmounts)
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Amount distribution
    const buckets = [
      { name: '0–5k', min: 0, max: 5000, count: 0, total: 0 },
      { name: '5k–10k', min: 5000, max: 10000, count: 0, total: 0 },
      { name: '10k–25k', min: 10000, max: 25000, count: 0, total: 0 },
      { name: '25k–50k', min: 25000, max: 50000, count: 0, total: 0 },
      { name: '50k–100k', min: 50000, max: 100000, count: 0, total: 0 },
      { name: '100k+', min: 100000, max: Infinity, count: 0, total: 0 },
    ];
    cards.forEach(c => {
      const amt = helpers.originalAmount(c);
      if (amt === null) return;
      const b = buckets.find(b => amt >= b.min && amt < b.max);
      if (b) { b.count += 1; b.total += amt; }
    });

    // Top doctors by voucher count
    const doctorCounts: Record<string, { count: number; total: number }> = {};
    cards.forEach(c => {
      const d = helpers.doctorOf(c);
      if (d) {
        if (!doctorCounts[d]) doctorCounts[d] = { count: 0, total: 0 };
        doctorCounts[d].count += 1;
        doctorCounts[d].total += helpers.originalAmount(c) || 0;
      }
    });
    const topDoctors = Object.entries(doctorCounts)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Classification breakdown
    const classificationData = [
      { name: 'Pharmacological', value: pharmaFlagged, color: CHART_COLORS[0] },
      { name: 'RSSB Rules', value: rssbFlagged, color: CHART_COLORS[1] },
      { name: 'Fraud Activity', value: fraudFlagged, color: CHART_COLORS[2] },
      { name: 'Clean', value: total - pharmaFlagged - rssbFlagged - fraudFlagged, color: CHART_COLORS[5] },
    ].filter(d => d.value > 0);

    // Match category data
    const matchData = MATCH_CATEGORIES.map(cat => ({
      name: CATEGORY_LABELS[cat],
      value: matchCounts[cat],
      color: cat === 'clean' ? CHART_COLORS[0] : cat === 'review' ? CHART_COLORS[1] : cat === 'fraud_risk' ? CHART_COLORS[2] : CHART_COLORS[3],
    })).filter(d => d.value > 0);

    return {
      total, verified, pending, fraudFlagged, pharmaFlagged, rssbFlagged,
      totalOriginal, totalDeducted, totalApproved,
      matchCounts, topFacilities, dailyTrend, buckets, topDoctors,
      classificationData, matchData,
      avgVoucher: total ? totalOriginal / total : 0,
      verificationRate: total ? (verified / total) * 100 : 0,
      deductionRate: totalOriginal ? (totalDeducted / totalOriginal) * 100 : 0,
    };
  }, [cards, helpers, matchResults, matchOverrides]);

  if (!cards.length) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
        <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No data to analyze yet. Upload a pharmacy file to see analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard icon={DollarSign} label="Total Claims" value={`RWF ${data.totalOriginal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color="primary" />
        <KPICard icon={CheckCircle2} label="Approved" value={`RWF ${data.totalApproved.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color="primary" />
        <KPICard icon={TrendingDown} label="Deducted" value={`RWF ${data.totalDeducted.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} color="danger" />
        <KPICard icon={Users} label="Avg / Voucher" value={`RWF ${Math.round(data.avgVoucher).toLocaleString()}`} color="gold" />
        <KPICard icon={CheckCircle2} label="Verification" value={`${data.verificationRate.toFixed(1)}%`} color="primary" />
        <KPICard icon={ShieldAlert} label="Deduction Rate" value={`${data.deductionRate.toFixed(1)}%`} color="danger" />
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Claims by Facility" subtitle="Top 10 facilities by total claim amount" icon={Building2}>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={data.topFacilities} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" className="text-xs" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={130} className="text-xs" tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => `RWF ${v.toLocaleString()}`}
              />
              <Bar dataKey="total" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} name="Total" />
              <Bar dataKey="approved" fill={CHART_COLORS[5]} radius={[0, 4, 4, 0]} name="Approved" />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Daily Claim Trend" subtitle="Voucher count and total amount over time" icon={TrendingUp}>
          {data.dailyTrend.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data.dailyTrend} margin={{ left: 0, right: 20 }}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS[0]} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={CHART_COLORS[0]} stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 10 }} />
                <YAxis className="text-xs" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke={CHART_COLORS[0]} fill="url(#colorCount)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Amount Distribution" subtitle="Voucher count and total by amount range" icon={Activity}>
          {data.buckets.every(b => b.count === 0) ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.buckets} margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" className="text-xs" tick={{ fontSize: 11 }} />
                <YAxis className="text-xs" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} name="Vouchers" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Top Practitioners" subtitle="By voucher count" icon={Stethoscope}>
          {data.topDoctors.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.topDoctors} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" className="text-xs" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={140} className="text-xs" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill={CHART_COLORS[4]} radius={[0, 4, 4, 0]} name="Vouchers" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Classification Breakdown" subtitle="Deduction categories across all vouchers" icon={AlertCircle}>
          {data.classificationData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={data.classificationData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e: { name: string; value: number }) => `${e.name}: ${e.value}`}>
                  {data.classificationData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {data.matchData.length > 0 && (
          <ChartCard title="Match Results" subtitle="Hospital matching outcome distribution" icon={GitCompare}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={data.matchData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e: { name: string; value: number }) => `${e.name}: ${e.value}`}>
                  {data.matchData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        )}
      </div>

      {/* Verification progress */}
      <ChartCard title="Verification Progress" subtitle={`${data.verified} of ${data.total} vouchers verified`} icon={CheckCircle2}>
        <div className="flex items-center gap-6">
          <ResponsiveContainer width="50%" height={200}>
            <RadialBarChart innerRadius="60%" outerRadius="100%" data={[{ name: 'Verified', value: data.verificationRate, fill: CHART_COLORS[0] }]} startAngle={90} endAngle={-270}>
              <RadialBar background dataKey="value" cornerRadius={10} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-3">
            <ProgressRow label="Verified" value={data.verified} total={data.total} color="bg-primary" />
            <ProgressRow label="Pending" value={data.pending} total={data.total} color="bg-warn" />
            <ProgressRow label="Fraud flagged" value={data.fraudFlagged} total={data.total} color="bg-danger" />
            <ProgressRow label="Pharmacological" value={data.pharmaFlagged} total={data.total} color="bg-chart-4" />
            <ProgressRow label="RSSB Rules" value={data.rssbFlagged} total={data.total} color="bg-chart-5" />
          </div>
        </div>
      </ChartCard>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, color }: { icon: LucideIcon; label: string; value: string; color: 'primary' | 'danger' | 'gold' }) {
  const colorClasses = {
    primary: 'border-primary/30 bg-primary/5 text-primary',
    danger: 'border-danger/30 bg-danger/5 text-danger',
    gold: 'border-gold/30 bg-gold/5 text-gold-dark',
  }[color];
  return (
    <div className={`rounded-xl border p-4 ${colorClasses}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" />
        <span className="text-[11px] font-medium opacity-80">{label}</span>
      </div>
      <div className="text-base font-bold text-foreground">{value}</div>
    </div>
  );
}

function ChartCard({ title, subtitle, icon: Icon, children }: { title: string; subtitle?: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow" role="img" aria-label={`Chart: ${title}${subtitle ? ` — ${subtitle}` : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

function ProgressRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value} ({pct.toFixed(0)}%)</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
      No data available for this chart.
    </div>
  );
}
