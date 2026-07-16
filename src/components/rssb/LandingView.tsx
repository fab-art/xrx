'use client';

import { useSessionStore } from '@/store/session-store';
import { useTheme } from './theme-provider';
import { RssbLogo } from './RssbLogo';
import {
  Moon, Sun, History, Upload as UploadIcon,
  Columns3, ShieldAlert, Building2, BarChart3, FileCheck, ArrowRight,
  CheckCircle2, FileSpreadsheet, ClipboardList, ShieldCheck, Pill, Shield,
  Search, FilePlus2, type LucideIcon,
} from 'lucide-react';
import { DownloadSourceButton } from './DownloadSourceButton';

const FEATURES: { icon: LucideIcon; title: string; desc: string; badge?: string; stat?: string }[] = [
  { icon: Columns3, title: 'Smart column mapping', desc: 'Auto-detect and map Excel columns to fields', stat: 'Auto-map' },
  { icon: ShieldAlert, title: 'Fraud detection', desc: 'Flag suspicious vouchers and generate fraud reports', stat: 'Real-time' },
  { icon: Building2, title: 'Hospital matching', desc: 'Cross-reference pharmacy claims with hospital data', stat: 'Cross-ref' },
  { icon: BarChart3, title: 'Interactive analytics', desc: 'Visualize claim patterns and deductions', badge: 'NEW', stat: '6 charts' },
  { icon: FileCheck, title: 'Counter verification', desc: 'Generate RSSB counter verification reports', stat: '3 reports' },
  { icon: ClipboardList, title: 'Audit log', desc: 'Track all verification actions and changes', badge: 'NEW', stat: 'Full trail' },
];

// The three Ishema-style steps — Review / Verify / Report
const STEPS: { num: string; icon: LucideIcon; title: string; desc: string }[] = [
  { num: '01', icon: Search, title: 'Review', desc: 'Upload pharmacy voucher files. Columns auto-map, data is cleaned, and every record is ready for inspection.' },
  { num: '02', icon: ShieldCheck, title: 'Verify', desc: 'Review each voucher, apply deductions, flag fraud, and cross-reference against hospital admission records.' },
  { num: '03', icon: FileSpreadsheet, title: 'Report', desc: 'Generate counter verification, anti-fraud and comparison Excel reports — signed, audited and export-ready.' },
];

export function LandingView() {
  const setStage = useSessionStore(s => s.setStage);
  const refreshSessions = useSessionStore(s => s.refreshSessions);
  const { theme, toggle } = useTheme();
  return (
    <div className="ishema-root ishema-grid flex flex-col">
      {/* Top nav */}
      <header className="relative z-20 flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-10 py-4">
        <div className="flex items-center gap-3">
          <RssbLogo size={44} />
          <div className="leading-tight">
            <div className="text-white font-bold text-sm tracking-tight">RSSB</div>
            <div className="text-[11px] text-slate-400">Counter Verification</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="ishema-pill hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 badge-pulse" />
            v1.0 · Live
          </span>
          <button
            onClick={toggle}
            className="ishema-cta-ghost text-sm rounded-lg px-3 py-1.5 inline-flex items-center gap-2"
            aria-label="Toggle theme"
          >
            {theme === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span className="hidden sm:inline">{theme === 'light' ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </header>

      {/* Hero — 2-column split matching the Ishema reference */}
      <section className="relative flex-1 px-4 sm:px-6 lg:px-10 py-8 lg:py-14 overflow-hidden">
        {/* Floating decorative orbs */}
        <div className="ishema-orb ishema-orb-1" />
        <div className="ishema-orb ishema-orb-2" />

        <div className="relative z-10 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          {/* LEFT — copy + steps */}
          <div className="relative">
            {/* Orange vertical accent line (signature Ishema element) */}
            <div className="ishema-accent-line hidden lg:block" />

            <div className="lg:pl-8">
              {/* Orange tagline */}
              <div className="ishema-rise inline-flex items-center gap-2 mb-5">
                <span className="ishema-pill text-[11px] font-bold uppercase tracking-[0.18em] rounded-full px-3 py-1.5">
                  Next Generation Verification Engine
                </span>
              </div>

              {/* Big headline */}
              <h1 className="ishema-rise ishema-rise-2 text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight mb-4">
                <span className="ishema-headline">How RSSB</span>
                <br />
                <span className="text-white">Works</span>
              </h1>

              <p className="ishema-rise ishema-rise-3 text-slate-300 text-base sm:text-lg leading-relaxed mb-8 max-w-xl">
                Prepare, verify and audit pharmacy voucher claims — map columns, review vouchers,
                flag fraud and generate Anti-Fraud &amp; Counter Verification reports for the
                Rwanda Social Security Board.
              </p>

              {/* Three steps with the orange accent line */}
              <div className="space-y-5 mb-9">
                {STEPS.map((step, idx) => {
                  const StepIcon = step.icon;
                  return (
                    <div
                      key={step.num}
                      className={`ishema-rise ishema-rise-${idx + 2} flex items-start gap-4`}
                    >
                      <div className="ishema-step-num">{step.num}</div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <StepIcon className="w-4 h-4 text-orange-400" />
                          <h3 className="text-white font-semibold text-base">{step.title}</h3>
                        </div>
                        <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* CTAs */}
              <div className="ishema-rise ishema-rise-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <button
                  onClick={() => setStage('upload')}
                  className="ishema-cta inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm"
                >
                  <UploadIcon className="w-4 h-4" />
                  Upload pharmacy file
                  <ArrowRight className="w-4 h-4 cta-arrow-bounce" />
                </button>
                <button
                  onClick={() => { refreshSessions(); setStage('sessions'); }}
                  className="ishema-cta-ghost inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-medium"
                >
                  <History className="w-4 h-4" />
                  Open saved sessions
                </button>
                <DownloadSourceButton variant="ghost" size="md" label="Download source" className="px-6 py-3 ishema-cta-ghost" />
              </div>

              {/* Trust row */}
              <div className="ishema-rise ishema-rise-4 flex flex-wrap items-center gap-4 mt-7 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-orange-400" /> Built for RSSB
                </span>
                <span className="w-1 h-1 rounded-full bg-slate-600" />
                <span className="flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-orange-400" /> 141+ vouchers processed
                </span>
                <span className="w-1 h-1 rounded-full bg-slate-600" />
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-orange-400" /> Fraud detection built-in
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT — software mockup */}
          <div className="ishema-rise ishema-rise-3 relative">
            <SoftwareMockup />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative px-4 sm:px-6 lg:px-10 py-14 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <span className="ishema-pill text-[11px] font-bold uppercase tracking-[0.18em] rounded-full px-3 py-1.5">
              Capabilities
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mt-3 mb-2">
              Everything you need to verify claims
            </h2>
            <p className="text-slate-400 text-sm">Six core capabilities in one workflow</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc, badge, stat }) => (
              <div
                key={title}
                className="ishema-card feature-card p-5 group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-orange-500/10 text-orange-400 feature-icon">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {stat && (
                      <span className="text-[10px] font-semibold text-orange-300/90 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full">
                        {stat}
                      </span>
                    )}
                    {badge && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full">
                        {badge}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-sm font-semibold text-white mb-1">{title}</div>
                <div className="text-xs text-slate-400 leading-relaxed">{desc}</div>
                <div className="feature-card-arrow mt-3 text-orange-400/60">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative px-4 sm:px-6 lg:px-10 py-8 border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-3 text-center">
          <div className="footer-icon-divider">
            <Pill className="w-3.5 h-3.5 text-orange-400/60" />
            <Shield className="w-3.5 h-3.5 text-orange-400/60" />
            <ShieldCheck className="w-3.5 h-3.5 text-orange-400/60" />
          </div>
          <p className="text-xs text-slate-400">
            RSSB Counter Verification System · Pharmacy claims verification &amp; fraud detection
          </p>
          <p className="text-[11px] text-slate-500">Built for Rwanda Social Security Board · Our Health, Our Future</p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-1">
            <p className="text-[11px] text-slate-600">v1.0.0 · PWA</p>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <DownloadSourceButton variant="link" size="sm" label="Download source" className="ishema-cta-ghost text-[11px]" />
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ===== Software mockup — a stylised white dashboard card ===== */
function SoftwareMockup() {
  return (
    <div className="ishema-mockup relative">
      {/* Animated scan line */}
      <div className="ishema-scan" />

      {/* Window bar */}
      <div className="ishema-mockup-bar flex items-center gap-2 px-4 py-2.5">
        <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
        <div className="flex-1 text-center text-[11px] font-semibold text-white/90 tracking-wide">
          RSSB CVS — Verification Dashboard
        </div>
        <span className="text-[10px] text-white/60">Alliance Pharmacy</span>
      </div>

      {/* Body */}
      <div className="p-4 bg-slate-50">
        {/* KPI row */}
        <div className="grid grid-cols-3 gap-2.5 mb-3">
          {[
            { label: 'Total', value: '141', tone: 'text-slate-800' },
            { label: 'Verified', value: '98', tone: 'text-indigo-600' },
            { label: 'Flagged', value: '7', tone: 'text-orange-600' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-lg border border-slate-200 p-2.5">
              <div className="text-[9px] text-slate-500 uppercase tracking-wide">{k.label}</div>
              <div className={`text-lg font-bold ${k.tone} tabular-nums leading-tight`}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Mini chart */}
        <div className="bg-white rounded-lg border border-slate-200 p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-semibold text-slate-700">Verification progress</div>
            <div className="text-[9px] text-slate-400">last 7 days</div>
          </div>
          <div className="flex items-end gap-1.5 h-16">
            {[40, 55, 48, 70, 62, 85, 95].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col justify-end">
                <div
                  className="rounded-t bg-gradient-to-t from-indigo-600 to-indigo-400"
                  style={{ height: `${h}%` }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Voucher rows */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-3 py-1.5 bg-slate-100 text-[9px] font-semibold text-slate-500 uppercase tracking-wide">
            <div className="col-span-5">Voucher</div>
            <div className="col-span-3">Amount</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2 text-right">Ded.</div>
          </div>
          {[
            { v: 'PHA-04412', a: 'RWF 12,500', s: 'OK', d: '0%', ok: true },
            { v: 'PHA-04413', a: 'RWF 8,200', s: 'Flag', d: '15%', ok: false },
            { v: 'PHA-04414', a: 'RWF 23,750', s: 'OK', d: '0%', ok: true },
            { v: 'PHA-04415', a: 'RWF 5,400', s: 'Flag', d: '40%', ok: false },
          ].map(r => (
            <div key={r.v} className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] border-t border-slate-100 items-center">
              <div className="col-span-5 font-medium text-slate-700 truncate">{r.v}</div>
              <div className="col-span-3 text-slate-600 tabular-nums">{r.a}</div>
              <div className="col-span-2">
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${r.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                  {r.s}
                </span>
              </div>
              <div className={`col-span-2 text-right tabular-nums font-semibold ${r.ok ? 'text-slate-400' : 'text-orange-600'}`}>{r.d}</div>
            </div>
          ))}
        </div>

        {/* Footer toolbar */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 badge-pulse" />
            Auto-saved · 2s ago
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-semibold text-white bg-indigo-600 rounded px-2 py-1">Export</span>
            <span className="text-[9px] font-semibold text-indigo-600 border border-indigo-200 rounded px-2 py-1">+ New</span>
          </div>
        </div>
      </div>
    </div>
  );
}
