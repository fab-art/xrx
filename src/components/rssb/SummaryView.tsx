import { useMemo, useCallback } from 'react';
import { useSessionStore } from '@/store/session-store';
import { useCardHelpers } from './use-card-helpers';
import { useCountUpFormatted } from './use-count-up';
import { FIELD_DEFS } from '@/lib/rssb/config';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import { FileSpreadsheet, Calendar, Users, Building2, Stethoscope, Coins, AlertTriangle, UserX, Copy, TrendingUp, CheckCircle2, Search } from 'lucide-react';

const CHART_COLORS = ['#0f766e', '#c99a2e', '#b91c1c', '#0284c7', '#7c3aed', '#db2777', '#16a34a', '#ea580c'];

export function SummaryView() {
  const cards = useSessionStore(s => s.cards);
  const headers = useSessionStore(s => s.headers);
  const mapping = useSessionStore(s => s.mapping);
  const fileName = useSessionStore(s => s.fileName);
  const setStage = useSessionStore(s => s.setStage);
  const helpers = useCardHelpers();

  const stats = useMemo<{ totalAmount: number; amountCount: number; missingAmount: number; minDate: Date | null; maxDate: Date | null; patients: number; facilities: number; doctors: number }>(() => {
    let totalAmount = 0;
    let amountCount = 0;
    let missingAmount = 0;
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const c of cards) {
      const amt = helpers.originalAmount(c);
      if (amt !== null) {
        totalAmount += amt;
        amountCount += 1;
      } else {
        missingAmount += 1;
      }
      const dt = helpers.dateOf(c);
      if (dt) {
        if (!minDate || dt < minDate) minDate = dt;
        if (!maxDate || dt > maxDate) maxDate = dt;
      }
    }

    const patients = new Set<string>();
    const facilities = new Set<string>();
    const doctors = new Set<string>();
    cards.forEach(c => {
      const p = String(helpers.mappedValue(c, 'patient_name') || '').trim().toUpperCase();
      if (p) patients.add(p);
      const f = String(helpers.mappedValue(c, 'facility_name') || '').trim().toUpperCase();
      if (f) facilities.add(f);
      const d = String(helpers.mappedValue(c, 'doctor_name') || '').trim().toUpperCase();
      if (d) doctors.add(d);
    });

    return {
      totalAmount, amountCount, missingAmount, minDate, maxDate,
      patients: patients.size, facilities: facilities.size, doctors: doctors.size,
    };
  }, [cards, helpers]);

  // Chart data: vouchers per facility (top 8)
  const facilityData = useMemo(() => {
    const counts: Record<string, { count: number; total: number }> = {};
    cards.forEach(c => {
      const f = helpers.facilityOf(c) || 'Unknown';
      if (!counts[f]) counts[f] = { count: 0, total: 0 };
      counts[f].count += 1;
      counts[f].total += helpers.originalAmount(c) || 0;
    });
    return Object.entries(counts)
      .map(([name, v]) => ({ name, count: v.count, total: v.total }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [cards, helpers]);

  // Chart data: vouchers per day (timeline)
  const dailyData = useMemo(() => {
    const counts: Record<string, number> = {};
    cards.forEach(c => {
      const d = helpers.dateOf(c);
      if (d) {
        const key = d.toISOString().slice(0, 10);
        counts[key] = (counts[key] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [cards, helpers]);

  // Chart data: amount distribution buckets
  const amountBuckets = useMemo(() => {
    const buckets = [
      { name: '0–5k', min: 0, max: 5000, count: 0 },
      { name: '5k–10k', min: 5000, max: 10000, count: 0 },
      { name: '10k–25k', min: 10000, max: 25000, count: 0 },
      { name: '25k–50k', min: 25000, max: 50000, count: 0 },
      { name: '50k–100k', min: 50000, max: 100000, count: 0 },
      { name: '100k+', min: 100000, max: Infinity, count: 0 },
    ];
    cards.forEach(c => {
      const amt = helpers.originalAmount(c);
      if (amt === null) return;
      const b = buckets.find(b => amt >= b.min && amt < b.max);
      if (b) b.count += 1;
    });
    return buckets;
  }, [cards, helpers]);

  // Patient type breakdown
  const patientTypeData = useMemo(() => {
    const counts: Record<string, number> = {};
    cards.forEach(c => {
      const t = String(helpers.mappedValue(c, 'patient_type') || '').trim();
      if (t) counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [cards, helpers]);

  // Data quality insights — anomaly detections from the pharmacy data
  const dataInsights = useMemo(() => {
    type InsightTone = 'warn' | 'danger' | 'info';
    type Insight = {
      key: string;
      icon: React.ComponentType<{ className?: string }>;
      title: string;
      count: number;
      description: string;
      tone: InsightTone;
      targetStage: string;
    };

    // #1 Repeated patients + #6 Missing patient name
    const patientVoucherCounts: Record<string, number> = {};
    let missingPatientName = 0;
    cards.forEach(c => {
      const p = String(helpers.mappedValue(c, 'patient_name') || '').trim().toLowerCase();
      if (!p) {
        missingPatientName += 1;
        return;
      }
      patientVoucherCounts[p] = (patientVoucherCounts[p] || 0) + 1;
    });
    const repeatedPatients = Object.values(patientVoucherCounts).filter(n => n > 1).length;

    // #2 High-value vouchers + #3 Missing amounts + #8 Amount outliers
    const amounts: number[] = [];
    let highValueVouchers = 0;
    let missingAmounts = 0;
    cards.forEach(c => {
      const amt = helpers.originalAmount(c);
      if (amt === null) {
        missingAmounts += 1;
      } else {
        amounts.push(amt);
        if (amt > 40000) highValueVouchers += 1;
      }
    });
    let amountOutliers = 0;
    if (amounts.length > 0) {
      const sorted = [...amounts].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
      const threshold = median * 3;
      amountOutliers = amounts.filter(a => a > threshold).length;
    }

    // #4 Missing dates
    const missingDates = cards.filter(c => helpers.dateOf(c) === null).length;

    // #5 Missing facility
    const missingFacility = cards.filter(c => !helpers.facilityOf(c)).length;

    // #7 Duplicate voucher numbers
    const voucherCounts: Record<string, number> = {};
    cards.forEach(c => {
      const v = helpers.voucherOf(c);
      if (v) voucherCounts[v] = (voucherCounts[v] || 0) + 1;
    });
    const duplicateVoucherGroups = Object.values(voucherCounts).filter(n => n > 1).length;

    const insights: Insight[] = [
      { key: 'repeated-patients', icon: Users, title: 'Repeated patients', count: repeatedPatients, description: 'Patients appearing in more than one voucher', tone: 'info', targetStage: 'dashboard' },
      { key: 'high-value', icon: Coins, title: 'High-value vouchers', count: highValueVouchers, description: 'Vouchers with an amount above RWF 40,000', tone: 'warn', targetStage: 'dashboard' },
      { key: 'missing-amounts', icon: AlertTriangle, title: 'Missing amounts', count: missingAmounts, description: 'Vouchers without a readable amount', tone: 'danger', targetStage: 'clean' },
      { key: 'missing-dates', icon: Calendar, title: 'Missing dates', count: missingDates, description: 'Vouchers without a parseable date', tone: 'danger', targetStage: 'clean' },
      { key: 'missing-facility', icon: Building2, title: 'Missing facility', count: missingFacility, description: 'Vouchers without a facility name', tone: 'warn', targetStage: 'dashboard' },
      { key: 'missing-patient', icon: UserX, title: 'Missing patient name', count: missingPatientName, description: 'Vouchers without a patient name', tone: 'warn', targetStage: 'clean' },
      { key: 'duplicate-vouchers', icon: Copy, title: 'Duplicate voucher numbers', count: duplicateVoucherGroups, description: 'Voucher numbers reused across multiple records', tone: 'danger', targetStage: 'dashboard' },
      { key: 'amount-outliers', icon: TrendingUp, title: 'Amount outliers', count: amountOutliers, description: 'Vouchers exceeding 3× the median amount', tone: 'warn', targetStage: 'fraud' },
    ];
    return insights;
  }, [cards, helpers]);

  // Risk Score: (fraud_risk + orphan count) / total * 100
  const matchResults = useSessionStore(s => s.matchResults);
  const riskScore = useMemo(() => {
    if (cards.length === 0) return 0;
    const fraudRiskCount = matchResults
      ? Object.values(matchResults).filter(r => r.category === 'fraud_risk').length
      : cards.filter(c => c.classifications?.fraud).length;
    const orphanCount = matchResults
      ? Object.values(matchResults).filter(r => r.category === 'orphan').length
      : 0;
    return Math.round(((fraudRiskCount + orphanCount) / cards.length) * 1000) / 10; // one decimal
  }, [cards, matchResults]);

  // Data Completeness: percentage of vouchers with all required fields
  const dataCompleteness = useMemo(() => {
    if (cards.length === 0) return 0;
    let complete = 0;
    for (const c of cards) {
      const hasPatient = !!String(helpers.mappedValue(c, 'patient_name') || '').trim();
      const hasDate = !!helpers.dateOf(c);
      const hasAmount = helpers.originalAmount(c) !== null;
      const hasFacility = !!helpers.facilityOf(c);
      if (hasPatient && hasDate && hasAmount && hasFacility) complete++;
    }
    return Math.round((complete / cards.length) * 1000) / 10; // one decimal
  }, [cards, helpers]);

  // Risk level for badge coloring
  const riskColor = riskScore < 5 ? 'text-green-600 bg-green-100 border-green-300' : riskScore < 15 ? 'text-yellow-600 bg-yellow-100 border-yellow-300' : 'text-red-600 bg-red-100 border-red-300';
  const riskLabel = riskScore < 5 ? 'Low' : riskScore < 15 ? 'Medium' : 'High';

  // Animated values
  const animatedTotalAmount = useCountUpFormatted(stats.totalAmount, 1000);
  const animatedRiskScore = useCountUpFormatted(riskScore * 10, 800); // animate to value*10 then divide by 10 for 1 decimal
  const animatedCompleteness = useCountUpFormatted(dataCompleteness * 10, 800);

  // Bar click handler for drill-down
  const handleBarClick = useCallback((data: { name?: string }) => {
    if (data?.name) {
      // Store the facility name in sessionStorage and navigate to dashboard
      try {
        sessionStorage.setItem('rssb_drilldown_facility', data.name);
      } catch { /* ignore if sessionStorage unavailable */ }
      setStage('dashboard');
    }
  }, [setStage]);

  // Insight click handler
  const handleInsightClick = useCallback((targetStage: string) => {
    setStage(targetStage as 'dashboard' | 'clean' | 'fraud');
  }, [setStage]);

  // Risk badge for insights
  function getRiskBadge(key: string, count: number): { label: string; cls: string } {
    const thresholds: Record<string, [number, number]> = {
      'repeated-patients': [3, 10],
      'high-value': [5, 15],
      'missing-amounts': [3, 8],
      'missing-dates': [3, 8],
      'missing-facility': [3, 8],
      'missing-patient': [3, 8],
      'duplicate-vouchers': [2, 5],
      'amount-outliers': [2, 5],
    };
    const [medium, high] = thresholds[key] || [3, 8];
    if (count >= high) return { label: 'High', cls: 'bg-red-100 text-red-700 border-red-300' };
    if (count >= medium) return { label: 'Medium', cls: 'bg-yellow-100 text-yellow-700 border-yellow-300' };
    return { label: 'Low', cls: 'bg-green-100 text-green-700 border-green-300' };
  }

  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const unmappedFields = FIELD_DEFS.filter(f => !mapping[f.key]);
  const minDate: Date | null = stats.minDate;
  const maxDate: Date | null = stats.maxDate;
  const dateLabel = minDate && maxDate
    ? (minDate.toDateString() === maxDate.toDateString()
        ? minDate.toLocaleDateString()
        : `${minDate.toLocaleDateString()} – ${maxDate.toLocaleDateString()}`)
    : 'No dates detected yet';

  return (
    <div className="max-w-6xl">
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6 mb-5">
        <h2 className="text-base font-medium mb-1">File loaded: {fileName}</h2>
        <p className="text-sm text-muted-foreground">
          A quick look at what came in before you map columns or start reviewing. Interactive charts below
          are generated from the pharmacy data.
        </p>
      </div>

      {/* Key Metrics Highlight Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 kpi-enter">
        {/* Total Claim Value */}
        <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-transparent border-l-[3px] border-l-primary px-5 py-4 card-hover-lift">
          <p className="text-xs text-muted-foreground font-medium mb-1">Total Claim Value</p>
          <p className="text-3xl font-bold tabular-nums tracking-tight">
            RWF {animatedTotalAmount}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">{stats.amountCount} vouchers with amounts</p>
        </div>

        {/* Risk Score */}
        <div className="rounded-xl border border-border bg-gradient-to-br from-warn/5 to-transparent border-l-[3px] px-5 py-4 card-hover-lift" style={{ borderLeftColor: riskScore < 5 ? '#16a34a' : riskScore < 15 ? '#c99a2e' : '#b91c1c' }}>
          <div className="flex items-center gap-2 mb-1">
            <p className="text-xs text-muted-foreground font-medium">Risk Score</p>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${riskColor}`}>
              {riskLabel}
            </span>
          </div>
          <p className="text-3xl font-bold tabular-nums tracking-tight">
            {(Number(animatedRiskScore) / 10).toFixed(1)}%
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">Based on fraud risk &amp; orphan records</p>
        </div>

        {/* Data Completeness */}
        <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-transparent border-l-[3px] border-l-primary px-5 py-4 card-hover-lift">
          <p className="text-xs text-muted-foreground font-medium mb-1">Data Completeness</p>
          <p className="text-3xl font-bold tabular-nums tracking-tight">
            {(Number(animatedCompleteness) / 10).toFixed(1)}%
          </p>
          <div className="mt-2 w-full h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out"
              style={{
                width: `${dataCompleteness}%`,
                backgroundColor: dataCompleteness >= 80 ? '#16a34a' : dataCompleteness >= 50 ? '#c99a2e' : '#b91c1c',
              }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">Vouchers with all required fields</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={<FileSpreadsheet className="w-4 h-4" />} label="Vouchers" value={cards.length.toLocaleString()} />
        <StatCard icon={<FileSpreadsheet className="w-4 h-4" />} label="Columns detected" value={String(headers.length)} />
        <StatCard
          icon={<FileSpreadsheet className="w-4 h-4" />}
          label="Fields auto-mapped"
          value={`${mappedCount} / ${FIELD_DEFS.length}`}
          tone={mappedCount === FIELD_DEFS.length ? 'good' : unmappedFields.length > 4 ? 'warn' : 'default'}
        />
        <StatCard icon={<Calendar className="w-4 h-4" />} label="Date range" value={dateLabel} small />
        <StatCard icon={<Coins className="w-4 h-4" />} label="Total cost" value={stats.amountCount ? stats.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '—'} />
        <StatCard icon={<Users className="w-4 h-4" />} label="Unique patients" value={stats.patients.toLocaleString()} />
        <StatCard icon={<Building2 className="w-4 h-4" />} label="Unique facilities" value={stats.facilities.toLocaleString()} />
        <StatCard icon={<Stethoscope className="w-4 h-4" />} label="Unique doctors" value={stats.doctors.toLocaleString()} />
      </div>

      {stats.missingAmount > 0 && (
        <div className="rounded-xl border border-warn bg-warn-light text-warn-dark text-sm px-4 py-3 mb-5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {stats.missingAmount} voucher{stats.missingAmount === 1 ? '' : 's'} {stats.missingAmount === 1 ? 'has' : 'have'} no readable amount yet —
            this is normal if the amount column hasn&apos;t been mapped or cleaned yet.
          </span>
        </div>
      )}

      {/* Interactive charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ChartCard
          title="Vouchers per facility"
          subtitle={
            <span className="inline-flex items-center gap-1">
              Top 8 facilities by voucher count <Search className="w-3 h-3" aria-hidden="true" /> Click a bar to filter Dashboard by facility
            </span>
          }
        >
          {facilityData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={facilityData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" className="text-xs" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={120} className="text-xs" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, n: string) => n === 'count' ? [`${v} vouchers`, 'Count'] : [`RWF ${v.toLocaleString()}`, 'Total']}
                />
                <Bar dataKey="count" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} name="count" cursor="pointer" onClick={handleBarClick} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Vouchers over time" subtitle="Daily voucher count by visit date">
          {dailyData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dailyData} margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs" tick={{ fontSize: 10 }} />
                <YAxis className="text-xs" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="count" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Amount distribution" subtitle="Vouchers grouped by claim amount">
          {amountBuckets.every(b => b.count === 0) ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={amountBuckets} margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" className="text-xs" tick={{ fontSize: 11 }} />
                <YAxis className="text-xs" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Patient type breakdown" subtitle="Affiliation type distribution">
          {patientTypeData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={patientTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={45} label={(e: { name: string }) => e.name}>
                  {patientTypeData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Data quality insights */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold mb-3">Data quality insights</h2>
        {dataInsights.every(i => i.count === 0) ? (
          <div className="rounded-xl border border-primary bg-primary/10 text-primary p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">No anomalies detected — data looks clean.</p>
              <p className="text-xs opacity-80 mt-0.5">All eight quality checks passed for this dataset.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {dataInsights.filter(i => i.count > 0).map(insight => {
              const badge = getRiskBadge(insight.key, insight.count);
              return (
                <div
                  key={insight.key}
                  onClick={() => handleInsightClick(insight.targetStage)}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                >
                  <InsightCard insight={insight} badge={badge} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {unmappedFields.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 mb-5">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Couldn&apos;t confidently auto-map ({unmappedFields.length})
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {unmappedFields.map(f => (
              <span key={f.key} className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">{f.label}</span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">You&apos;ll be able to map these manually on the next screen.</p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4 mb-6">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Columns found in this file</h3>
        <div className="flex flex-wrap gap-1.5">
          {headers.map(h => (
            <span key={h} className="text-xs px-2 py-1 rounded-full bg-muted">{h}</span>
          ))}
        </div>
      </div>

      <button
        onClick={() => setStage('map')}
        className="bg-primary text-primary-foreground text-sm font-medium rounded-lg px-4 py-2 hover:bg-primary/90 transition-colors"
      >
        Continue to column mapping →
      </button>
    </div>
  );
}

function StatCard({ icon, label, value, tone = 'default', small }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'default' | 'good' | 'warn';
  small?: boolean;
}) {
  const toneClasses = {
    default: 'border-border bg-card',
    good: 'border-primary bg-primary/10 text-primary',
    warn: 'border-warn bg-warn-light text-warn-dark',
  }[tone];
  return (
    <div className={`rounded-xl border px-3.5 py-3 ${toneClasses}`}>
      <div className="flex items-center gap-1.5 text-[11px] opacity-80 mb-1">
        {icon}
        {label}
      </div>
      <div className={small ? 'text-sm font-medium' : 'text-lg font-medium'}>{value}</div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card hover:shadow-md transition-shadow overflow-hidden" role="img" aria-label={`Chart: ${title}${subtitle ? ` — ${typeof subtitle === 'string' ? subtitle : ''}` : ''}`}>
      <div className="bg-gradient-to-r from-primary/5 to-transparent px-4 pt-4 pb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      <div className="h-[3px] bg-primary/30 mx-4 mb-3 rounded-full" />
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}

function InsightCard({ insight, badge }: {
  insight: {
    icon: React.ComponentType<{ className?: string }>;
    title: string;
    count: number;
    description: string;
    tone: 'warn' | 'danger' | 'info';
  };
  badge: { label: string; cls: string };
}) {
  const Icon = insight.icon;
  const toneClasses = {
    warn: 'border-warn bg-warn-light text-warn-dark',
    danger: 'border-danger bg-danger-light text-danger-dark',
    info: 'border-border bg-card',
  }[insight.tone];
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${toneClasses}`}>
      <Icon className="w-5 h-5 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{insight.title}</h3>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${badge.cls}`}>
              {badge.label}
            </span>
          </div>
          <span className="text-lg font-semibold tabular-nums">{insight.count.toLocaleString()}</span>
        </div>
        <p className="text-xs opacity-80 mt-0.5">{insight.description}</p>
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
      No data available for this chart yet.
    </div>
  );
}
