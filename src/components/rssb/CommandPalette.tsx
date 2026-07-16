'use client';

import { useEffect, useState } from 'react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from '@/components/ui/command';
import { useSessionStore } from '@/store/session-store';
import { useTheme } from '@/components/rssb/theme-provider';
import { TABS } from '@/lib/rssb/config';
import type { Stage } from '@/lib/rssb/types';
import {
  LayoutDashboard,
  Columns3,
  Sparkles,
  CheckCircle2,
  BarChart3,
  PieChart,
  Hospital,
  GitCompareArrows,
  Network,
  ShieldAlert,
  FileCheck2,
  ScrollText,
  GitCompare,
  History,
  CheckCheck,
  Flag,
  SkipForward,
  SkipBack,
  Wand2,
  FileText,
  FileDown,
  Table2,
  Plus,
  FolderOpen,
  Sun,
  Moon,
  Search,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Command {
  id: string;
  label: string;
  icon: React.ElementType;
  shortcut?: string;
  action: () => void;
}

/* ------------------------------------------------------------------ */
/*  Icon map for navigate commands                                     */
/* ------------------------------------------------------------------ */

const STAGE_ICONS: Record<string, React.ElementType> = {
  sessions: History,
  summary: LayoutDashboard,
  map: Columns3,
  clean: Sparkles,
  verify: CheckCircle2,
  dashboard: BarChart3,
  analytics: PieChart,
  hospital: Hospital,
  match: GitCompareArrows,
  network: Network,
  fraud: ShieldAlert,
  counter: FileCheck2,
  audit: ScrollText,
  compare: GitCompare,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const stage = useSessionStore(s => s.stage);
  const cards = useSessionStore(s => s.cards);
  const currentIndex = useSessionStore(s => s.currentIndex);
  const setStage = useSessionStore(s => s.setStage);
  const setCards = useSessionStore(s => s.setCards);
  const updateCard = useSessionStore(s => s.updateCard);
  const setCurrentIndex = useSessionStore(s => s.setCurrentIndex);
  const resetWorkingState = useSessionStore(s => s.resetWorkingState);
  const { theme, toggle } = useTheme();

  /* ---------- Detect platform ---------- */
  useEffect(() => {
    setIsMac(/Mac|iPhone/.test(navigator.userAgent));
  }, []);

  /* ---------- Ctrl+K / Cmd+K shortcut ---------- */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  /* ---------- Navigate commands ---------- */
  const navigateCommands: Command[] = TABS.filter(
    ([key]) => key !== stage,
  ).map(([key, label]) => ({
    id: `nav-${key}`,
    label: `Go to ${label}`,
    icon: STAGE_ICONS[key] || LayoutDashboard,
    shortcut: undefined,
    action: () => {
      setStage(key as Stage);
      setOpen(false);
    },
  }));

  /* ---------- Action commands ---------- */
  const actionCommands: Command[] = [
    {
      id: 'action-verify-all-filtered',
      label: 'Verify all filtered vouchers',
      icon: CheckCheck,
      action: () => {
        const updated = cards.map(c =>
          c.status !== 'verified' ? { ...c, status: 'verified' as const } : c,
        );
        setCards(updated);
        setOpen(false);
      },
    },
    {
      id: 'action-toggle-fraud',
      label: 'Toggle fraud flag (current voucher)',
      icon: Flag,
      shortcut: 'F',
      action: () => {
        const card = cards[currentIndex];
        if (card) {
          updateCard(card.id, {
            classifications: {
              ...(card.classifications || { pharma: false, rssb: false, fraud: false }),
              fraud: !(card.classifications?.fraud),
            },
          });
        }
        setOpen(false);
      },
    },
    {
      id: 'action-next-pending',
      label: 'Next pending voucher',
      icon: SkipForward,
      shortcut: 'N',
      action: () => {
        const nextIdx = cards.findIndex(
          (c, i) => i > currentIndex && c.status === 'pending',
        );
        if (nextIdx !== -1) setCurrentIndex(nextIdx);
        setOpen(false);
      },
    },
    {
      id: 'action-prev-voucher',
      label: 'Previous voucher',
      icon: SkipBack,
      shortcut: '←',
      action: () => {
        if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
        setOpen(false);
      },
    },
    {
      id: 'action-next-voucher',
      label: 'Next voucher',
      icon: SkipForward,
      shortcut: '→',
      action: () => {
        if (currentIndex < cards.length - 1) setCurrentIndex(currentIndex + 1);
        setOpen(false);
      },
    },
    {
      id: 'action-run-cleaning',
      label: 'Run data cleaning',
      icon: Wand2,
      action: () => {
        setStage('clean');
        setOpen(false);
      },
    },
    {
      id: 'action-counter-report',
      label: 'Generate counter report',
      icon: FileText,
      action: () => {
        setStage('counter');
        setOpen(false);
      },
    },
    {
      id: 'action-fraud-report',
      label: 'Generate fraud report',
      icon: FileText,
      action: () => {
        setStage('fraud');
        setOpen(false);
      },
    },
    {
      id: 'action-export-filtered',
      label: 'Export filtered vouchers',
      icon: FileDown,
      action: () => {
        setStage('dashboard');
        setOpen(false);
      },
    },
    {
      id: 'action-export-all',
      label: 'Export all vouchers',
      icon: FileDown,
      action: () => {
        setStage('dashboard');
        setOpen(false);
      },
    },
    {
      id: 'action-export-csv',
      label: 'Export as CSV',
      icon: Table2,
      action: () => {
        setStage('dashboard');
        setOpen(false);
      },
    },
  ];

  /* ---------- Session commands ---------- */
  const sessionCommands: Command[] = [
    {
      id: 'session-new',
      label: 'New session',
      icon: Plus,
      action: () => {
        resetWorkingState();
        setOpen(false);
      },
    },
    {
      id: 'session-manage',
      label: 'Manage sessions',
      icon: FolderOpen,
      action: () => {
        setStage('sessions');
        setOpen(false);
      },
    },
    {
      id: 'session-toggle-theme',
      label: `Switch to ${theme === 'light' ? 'dark' : 'light'} mode`,
      icon: theme === 'light' ? Moon : Sun,
      shortcut: undefined,
      action: () => {
        toggle();
        setOpen(false);
      },
    },
  ];

  /* ---------- Render helper ---------- */
  const renderCommand = (cmd: Command) => (
    <CommandItem
      key={cmd.id}
      value={cmd.label}
      onSelect={cmd.action}
      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer rounded-lg aria-selected:bg-primary/10 aria-selected:text-primary"
    >
      <cmd.icon className="w-4 h-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 text-sm truncate">{cmd.label}</span>
      {cmd.shortcut && (
        <CommandShortcut className="text-xs font-mono">
          {cmd.shortcut}
        </CommandShortcut>
      )}
    </CommandItem>
  );

  return (
    <>
      {/* Floating trigger button — shows keyboard hint */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Command palette (Ctrl+K)"
        aria-label="Open command palette"
        className="fixed bottom-4 right-[4.5rem] z-40 h-11 px-3 rounded-full bg-card border border-border text-muted-foreground shadow-md hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-2 text-xs focus-ring"
      >
        <Search className="w-4 h-4" />
        <kbd className="hidden sm:inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
          {isMac ? '⌘' : 'Ctrl'}K
        </kbd>
      </button>

      {/* Command dialog */}
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Command Palette"
        description="Search for a command to run..."
        className="sm:max-w-lg"
      >
        <CommandInput placeholder="Type a command or search..." />
        <CommandList className="max-h-[50vh]">
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Navigate">
            {navigateCommands.map(renderCommand)}
          </CommandGroup>

          <CommandGroup heading="Actions">
            {actionCommands.map(renderCommand)}
          </CommandGroup>

          <CommandGroup heading="Session">
            {sessionCommands.map(renderCommand)}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
