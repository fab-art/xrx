'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

type Variant = 'ghost' | 'link' | 'solid' | 'outline';
type Size = 'sm' | 'md';

/**
 * Triggers a download of the full project source code as a ZIP archive.
 * Streams from /api/download-source (which uses `archiver`).
 *
 * Variants:
 *  - solid   → filled primary button (light-mode RAMA indigo / dark-mode Ishema orange)
 *  - outline → bordered button
 *  - ghost   → low-emphasis text button
 *  - link    → tiny inline link
 */
export function DownloadSourceButton({
  variant = 'outline',
  size = 'md',
  label = 'Download source',
  className = '',
}: {
  variant?: Variant;
  size?: Size;
  label?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<'idle' | 'preparing' | 'done' | 'error'>('idle');

  async function handleDownload() {
    if (status === 'preparing') return;
    setStatus('preparing');
    try {
      const res = await fetch('/api/download-source?name=rssb-cvs-src');
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rssb-cvs-src.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus('done');
      setTimeout(() => setStatus('idle'), 2500);
    } catch (err) {
      console.error('Source download failed:', err);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2500);
    }
  }

  const text =
    status === 'preparing' ? 'Preparing ZIP…' :
    status === 'done' ? 'Downloaded' :
    status === 'error' ? 'Failed — retry' :
    label;

  const sizeCls = size === 'sm' ? 'text-xs px-2.5 py-1.5 gap-1.5' : 'text-sm px-4 py-2.5 gap-2';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  let variantCls = '';
  if (variant === 'solid') {
    variantCls = 'bg-primary text-primary-foreground hover:bg-primary/90 border border-primary';
  } else if (variant === 'outline') {
    variantCls = 'border border-border bg-card hover:bg-accent';
  } else if (variant === 'ghost') {
    variantCls = 'text-muted-foreground hover:text-foreground hover:bg-accent';
  } else {
    // link
    variantCls = 'text-primary hover:underline underline-offset-2';
  }

  return (
    <button
      onClick={handleDownload}
      disabled={status === 'preparing'}
      title="Download a ZIP of the full project source code"
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:opacity-60 ${sizeCls} ${variantCls} ${className}`}
    >
      {status === 'preparing' ? <Loader2 className={`${iconSize} animate-spin`} /> : <Download className={iconSize} />}
      <span>{text}</span>
    </button>
  );
}
