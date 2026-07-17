import { useState } from 'react';
import { useSessionStore } from '@/store/session-store';
import { useCardHelpers } from './use-card-helpers';
import { autoMapHeaders, parseSpreadsheetFile } from '@/lib/rssb/fileParsing';
import { FIELD_DEFS } from '@/lib/rssb/config';
import { dispensingDateHint } from '@/lib/rssb/dataCleaning';
import { emptyClassifications } from '@/lib/rssb/config';
import { useTheme } from './theme-provider';
import { RssbLogo } from './RssbLogo';
import { Moon, Sun, Upload as UploadIcon, Loader2, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function UploadView() {
  const setStage = useSessionStore(s => s.setStage);
  const setFileName = useSessionStore(s => s.setFileName);
  const setHeaders = useSessionStore(s => s.setHeaders);
  const setMapping = useSessionStore(s => s.setMapping);
  const setCards = useSessionStore(s => s.setCards);
  const setAutoDetected = useSessionStore(s => s.setAutoDetected);
  const setCurrentIndex = useSessionStore(s => s.setCurrentIndex);
  const startNewSession = useSessionStore(s => s.startNewSession);
  const { theme, toggle } = useTheme();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function handleFile(file: File) {
    if (!file) return;
    setLoading(true);
    try {
      startNewSession(file.name);
      const { headers: hdrs, rows: json } = await parseSpreadsheetFile(file);
      if (!json.length) {
        toast({ title: 'Empty file', description: `"${file.name}" doesn't contain any data rows.`, variant: 'destructive' });
        setLoading(false);
        return;
      }
      const guessedMapping = autoMapHeaders(hdrs, FIELD_DEFS);
      const autoCount = Object.values(guessedMapping).filter(Boolean).length;
      const dispensingHeader = guessedMapping.dispensing_date;
      const newCards = json.map((row, i) => ({
        id: i,
        row,
        status: 'pending' as const,
        comment: '',
        deduction: 0,
        prescriptionDate: dispensingDateHint(row, dispensingHeader),
        facilityOverride: '',
        explanation: '',
        classifications: emptyClassifications(),
      }));
      setFileName(file.name);
      setHeaders(hdrs);
      setMapping(guessedMapping);
      setCards(newCards);
      setAutoDetected(autoCount);
      setCurrentIndex(0);
      setStage('summary');
      toast({ title: 'File loaded', description: `${json.length} vouchers from "${file.name}"` });
    } catch (err) {
      console.error(err);
      toast({ title: 'Could not read file', description: `Please make sure "${file.name}" is a valid Excel or CSV file.`, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  function onInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="rama-header flex items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center gap-3">
          <RssbLogo size={40} />
          <div className="text-left">
            <h1 className="text-lg font-semibold tracking-tight text-white">RSSB Counter Verification System</h1>
            <p className="text-xs text-white/70">Data preparation and verification dashboard</p>
          </div>
        </div>
        <button
          onClick={toggle}
          className="text-sm border border-white/20 rounded-lg px-3 py-1.5 bg-white/10 hover:bg-white/20 shrink-0 inline-flex items-center gap-2 text-white transition-colors"
        >
          {theme === 'light' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === 'light' ? 'Light' : 'Dark'}
        </button>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-2xl w-full">
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`rounded-2xl border-2 border-dashed py-16 px-6 text-center transition-colors ${
              dragOver ? 'border-primary bg-primary/5' : 'border-border bg-card'
            }`}
          >
            {loading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">Reading file…</p>
              </div>
            ) : (
              <>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={onInput} id="file-upload" className="sr-only" />
                <label htmlFor="file-upload" className="flex flex-col items-center gap-3 cursor-pointer">
                  <span className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                    dragOver ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
                  }`}>
                    <UploadIcon className="w-6 h-6" />
                  </span>
                  <span className="text-sm font-medium">Upload Excel or CSV file</span>
                  <span className="text-xs text-muted-foreground">.xlsx, .xls or .csv · drag &amp; drop or click to browse</span>
                </label>
              </>
            )}
          </div>

          <div className="mt-6 rounded-xl border border-border bg-card p-4">
            <h2 className="text-sm font-medium mb-2 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
              What happens next
            </h2>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>Auto-detect column mapping (voucher no, dates, names, amounts, etc.)</li>
              <li>Clean &amp; normalize data (dates, amounts, names, IDs)</li>
              <li>Review vouchers one by one or in the dashboard</li>
              <li>Optionally match against hospital beneficiary files</li>
              <li>Generate Anti Fraud &amp; Counter Verification Excel reports</li>
            </ol>
          </div>

          <button
            onClick={() => setStage('sessions')}
            className="mt-4 text-sm text-muted-foreground underline hover:text-foreground"
          >
            or open a previously saved session →
          </button>
        </div>
      </div>
    </div>
  );
}
