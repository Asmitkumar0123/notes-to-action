import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  AudioLines,
  Calendar,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Columns3,
  Copy,
  CornerDownRight,
  Database,
  Download,
  Filter,
  HardDrive,
  Layers,
  ListTodo,
  LoaderCircle,
  Moon,
  Pause,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Square,
  Sun,
  WandSparkles,
  X,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  getGetRunQueryKey,
  getListRunsQueryKey,
  getStreamRunEventsUrl,
  useCreateRun,
  useGetRun,
  useListRuns,
  useUpdateRunTask,
} from '@workspace/api-client-react';
import type { Run, RunEvent, Task } from '@workspace/api-client-react';

const queryClient = new QueryClient();

interface PresetTemplate {
  id: string;
  label: string;
  icon: string;
  badge: string;
  notes: string;
}

const presetTemplates: PresetTemplate[] = [
  {
    id: 'launch',
    label: 'Studio Launch',
    icon: '🚀',
    badge: 'Marketing',
    notes: `Willow Studio launch is moving fast.
- send Maya the revised proposal by tomorrow
- ask Priya for the Q3 numbers
Need to draft a launch email, but ask Leo for feedback first.
Urgent: confirm today's client call.
Also renew my passport before the trip next month.`,
  },
  {
    id: 'monday',
    label: 'Monday Sprint',
    icon: '⚡',
    badge: 'Productivity',
    notes: `Team sprint kickoff & weekly deliverable review.
- Finalize the OAuth 2.0 security review by 11am today
- Schedule 1-on-1 checkins with Sarah and Kevin
- Review customer churn metrics and prepare 3 key takeaways
- Approve contractor invoice batch before 5pm deadline
- Draft monthly status report for leadership`,
  },
  {
    id: 'travel',
    label: 'Trip Catch-up',
    icon: '✈️',
    badge: 'Personal',
    notes: `Flight to Tokyo in two weeks.
- Verify passport expiration date today
- Book the bullet train passes between Tokyo and Kyoto
- Buy a universal travel power adapter
- Pick up dry cleaning on Thursday evening
- Cancel weekly vegetable delivery box`,
  },
  {
    id: 'deepwork',
    label: 'Deep Work Flow',
    icon: '🎯',
    badge: 'Engineering',
    notes: `Focus day for system architecture redesign.
- Draft technical spec for the distributed event stream
- Benchmark SQLite vs PostgreSQL query performance
- Refactor the run engine pipeline error recovery module
- Write integration tests for event replay speed multiplier
- Update README documentation with local database instructions`,
  },
];

const flowSteps = [
  { id: '1', number: '01', title: 'Take in the notes', layer: 'BROWSER', copy: 'Your raw thoughts arrive exactly as typed.' },
  { id: '2', number: '02', title: 'Persist start state', layer: 'DATABASE', copy: 'A run record is written to the local database.' },
  { id: '3', number: '03', title: 'Task extraction', layer: 'OPENAI', copy: 'The text is analyzed for actionable items.' },
  { id: '3-recovery', number: '↳', title: 'Recover locally', layer: 'SERVER', copy: 'Deterministic local engine recovers tasks if AI is unavailable.', recovery: true },
  { id: '4', number: '04', title: 'Prioritization', layer: 'SERVER', copy: 'Tasks are categorized and given priority levels.' },
  { id: '5', number: '05', title: 'Draft day schedule', layer: 'SERVER', copy: 'Time blocks and realistic durations are mapped out.' },
  { id: '6', number: '06', title: 'Save full record', layer: 'DATABASE', copy: 'Results and event traces are stored in the local DB.' },
  { id: '7', number: '07', title: 'Deliver plan', layer: 'BROWSER', copy: 'Your day plan is ready for action.' },
];

function getOwnerId(): string {
  const key = 'notes-to-action-owner';
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = `browser-owner-${window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    window.localStorage.setItem(key, id);
  }
  return id;
}

const ownerId = typeof window === 'undefined' ? 'browser-owner-placeholder-000000' : getOwnerId();

function prettyDate(value?: string | null): string {
  if (!value) return 'Just now';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function durationLabel(minutes: number): string {
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes} min`;
}

interface DbStatus {
  type: string;
  isLocal: boolean;
  location: string;
  ready: boolean;
}

function Home() {
  const client = useQueryClient();
  const [notes, setNotes] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [streamState, setStreamState] = useState<'idle' | 'connected' | 'reconnecting'>('idle');
  const [replay, setReplay] = useState(false);
  const [replayIndex, setReplayIndex] = useState(-1);
  const [speed, setSpeed] = useState(1);
  const [activeTab, setActiveTab] = useState<'plan' | 'kanban' | 'trace' | 'database'>('plan');
  const [taskFilter, setTaskFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('theme-mode');
      if (saved) return saved === 'dark';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const [copiedPlan, setCopiedPlan] = useState(false);

  const createRun = useCreateRun();
  const updateTask = useUpdateRunTask();
  const params = useMemo(() => ({ ownerId }), []);
  const runsQuery = useListRuns(params);
  const runQuery = useGetRun(ownerId, selectedId, {
    query: {
      enabled: !!selectedId,
      queryKey: getGetRunQueryKey(ownerId, selectedId),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === 'queued' || status === 'running' ? 2500 : false;
      },
    },
  });

  const run = runQuery.data as Run | undefined;
  const events = run?.events ?? [];
  const eventRef = useRef<EventSource | null>(null);
  const runStatus = run?.status;

  // Toggle Theme
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      window.localStorage.setItem('theme-mode', 'dark');
    } else {
      root.classList.remove('dark');
      window.localStorage.setItem('theme-mode', 'light');
    }
  }, [isDark]);

  // Fetch DB Status
  useEffect(() => {
    fetch('/api/db/status')
      .then((res) => res.json())
      .then((data: DbStatus) => setDbStatus(data))
      .catch(() => {
        setDbStatus({
          type: 'local-embedded',
          isLocal: true,
          location: 'Local Embedded Storage',
          ready: true,
        });
      });
  }, []);

  // SSE Stream
  useEffect(() => {
    if (!selectedId || (runStatus !== 'queued' && runStatus !== 'running')) {
      eventRef.current?.close();
      eventRef.current = null;
      setStreamState('idle');
      return;
    }
    const source = new EventSource(getStreamRunEventsUrl(ownerId, selectedId));
    eventRef.current?.close();
    eventRef.current = source;
    setStreamState('connected');
    const handleEvent = (message: MessageEvent) => {
      try {
        const event = JSON.parse(message.data) as RunEvent;
        if (event && typeof event.sequence === 'number') {
          client.setQueryData<Run>(getGetRunQueryKey(ownerId, selectedId), (old) => {
            if (!old) return old;
            const known = new Set(old.events.map((item) => item.sequence));
            return known.has(event.sequence) ? old : { ...old, events: [...old.events, event].sort((a, b) => a.sequence - b.sequence) };
          });
        }
      } catch {
        // fallback
      }
      void client.invalidateQueries({ queryKey: getGetRunQueryKey(ownerId, selectedId) });
      void client.invalidateQueries({ queryKey: getListRunsQueryKey(params) });
    };
    source.addEventListener('run-event', handleEvent as EventListener);
    source.addEventListener('run-finished', () => {
      setStreamState('idle');
      source.close();
      void client.invalidateQueries({ queryKey: getGetRunQueryKey(ownerId, selectedId) });
      void client.invalidateQueries({ queryKey: getListRunsQueryKey(params) });
    });
    source.onopen = () => setStreamState('connected');
    source.onerror = () => setStreamState('reconnecting');
    return () => {
      source.close();
      if (eventRef.current === source) eventRef.current = null;
    };
  }, [selectedId, runStatus, client, params]);

  // Replay timeline
  useEffect(() => {
    if (!replay || events.length === 0) return;
    const timer = window.setInterval(() => {
      setReplayIndex((current) => {
        if (current >= events.length - 1) {
          setReplay(false);
          return events.length - 1;
        }
        return current + 1;
      });
    }, 950 / speed);
    return () => window.clearInterval(timer);
  }, [replay, events.length, speed]);

  useEffect(() => {
    if (!selectedId) return;
    setReplay(false);
    setReplayIndex(-1);
  }, [selectedId]);

  const submit = useCallback(() => {
    if (notes.trim().length < 20 || createRun.isPending) return;
    createRun.mutate(
      { data: { ownerId, notes: notes.trim(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } },
      {
        onSuccess: (created) => {
          setSelectedId(created.id);
          setNotes('');
          setActiveTab('plan');
          void client.invalidateQueries({ queryKey: getListRunsQueryKey(params) });
          client.setQueryData(getGetRunQueryKey(ownerId, created.id), created);
        },
      },
    );
  }, [notes, createRun, client, params]);

  // Handle Ctrl+Enter to submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  const toggleTask = (task: Task) => {
    if (!run) return;
    updateTask.mutate(
      { runId: run.id, taskId: task.id, data: { ownerId, completed: !task.completed } },
      {
        onSuccess: (updated) => {
          client.setQueryData<Run>(getGetRunQueryKey(ownerId, run.id), (current) =>
            current ? { ...current, tasks: current.tasks.map((item) => (item.id === updated.id ? updated : item)) } : current,
          );
        },
      },
    );
  };

  const copyPlanMarkdown = () => {
    if (!run) return;
    const lines = [
      `# ${run.title || 'Day Plan'}`,
      `*Generated on ${prettyDate(run.createdAt)} via Notes to Action*`,
      '',
      '## Tasks',
      ...run.tasks.map((t) => `- [${t.completed ? 'x' : ' '}] **${t.title}** (${t.priority} priority, ~${t.estimateMinutes}m)${t.dueLabel ? ` [Due: ${t.dueLabel}]` : ''}`),
      '',
      '## Suggested Schedule',
      ...run.schedule.map((s) => `- **${s.start} - ${s.end}**: ${s.title} (${durationLabel(s.estimateMinutes)})`),
    ];
    void navigator.clipboard.writeText(lines.join('\n'));
    setCopiedPlan(true);
    setTimeout(() => setCopiedPlan(false), 2200);
  };

  const currentStepId = replayIndex >= 0 ? events[replayIndex]?.stepId : events.at(-1)?.stepId;
  const completedCount = run?.tasks.filter((task) => task.completed).length ?? 0;
  const totalTasks = run?.tasks.length ?? 0;
  const completion = totalTasks ? Math.round((completedCount / totalTasks) * 100) : 0;

  return (
    <div className={`min-h-screen transition-colors duration-300 ${isDark ? 'bg-[#0b0f14] text-[#e2e8f0]' : 'bg-[#f7f5ef] text-[#1e293b]'}`}>
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[50vw] h-[50vw] rounded-full blur-[140px] opacity-25 dark:opacity-20 bg-emerald-500" />
        <div className="absolute top-[20%] -right-[15%] w-[45vw] h-[45vw] rounded-full blur-[150px] opacity-20 dark:opacity-15 bg-amber-500" />
        <div className="absolute bottom-[0%] left-[20%] w-[40vw] h-[40vw] rounded-full blur-[160px] opacity-15 dark:opacity-10 bg-teal-600" />
      </div>

      <div className="relative z-10 mx-auto max-w-[1440px] px-4 pb-24 pt-4 sm:px-6 lg:px-10">
        {/* Modern Top Header Bar */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-black/[0.08] dark:border-white/[0.08] pb-4 pt-2">
          <div className="flex items-center gap-3">
            <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-700 via-teal-600 to-emerald-500 text-white shadow-lg shadow-emerald-500/20">
              <AudioLines size={20} strokeWidth={2.2} />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-white dark:border-black" />
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-[22px] font-bold tracking-tight text-slate-900 dark:text-white">Notes to Action</h1>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  v2.0
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Transform brain-dumps into focused execution plans
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Database Status Pill Button */}
            <button
              onClick={() => setDbModalOpen(true)}
              className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-950/40 px-3.5 py-1.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 transition-all hover:bg-emerald-500/20 hover:scale-[1.02] shadow-sm"
              title="Click to view Local Database details"
            >
              <Database size={13} className="text-emerald-600 dark:text-emerald-400" />
              <span>Local DB: Active</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </button>

            {/* Dark / Light Toggle */}
            <button
              onClick={() => setIsDark(!isDark)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 dark:border-white/10 bg-white/70 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 transition-all hover:scale-105 shadow-sm"
              aria-label="Toggle Theme"
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {/* Browser Owner Pill */}
            <div className="hidden sm:flex items-center gap-2 rounded-full border border-black/10 dark:border-white/10 bg-white/50 dark:bg-slate-800/50 px-3 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full bg-teal-500" />
              <span className="font-mono text-[10px] opacity-80">{ownerId.slice(0, 16)}…</span>
            </div>
          </div>
        </header>

        {/* Hero Section & Composer */}
        <section className="grid gap-8 pb-10 pt-8 lg:grid-cols-[1.05fr_.95fr] lg:gap-12 lg:pb-14 lg:pt-12 items-start">
          <div className="fade-up space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              <Sparkles size={12} className="text-amber-500" />
              Zero Setup · Offline Capable · Local Database
            </div>

            <h2 className="font-serif text-[clamp(2.8rem,5.5vw,4.8rem)] font-bold leading-[0.96] tracking-[-0.04em] text-slate-900 dark:text-white">
              Dump the noise. <br />
              <span className="bg-gradient-to-r from-emerald-600 via-teal-500 to-amber-500 bg-clip-text text-transparent">
                Command your day.
              </span>
            </h2>

            <p className="max-w-[500px] text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 font-normal">
              Type or paste whatever is in your head: meeting notes, random to-dos, loose ideas, or urgent deadlines.
              Our local prioritization engine extracts concrete tasks, estimates minutes, and schedules a realistic day plan.
            </p>

            {/* Quick Templates Selector */}
            <div className="pt-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2.5 flex items-center gap-2">
                <span>Select a ready-to-run template:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {presetTemplates.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setNotes(item.notes)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-slate-800/80 px-3 py-1.5 text-[12px] font-medium text-slate-700 dark:text-slate-200 transition-all hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 shadow-sm"
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Local Storage Indicator Banner */}
            <div className="flex items-center gap-3 pt-2 text-[12px] text-slate-500 dark:text-slate-400">
              <div className="flex -space-x-1">
                <span className="inline-block h-3 w-3 rounded-full bg-emerald-500 border border-white dark:border-black" />
                <span className="inline-block h-3 w-3 rounded-full bg-amber-500 border border-white dark:border-black" />
                <span className="inline-block h-3 w-3 rounded-full bg-teal-500 border border-white dark:border-black" />
              </div>
              <span>Data stays in your browser and embedded local database.</span>
            </div>
          </div>

          {/* Interactive Composer Card */}
          <div className="fade-up-delay relative">
            <div className="glass-card rounded-[24px] p-6 sm:p-7 shadow-xl relative overflow-hidden">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    Input Brain-Dump
                  </div>
                  <h3 className="font-serif text-[20px] font-bold text-slate-900 dark:text-white">
                    What's on your plate?
                  </h3>
                </div>
                <span className="rounded-full bg-slate-200/60 dark:bg-slate-700/60 px-3 py-1 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                  {notes.length.toLocaleString()} / 12,000
                </span>
              </div>

              <textarea
                id="notes-input"
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 12000))}
                onKeyDown={handleKeyDown}
                placeholder={"Type, dictate, or paste your scattered notes...\n\nExample:\n- Email Maya revised proposal by 3pm\n- Call Priya regarding Q3 revenue slides\n- Fix login bug reported on Slack\n- Buy anniversary gift tonight"}
                className="min-h-[190px] w-full resize-y rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-4 text-[14px] leading-relaxed text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-all focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
              />

              {createRun.isError && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-[12px] text-red-600 dark:text-red-400">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>Unable to complete run. Your notes are preserved; try submitting again.</span>
                </div>
              )}

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  <WandSparkles size={14} className="text-amber-500" />
                  <span>Press <kbd className="rounded border border-black/10 dark:border-white/10 bg-slate-100 dark:bg-slate-800 px-1 py-0.5 font-mono text-[10px]">Ctrl</kbd> + <kbd className="rounded border border-black/10 dark:border-white/10 bg-slate-100 dark:bg-slate-800 px-1 py-0.5 font-mono text-[10px]">Enter</kbd></span>
                </div>

                <div className="flex items-center gap-2">
                  {notes && (
                    <button
                      onClick={() => setNotes('')}
                      className="rounded-xl px-3 py-2 text-[12px] font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={submit}
                    disabled={notes.trim().length < 20 || createRun.isPending}
                    className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-600 dark:from-emerald-600 dark:to-teal-500 px-6 text-[13px] font-semibold text-white shadow-md shadow-emerald-700/25 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                  >
                    {createRun.isPending ? (
                      <>
                        <LoaderCircle size={16} className="animate-spin" />
                        <span>Organizing notes…</span>
                      </>
                    ) : (
                      <>
                        <span>Generate Plan</span>
                        <ArrowRight size={15} />
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="mt-2.5 text-right text-[10px] text-slate-400">
                Min. 20 characters to analyze
              </div>
            </div>
          </div>
        </section>

        {/* Dashboard Main Section: Run Details & History */}
        <section className="grid items-start gap-8 border-t border-black/[0.08] dark:border-white/[0.08] pt-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.72fr)]">
          <div className="min-w-0 space-y-6">
            {/* Run Header with Tab View Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Interactive Workspace
                </span>
                <h2 className="font-serif text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">
                  {run ? run.title : 'Action Plan'}
                </h2>
              </div>

              {run && (
                <div className="flex flex-wrap items-center gap-2">
                  {/* View Navigation Tabs */}
                  <div className="flex rounded-xl bg-slate-200/60 dark:bg-slate-800/80 p-1 border border-black/5 dark:border-white/5">
                    <button
                      onClick={() => setActiveTab('plan')}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${activeTab === 'plan' ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                      <ListTodo size={13} />
                      <span>Plan & Schedule</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('kanban')}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${activeTab === 'kanban' ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                      <Columns3 size={13} />
                      <span>Priority Matrix</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('trace')}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${activeTab === 'trace' ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                      <Layers size={13} />
                      <span>Trace Replay ({events.length})</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('database')}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${activeTab === 'database' ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
                    >
                      <Database size={13} />
                      <span>Raw Record</span>
                    </button>
                  </div>

                  {/* Copy Markdown Plan Button */}
                  <button
                    onClick={copyPlanMarkdown}
                    className="flex items-center gap-1.5 rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-slate-800/80 px-3 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 transition-all hover:bg-slate-100 dark:hover:bg-slate-700 shadow-sm"
                    title="Copy full day plan formatted as Markdown"
                  >
                    {copiedPlan ? <CheckCheck size={13} className="text-emerald-600" /> : <Copy size={13} />}
                    <span>{copiedPlan ? 'Copied!' : 'Export Plan'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Empty State */}
            {!run && !runQuery.isLoading && (
              <div className="glass-card rounded-[24px] p-12 text-center border-dashed border-2 border-slate-300 dark:border-slate-700">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <ArrowDownRight size={24} />
                </div>
                <h3 className="font-serif text-[22px] font-bold text-slate-900 dark:text-white">
                  Your structured day will appear here
                </h3>
                <p className="mx-auto mt-2 max-w-[360px] text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Write down your scattered thoughts above or pick one of the sample presets to test the local task engine.
                </p>
              </div>
            )}

            {/* Loading Skeleton */}
            {runQuery.isLoading && selectedId && (
              <div className="space-y-4 animate-pulse">
                <div className="h-28 rounded-2xl bg-slate-200/70 dark:bg-slate-800/70" />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="h-64 rounded-2xl bg-slate-200/70 dark:bg-slate-800/70" />
                  <div className="h-64 rounded-2xl bg-slate-200/70 dark:bg-slate-800/70" />
                </div>
              </div>
            )}

            {/* Active Content when Run is Loaded */}
            {run && (
              <div className="space-y-6">
                {/* Completion Progress Banner */}
                <div className="glass-card rounded-2xl p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold text-[13px]">
                        {completion}%
                      </div>
                      <div>
                        <div className="text-[13px] font-bold text-slate-900 dark:text-white">
                          {completion === 100 ? 'All Tasks Completed! 🎉' : 'Progress Today'}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {completedCount} of {totalTasks} actions completed · {durationLabel(run.tasks.reduce((acc, t) => acc + (t.completed ? 0 : t.estimateMinutes), 0))} remaining
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {run.fallbackUsed && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                          <RefreshCw size={11} /> Local Extractor Fallback
                        </span>
                      )}
                      <span className="rounded-full bg-slate-200/60 dark:bg-slate-800/80 px-2.5 py-1 font-mono text-[10px] text-slate-600 dark:text-slate-300">
                        {prettyDate(run.createdAt)}
                      </span>
                    </div>
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-400 transition-all duration-500"
                      style={{ width: `${completion}%` }}
                    />
                  </div>
                </div>

                {/* TAB 1: Plan & Day Schedule */}
                {activeTab === 'plan' && (
                  <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
                    {/* Action Items List */}
                    <div className="glass-card rounded-[22px] p-5 sm:p-6 shadow-sm">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-black/5 dark:border-white/5 pb-3">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Checklist
                          </div>
                          <h3 className="font-serif text-[18px] font-bold text-slate-900 dark:text-white">
                            Prioritized Actions ({run.tasks.length})
                          </h3>
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex rounded-lg bg-slate-200/50 dark:bg-slate-800/60 p-0.5 text-[10px]">
                          {(['all', 'active', 'completed'] as const).map((filter) => (
                            <button
                              key={filter}
                              onClick={() => setTaskFilter(filter)}
                              className={`rounded-md px-2.5 py-1 font-medium capitalize transition-all ${taskFilter === filter ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                            >
                              {filter}
                            </button>
                          ))}
                        </div>
                      </div>

                      {run.tasks.length === 0 ? (
                        <div className="py-8 text-center text-[13px] text-slate-400">No actions recorded.</div>
                      ) : (
                        <div className="space-y-2">
                          {run.tasks
                            .filter((t) => {
                              if (taskFilter === 'active') return !t.completed;
                              if (taskFilter === 'completed') return t.completed;
                              return true;
                            })
                            .map((task, idx) => (
                              <div
                                key={task.id}
                                className={`task-row group flex items-start gap-3 rounded-xl border p-3 transition-all ${task.completed ? 'border-transparent bg-black/[0.02] dark:bg-white/[0.02] opacity-55' : 'border-black/5 dark:border-white/5 bg-white/70 dark:bg-slate-800/60 hover:shadow-sm'}`}
                              >
                                <button
                                  onClick={() => toggleTask(task)}
                                  disabled={updateTask.isPending}
                                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border transition-all ${task.completed ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-transparent hover:border-emerald-500'}`}
                                  aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
                                >
                                  {task.completed && <Check size={12} strokeWidth={3} />}
                                </button>

                                <div className="min-w-0 flex-1">
                                  <div className={`text-[13px] font-semibold leading-snug text-slate-900 dark:text-slate-100 ${task.completed ? 'line-through text-slate-400 dark:text-slate-500' : ''}`}>
                                    {task.title}
                                  </div>

                                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                    <span
                                      className={`rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${task.priority === 'high' ? 'bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20' : task.priority === 'medium' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'}`}
                                    >
                                      {task.priority}
                                    </span>

                                    {task.category && (
                                      <span className="rounded-md bg-slate-200/60 dark:bg-slate-700/60 px-2 py-0.5 text-[9px] font-medium text-slate-600 dark:text-slate-300">
                                        {task.category}
                                      </span>
                                    )}

                                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                                      <Clock3 size={11} />
                                      {durationLabel(task.estimateMinutes)}
                                    </span>

                                    {task.dueLabel && (
                                      <span className="rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-medium text-blue-700 dark:text-blue-300">
                                        Due {task.dueLabel}
                                      </span>
                                    )}
                                  </div>

                                  {task.reason && (
                                    <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                                      {task.reason}
                                    </p>
                                  )}
                                </div>

                                <span className="pt-0.5 font-mono text-[10px] text-slate-300 dark:text-slate-600">
                                  #{String(idx + 1).padStart(2, '0')}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    {/* Schedule Column */}
                    <div className="glass-card rounded-[22px] p-5 sm:p-6 shadow-sm">
                      <div className="mb-4 flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-3">
                        <div>
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Flow
                          </div>
                          <h3 className="font-serif text-[18px] font-bold text-slate-900 dark:text-white">
                            Suggested Timeline
                          </h3>
                        </div>
                        <Calendar size={16} className="text-emerald-600 dark:text-emerald-400" />
                      </div>

                      {run.schedule.length === 0 ? (
                        <div className="py-8 text-center text-[12px] text-slate-400">No schedule blocks available.</div>
                      ) : (
                        <div className="relative space-y-3 before:absolute before:bottom-3 before:left-[45px] before:top-3 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                          {run.schedule.map((block) => {
                            const task = run.tasks.find((t) => t.id === block.taskId);
                            return (
                              <div key={`${block.taskId}-${block.start}`} className="relative flex gap-3.5 items-start">
                                <div className="w-[48px] shrink-0 pt-2 text-right font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                  {block.start}
                                </div>
                                <div className="relative z-10 mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-white dark:border-slate-900 bg-emerald-500 ring-2 ring-emerald-500/20" />
                                <div className="min-w-0 flex-1 rounded-xl border border-black/5 dark:border-white/5 bg-white/70 dark:bg-slate-800/60 p-3 shadow-xs">
                                  <div className="text-[12px] font-bold text-slate-800 dark:text-slate-200">
                                    {block.title}
                                  </div>
                                  <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                                    <span>{block.start} – {block.end}</span>
                                    <span>·</span>
                                    <span>{durationLabel(block.estimateMinutes)}</span>
                                    {task && (
                                      <span className={`ml-auto font-semibold uppercase text-[9px] ${task.priority === 'high' ? 'text-red-500' : task.priority === 'medium' ? 'text-amber-500' : 'text-emerald-500'}`}>
                                        {task.priority}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div className="mt-4 flex items-start gap-2 border-t border-black/5 dark:border-white/5 pt-3 text-[11px] text-slate-500 dark:text-slate-400">
                        <CornerDownRight size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                        <span>A draft schedule built to fit typical energy curves. Adjust as needed.</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: Priority Matrix / Kanban */}
                {activeTab === 'kanban' && (
                  <div className="grid gap-4 md:grid-cols-3">
                    {(['high', 'medium', 'low'] as const).map((priority) => {
                      const priorityTasks = run.tasks.filter((t) => t.priority === priority);
                      const priorityColor =
                        priority === 'high'
                          ? 'border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-400'
                          : priority === 'medium'
                          ? 'border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400'
                          : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400';

                      return (
                        <div key={priority} className="glass-card rounded-2xl p-4 flex flex-col min-h-[350px]">
                          <div className="flex items-center justify-between pb-3 border-b border-black/5 dark:border-white/5 mb-3">
                            <span className={`rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider border ${priorityColor}`}>
                              {priority} Priority
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">
                              {priorityTasks.length}
                            </span>
                          </div>

                          <div className="space-y-2.5 flex-1">
                            {priorityTasks.length === 0 ? (
                              <div className="text-center py-10 text-[12px] text-slate-400">
                                No {priority} priority tasks
                              </div>
                            ) : (
                              priorityTasks.map((t) => (
                                <div
                                  key={t.id}
                                  onClick={() => toggleTask(t)}
                                  className={`rounded-xl border p-3 cursor-pointer transition-all hover:scale-[1.01] ${t.completed ? 'opacity-50 border-black/5 dark:border-white/5 bg-slate-100/50 dark:bg-slate-900/40 line-through' : 'border-black/10 dark:border-white/10 bg-white/80 dark:bg-slate-800/80 shadow-xs'}`}
                                >
                                  <div className="flex items-start gap-2">
                                    <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${t.completed ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                                      {t.completed && <Check size={10} />}
                                    </div>
                                    <div className="text-[12px] font-bold text-slate-900 dark:text-slate-100 leading-snug">
                                      {t.title}
                                    </div>
                                  </div>
                                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                                    <span>{t.category || 'General'}</span>
                                    <span>{durationLabel(t.estimateMinutes)}</span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* TAB 3: Trace Replay */}
                {activeTab === 'trace' && (
                  <div className="glass-card rounded-[22px] p-6 space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-black/5 dark:border-white/5 pb-4">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Execution Pipeline Trace
                        </div>
                        <h3 className="font-serif text-[20px] font-bold text-slate-900 dark:text-white">
                          7-Step Deterministic Processing Trail
                        </h3>
                      </div>

                      {/* Replay Controls */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setReplayIndex(-1);
                            setReplay(true);
                          }}
                          disabled={replay}
                          className="flex items-center gap-1.5 rounded-full bg-emerald-600 dark:bg-emerald-500 px-4 py-1.5 text-[11px] font-semibold text-white transition-all hover:scale-105 disabled:opacity-50"
                        >
                          <Play size={12} fill="currentColor" />
                          <span>Replay Run</span>
                        </button>

                        {replay && (
                          <button
                            onClick={() => setReplay(false)}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                            aria-label="Pause replay"
                          >
                            <Pause size={13} />
                          </button>
                        )}

                        <select
                          value={speed}
                          onChange={(e) => setSpeed(Number(e.target.value))}
                          className="rounded-full border border-black/10 dark:border-white/10 bg-white dark:bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-700 dark:text-slate-200 outline-none"
                        >
                          <option value={0.5}>0.5×</option>
                          <option value={1}>1.0×</option>
                          <option value={1.5}>1.5×</option>
                          <option value={2}>2.0×</option>
                        </select>

                        <button
                          onClick={() => {
                            setReplay(false);
                            setReplayIndex(events.length - 1);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 dark:border-white/10 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                          aria-label="Jump to end"
                        >
                          <Square size={11} />
                        </button>
                      </div>
                    </div>

                    {/* Step Visualizer */}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {flowSteps.map((step) => {
                        const stepEvents = events.filter((e) => e.stepId === step.id);
                        if (step.recovery && stepEvents.length === 0) return null;
                        const active = currentStepId === step.id;
                        const done = stepEvents.length > 0 && !active;

                        return (
                          <div
                            key={step.id}
                            className={`step-node rounded-2xl border p-4 transition-all ${active ? 'border-amber-500 bg-amber-500/10 shadow-md ring-2 ring-amber-500/20' : done ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-black/5 dark:border-white/5 bg-black/[0.01] dark:bg-white/[0.01]'}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-mono text-[10px] font-bold text-slate-400">
                                {step.number}
                              </span>
                              <span className="rounded-full bg-slate-200/60 dark:bg-slate-700/60 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-slate-600 dark:text-slate-300">
                                {step.layer}
                              </span>
                            </div>
                            <div className="text-[13px] font-bold text-slate-900 dark:text-white leading-tight">
                              {step.title}
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                              {step.copy}
                            </p>
                            {stepEvents.length > 0 && (
                              <div className="mt-2 text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                                ✓ {stepEvents.length} event{stepEvents.length > 1 ? 's' : ''} logged
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Event Timeline Log */}
                    <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-4 max-h-[300px] overflow-y-auto space-y-2">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                        Recorded Server Events ({events.length})
                      </div>
                      {events.map((ev, idx) => (
                        <div
                          key={`${ev.sequence}-${ev.stepId}`}
                          className={`flex items-start gap-3 rounded-lg p-2 font-mono text-[11px] transition-all ${replay && idx === replayIndex ? 'bg-amber-500/20 border-l-4 border-amber-500 pl-3' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}
                        >
                          <span className="text-slate-400 shrink-0">#{ev.sequence}</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300 shrink-0 uppercase text-[9px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                            {ev.layer}
                          </span>
                          <div className="min-w-0 flex-1">
                            <span className="font-semibold text-slate-900 dark:text-white">{ev.label}</span>
                            <span className="text-slate-500 dark:text-slate-400 ml-2">{ev.detail}</span>
                          </div>
                          {ev.durationMs != null && (
                            <span className="text-emerald-600 dark:text-emerald-400 shrink-0 text-[10px]">
                              {ev.durationMs}ms
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB 4: Raw Database Record */}
                {activeTab === 'database' && (
                  <div className="glass-card rounded-[22px] p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Local Database Record
                        </div>
                        <h3 className="font-serif text-[18px] font-bold text-slate-900 dark:text-white">
                          Table: <span className="font-mono text-emerald-600">productivity_runs</span>
                        </h3>
                      </div>
                      <button
                        onClick={() => {
                          void navigator.clipboard.writeText(JSON.stringify(run, null, 2));
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-black/10 dark:border-white/10 px-3 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <Copy size={12} />
                        <span>Copy JSON</span>
                      </button>
                    </div>

                    <pre className="max-h-[420px] overflow-auto rounded-xl bg-slate-950 p-4 font-mono text-[11px] text-emerald-400 leading-relaxed border border-slate-800">
                      {JSON.stringify(run, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Aside: Previous Runs Trail */}
          <aside className="glass-card rounded-[24px] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  History
                </span>
                <h3 className="font-serif text-[20px] font-bold text-slate-900 dark:text-white">
                  Saved Runs
                </h3>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                {runsQuery.data?.length ?? 0}
              </span>
            </div>

            {/* Run Search Filter */}
            {(runsQuery.data?.length ?? 0) > 3 && (
              <div className="relative">
                <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter saved runs..."
                  className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] pl-8 pr-3 py-1.5 text-[12px] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none focus:border-emerald-500"
                />
              </div>
            )}

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {runsQuery.isLoading && (
                <>
                  <div className="h-16 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 animate-pulse" />
                  <div className="h-16 rounded-xl bg-slate-200/60 dark:bg-slate-800/60 animate-pulse" />
                </>
              )}

              {runsQuery.data?.length === 0 && !runsQuery.isLoading && (
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-[12px] text-slate-400">
                  No saved runs yet. Submit your first notes above.
                </div>
              )}

              {runsQuery.data
                ?.filter((item) => (searchQuery ? item.title?.toLowerCase().includes(searchQuery.toLowerCase()) : true))
                .map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelectedId(item.id);
                      setActiveTab('plan');
                    }}
                    className={`w-full text-left rounded-xl border p-3.5 transition-all hover:scale-[1.01] ${selectedId === item.id ? 'border-emerald-500 bg-emerald-500/10 dark:bg-emerald-950/40 shadow-xs' : 'border-black/5 dark:border-white/5 bg-white/60 dark:bg-slate-800/50 hover:bg-white dark:hover:bg-slate-800'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-[13px] text-slate-900 dark:text-slate-100 line-clamp-1">
                        {item.title || 'Untitled Run'}
                      </span>
                      <span className={`h-2 w-2 rounded-full shrink-0 mt-1 ${item.status === 'completed' ? 'bg-emerald-500' : item.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'}`} />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                      <span>{item.taskCount} actions{item.fallbackUsed ? ' · local recovery' : ''}</span>
                      <span>{prettyDate(item.createdAt)}</span>
                    </div>
                  </button>
                ))}
            </div>

            <div className="border-t border-black/5 dark:border-white/5 pt-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              Saved locally with full timestamped event replay records.
            </div>
          </aside>
        </section>

        {/* Footer */}
        <footer className="mt-16 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-black/[0.08] dark:border-white/[0.08] pt-6 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Notes to Action</span>
            <span>·</span>
            <span>Local Embedded DB & AI Engine</span>
          </div>
          <div className="font-mono text-[10px] tracking-wider uppercase opacity-75">
            100% PERSISTENT · PRIVACY FIRST · DEV READY
          </div>
        </footer>
      </div>

      {/* Database Diagnostics Modal */}
      {dbModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass-card max-w-lg w-full rounded-[24px] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Database size={18} className="text-emerald-500" />
                <h3 className="font-serif text-[18px] font-bold text-slate-900 dark:text-white">
                  Database Configuration
                </h3>
              </div>
              <button
                onClick={() => setDbModalOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3 text-[13px]">
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-start gap-3">
                <HardDrive size={18} className="text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold text-emerald-800 dark:text-emerald-300">
                    Embedded PostgreSQL Engine (PGlite)
                  </div>
                  <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                    Operating locally without requiring external PostgreSQL servers or docker containers.
                  </div>
                </div>
              </div>

              <div className="space-y-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] p-3.5 font-mono text-[11px]">
                <div className="flex justify-between py-1 border-b border-black/5 dark:border-white/5">
                  <span className="text-slate-500">Database Engine:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">PGlite (WASM / In-Process)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-black/5 dark:border-white/5">
                  <span className="text-slate-500">Storage Mode:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">Persistent Disk Storage</span>
                </div>
                <div className="flex justify-between py-1 border-b border-black/5 dark:border-white/5">
                  <span className="text-slate-500">Table Schema:</span>
                  <span className="text-slate-800 dark:text-slate-200">productivity_runs</span>
                </div>
                <div className="flex justify-between py-1 border-b border-black/5 dark:border-white/5">
                  <span className="text-slate-500">Local DB Location:</span>
                  <span className="text-slate-800 dark:text-slate-200 break-all text-right max-w-[240px]">
                    {dbStatus?.location || 'local-data/notes-to-action-db'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Remote Postgres Fallback:</span>
                  <span className="text-slate-400">Supported via DATABASE_URL</span>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                All created runs, tasks, schedule blocks, and step traces are saved into this embedded database and persist across browser and server restarts.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setDbModalOpen(false)}
                className="rounded-xl bg-emerald-600 dark:bg-emerald-500 px-4 py-2 text-[12px] font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
