import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { HelpCircle, X } from 'lucide-react';

const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: '\u2190 / \u2192', description: 'Previous / Next voucher (Verify view)' },
  { keys: 'V', description: 'Toggle verified status (Verify view)' },
  { keys: 'F', description: 'Toggle fraud flag (Verify view)' },
  { keys: 'N', description: 'Jump to next pending voucher (Verify view)' },
  { keys: 'Ctrl+K', description: 'Open command palette' },
  { keys: '?', description: 'Open this help' },
  { keys: 'Esc', description: 'Close dialogs' },
];

const WORKFLOW: { name: string; description: string }[] = [
  { name: 'Summary', description: 'Overview stats and data quality insights' },
  { name: 'Map columns', description: 'Auto-detect and map Excel columns to fields' },
  { name: 'Clean Data', description: 'Standardize and clean field values' },
  { name: 'Verify', description: 'Review each voucher, apply deductions, flag fraud' },
  { name: 'Dashboard', description: 'Filtered table view with bulk actions and exports' },
  { name: 'Analytics', description: 'KPIs and interactive charts' },
  { name: 'Hospital Data', description: 'Cross-reference with hospital files' },
  { name: 'Match Review', description: 'Compare pharmacy claims with hospital records' },
  { name: 'Network Analysis', description: 'Visualize patient-practitioner-facility relationships' },
  { name: 'Fraud review', description: 'Review fraud-flagged vouchers with evidence' },
  { name: 'Counter verification', description: 'Generate RSSB counter verification reports' },
  { name: 'Sessions', description: 'Manage saved sessions (reload, delete, export, import)' },
];

const TIPS: string[] = [
  'Your work is saved automatically as you go.',
  'Use the Sessions dashboard to reload or export your work.',
  'Filtered Excel exports preserve only the vouchers matching your current filters.',
  'The Counter Verification report preview can be printed or saved as PDF.',
];

export function HelpButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ignore when modifier keys are held
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Ignore when focus is inside an input/textarea/select or contenteditable
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (e.key === '?') {
        e.preventDefault();
        setOpen(o => !o);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Help (?)"
        aria-label="Help (?)"
        className="fixed bottom-4 right-4 z-40 w-11 h-11 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors flex items-center justify-center focus-ring"
      >
        <HelpCircle className="w-5 h-5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Help &amp; Keyboard Shortcuts</DialogTitle>
          </DialogHeader>

          {/* Section 1 — Keyboard shortcuts */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Keyboard shortcuts</h3>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-xs">
                <tbody>
                  {SHORTCUTS.map(row => (
                    <tr key={row.keys} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 align-top w-1/3">
                        <kbd className="inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                          {row.keys}
                        </kbd>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{row.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Section 2 — Workflow */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Workflow</h3>
            <ol className="space-y-1.5">
              {WORKFLOW.map((step, i) => (
                <li key={step.name} className="flex gap-2 text-xs">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">
                    <span className="font-medium text-foreground">{step.name}</span>
                    {' \u2014 '}
                    {step.description}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {/* Section 3 — Tips */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Tips</h3>
            <ul className="space-y-1.5 list-disc pl-5">
              {TIPS.map(tip => (
                <li key={tip} className="text-xs text-muted-foreground">{tip}</li>
              ))}
            </ul>
          </section>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <X className="w-4 h-4" />
              Close
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
