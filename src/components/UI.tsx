import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Search,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../utils/format';

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
}: {
  title: string;
  subtitle?: string;
  breadcrumbs?: Array<{ label: string; to?: string }>;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="mb-1.5 flex items-center gap-1.5 text-xs text-[#252B29]/60">
            {breadcrumbs.map((bc, idx) => (
              <React.Fragment key={bc.label}>
                {idx > 0 && <span>/</span>}
                {bc.to ? (
                  <Link to={bc.to} className="hover:text-[#183D32] transition-colors">
                    {bc.label}
                  </Link>
                ) : (
                  <span className="font-medium text-[#183D32]">{bc.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
        <h1 className="font-display text-2xl font-bold tracking-tight text-[#183D32]">
          {title}
        </h1>
        {subtitle && <p className="mt-0.5 text-sm text-[#252B29]/70">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </div>
  );
}

export function AnimatedNumber({ value, prefix = '', suffix = '', decimals = 0 }: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const duration = 450;
    const from = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (value - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(display);

  return (
    <span className="tabular-nums">
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'green',
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ReactNode;
  tone?: 'green' | 'gold' | 'terracotta' | 'neutral';
  onClick?: () => void;
}) {
  const toneStyles = {
    green: 'bg-[#183D32]/10 text-[#183D32]',
    gold: 'bg-[#D9A441]/15 text-[#9A6F1C]',
    terracotta: 'bg-[#B85C38]/12 text-[#B85C38]',
    neutral: 'bg-[#252B29]/8 text-[#252B29]',
  }[tone];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={onClick ? { y: -2 } : { y: -1 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={cn(
        'rounded-2xl border border-[#183D32]/10 bg-white p-5 shadow-card transition-shadow hover:shadow-elevated',
        onClick && 'cursor-pointer',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#252B29]/60">
            {label}
          </p>
          <div className="mt-2 font-display text-2xl font-bold text-[#252B29] tabular-nums">
            {value}
          </div>
          {hint && <p className="mt-1 text-xs text-[#252B29]/65">{hint}</p>}
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', toneStyles)}>
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    SUBMITTED: 'bg-amber-50 text-amber-800 border-amber-200',
    VERIFIED: 'bg-sky-50 text-sky-800 border-sky-200',
    APPROVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    INVOICED: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    DISPATCHED: 'bg-[#183D32]/10 text-[#183D32] border-[#183D32]/25',
    COMPLETED: 'bg-[#183D32]/10 text-[#183D32] border-[#183D32]/25',
    POSTED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    IN_PROGRESS: 'bg-[#D9A441]/15 text-[#8A6114] border-[#D9A441]/30',
    PLANNED: 'bg-slate-100 text-slate-700 border-slate-200',
    REJECTED: 'bg-[#B85C38]/12 text-[#B85C38] border-[#B85C38]/30',
    CANCELLED: 'bg-rose-50 text-rose-700 border-rose-200',
    'LOW STOCK': 'bg-[#B85C38]/12 text-[#B85C38] border-[#B85C38]/30',
    EXCEEDED: 'bg-[#B85C38]/12 text-[#B85C38] border-[#B85C38]/30',
    OK: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    ACTIVE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    INACTIVE: 'bg-slate-100 text-slate-600 border-slate-200',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide',
        styles[status] || 'bg-slate-100 text-slate-700 border-slate-200',
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const widths = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  }[size];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#183D32]/40 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            className={cn(
              'relative z-10 w-full rounded-2xl border border-[#183D32]/15 bg-white shadow-elevated max-h-[90vh] flex flex-col',
              widths,
            )}
          >
            <div className="flex items-start justify-between border-b border-[#183D32]/10 px-6 py-4">
              <div>
                <h3 className="font-display text-lg font-bold text-[#183D32]">{title}</h3>
                {subtitle && <p className="text-xs text-[#252B29]/65 mt-0.5">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-[#252B29]/50 hover:bg-[#FFF8ED] hover:text-[#183D32] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-[#252B29]/80">{message}</p>
      <div className="mt-6 flex justify-end gap-2.5">
        <button
          onClick={onClose}
          className="rounded-xl border border-[#252B29]/15 px-4 py-2 text-sm font-medium text-[#252B29] hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={cn(
            'rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50',
            danger ? 'bg-[#B85C38] hover:bg-[#9E4B2B]' : 'bg-[#183D32] hover:bg-[#235344]',
          )}
        >
          {loading ? 'Processing...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export interface ColumnDef<T> {
  key: string;
  header: string;
  sortValue?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
}

export function DataTable<T>({
  data,
  columns,
  searchPlaceholder = 'Search...',
  searchKeys,
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription = 'Try adjusting your search or filter criteria.',
  onRowClick,
  pageSize = 8,
  filterSlot,
}: {
  data: T[];
  columns: ColumnDef<T>[];
  searchPlaceholder?: string;
  searchKeys?: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  filterSlot?: React.ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!query.trim() || !searchKeys) return data;
    const q = query.toLowerCase();
    return data.filter((row) => searchKeys(row).toLowerCase().includes(q));
  }, [data, query, searchKeys]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    return [...filtered].sort((a, b) => {
      const va = col.sortValue!(a);
      const vb = col.sortValue!(b);
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="rounded-2xl border border-[#183D32]/10 bg-white shadow-card overflow-hidden">
      {(searchKeys || filterSlot) && (
        <div className="flex flex-col gap-3 border-b border-[#183D32]/10 p-4 sm:flex-row sm:items-center sm:justify-between bg-[#FFF8ED]/40">
          {searchKeys ? (
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#252B29]/45" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                className="w-full rounded-xl border border-[#183D32]/15 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#183D32] focus:ring-2 focus:ring-[#183D32]/15"
              />
            </div>
          ) : (
            <div />
          )}
          {filterSlot && <div className="flex flex-wrap items-center gap-2">{filterSlot}</div>}
        </div>
      )}

      {loading ? (
        <div className="p-6 space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 w-full animate-pulse rounded-xl bg-[#FFF8ED]" />
          ))}
        </div>
      ) : paged.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#FFF8ED]/70 text-[11px] font-semibold uppercase tracking-wider text-[#183D32]">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'px-4 py-3 whitespace-nowrap',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      col.sortValue && 'cursor-pointer select-none hover:bg-[#FFF8ED]',
                    )}
                    onClick={() => col.sortValue && handleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.sortValue &&
                        (sortKey === col.key ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3" />
                          ) : (
                            <ArrowDown className="w-3 h-3" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-35" />
                        ))}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#183D32]/8">
              {paged.map((row, idx) => (
                <tr
                  key={idx}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'transition-colors hover:bg-[#FFF8ED]/55',
                    onRowClick && 'cursor-pointer',
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-4 py-3 text-[#252B29]',
                        col.align === 'right' && 'text-right tabular-nums',
                        col.align === 'center' && 'text-center',
                      )}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && sorted.length > pageSize && (
        <div className="flex items-center justify-between border-t border-[#183D32]/10 px-4 py-3 text-xs text-[#252B29]/70">
          <span>
            Showing {(safePage - 1) * pageSize + 1}–
            {Math.min(safePage * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-[#183D32]/15 p-1.5 hover:bg-[#FFF8ED] disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-medium">
              {safePage} / {totalPages}
            </span>
            <button
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-[#183D32]/15 p-1.5 hover:bg-[#FFF8ED] disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF8ED] text-[#D9A441]">
        <Inbox className="w-6 h-6" />
      </div>
      <h4 className="mt-3 font-display text-base font-semibold text-[#183D32]">{title}</h4>
      {description && <p className="mt-1 max-w-sm text-xs text-[#252B29]/65">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[#B85C38]/30 bg-[#B85C38]/10 px-4 py-3 text-sm text-[#B85C38]">
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg bg-[#B85C38] px-3 py-1 text-xs font-semibold text-white hover:bg-[#9E4B2B]"
        >
          Retry
        </button>
      )}
    </div>
  );
}
