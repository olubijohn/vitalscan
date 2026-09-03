import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Building2, Check, CheckCircle2,
  ChevronDown, CircleHelp, ClipboardList, CloudDownload, Copy, CreditCard, Database, Download, Eye, EyeOff, FileText, HeartPulse,
  HelpCircle, KeyRound, Laptop, LayoutDashboard, LogOut, Menu, MoreHorizontal, Pencil, Plus, Search, Settings2, ShieldCheck,
  Signal, SlidersHorizontal, Sparkles, Stethoscope, Users, Wallet, X, Zap,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, useRoute, useSearch } from 'wouter';
import {
  getExportUsageCsvQueryKey, getGetAdminAnalyticsQueryKey, getGetAdminOverviewQueryKey, getGetSessionQueryKey, getGetSubscriberMeQueryKey,
  getGetSubscriberScanQueryKey, getGetSubscriberUsageQueryKey, getGetTenantOverviewQueryKey,
  getGetTenantQueryKey,
  getHealthCheckQueryKey, getListDevicesQueryKey, getListPlatformStaffQueryKey,
  getListPrivateSubscribersQueryKey, getListPrivateTopupsQueryKey, getListSubscribersQueryKey,
  getListSubscriberNotificationsQueryKey, getListSubscriberScansQueryKey, getListSubscriberSelfReportsQueryKey, getListTenantSubusersQueryKey,
  getListTenantTopupsQueryKey, getListTenantsQueryKey, getLookupKioskSubscribersQueryKey, useAbortKioskScan, useAbortSubscriberScan,
  useAllocateSubscriberCredit, useAllocateTenantCredit, useCompleteKioskScan, useCompleteSubscriberScan,
  useCreateDevice, useCreateKioskGuest, useCreatePlatformStaff, useCreateSubscriber, useCreateSubscriberSelfReport, useCreateSubscriberTopup, useCreateTenant,
  useCreateTenantSubuser, useDecidePrivateTopup, useDecideTenantTopup, useDeleteTenant, useExportUsageCsv,
  useGetAdminAnalytics, useGetAdminOverview, useGetSession, useGetSubscriber, useGetSubscriberMe,
  useGetSubscriberScan, useGetSubscriberUsage, useGetTenant, useGetTenantOverview,
  useHealthCheck, useListDevices, useListPlatformStaff, useListPrivateSubscribers,
  useListPrivateTopups, useListSubscribers, useListSubscriberNotifications, useListSubscriberScans, useListSubscriberSelfReports,
  useListTenantSubusers, useListTenantTopups, useListTenants, useLogin, useLogout, useLookupKioskSubscribers,
  useRegisterSubscriber, useStartKioskScan, useStartSubscriberScan, useUpdateAdminSettings, useUpdateSubscriber,
  useUpdateSubscriberMe, useUpdateTenant, useUpdateTenantProfile, useUpdateTenantSubuser, useDeleteTenantSubuser,
} from '@workspace/api-client-react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ErrorBoundary } from '@/components/error-boundary';
import { RealCameraScan } from '@/components/RealCameraScan';

type FeedbackDetail = { label: string; value: string };
type FeedbackConfig = {
  type: 'success' | 'error' | 'confirm';
  title: string;
  description: string;
  details?: FeedbackDetail[];
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
};

type FeedbackContextType = {
  showSuccess: (opts: { title: string; description: string; details?: FeedbackDetail[]; confirmText?: string }) => void;
  showError: (opts: { title?: string; description: string }) => void;
  showConfirm: (opts: { title: string; description: string; confirmText?: string; cancelText?: string; onConfirm: () => void }) => void;
  closeFeedback: () => void;
};

const FeedbackContext = createContext<FeedbackContextType>({
  showSuccess: () => {},
  showError: () => {},
  showConfirm: () => {},
  closeFeedback: () => {},
});

function useFeedback() {
  return useContext(FeedbackContext);
}

function FeedbackModal({ config, onClose }: { config: FeedbackConfig | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!config) return null;

  const isSuccess = config.type === 'success';
  const isError = config.type === 'error';
  const isConfirm = config.type === 'confirm';

  const copyCredentials = () => {
    if (!config.details) return;
    const text = config.details.map((d) => `${d.label}: ${d.value}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="flex items-start gap-4">
          <div className={`modal-icon-badge ${config.type}`}>
            {isSuccess && <CheckCircle2 size={28} strokeWidth={2.2} />}
            {isError && <AlertCircle size={28} strokeWidth={2.2} />}
            {isConfirm && <HelpCircle size={28} strokeWidth={2.2} />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="eyebrow text-muted-foreground">
              {isSuccess ? 'Action Successful' : isError ? 'Operation Alert' : 'Confirmation Required'}
            </div>
            <h3 className="mt-1 text-xl font-extrabold tracking-tight text-foreground">{config.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{config.description}</p>
          </div>
          <button className="icon-action -mr-2 -mt-2" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {config.details && config.details.length > 0 && (
          <div className="modal-details-card">
            <div className="grid gap-1">
              {config.details.map((item) => (
                <div key={item.label} className="modal-detail-row">
                  <span>{item.label}</span>
                  {item.label.toLowerCase().includes('password') ? (
                    <MaskedSecret value={item.value} />
                  ) : (
                    <b>{item.value}</b>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex justify-end border-t border-border/60 pt-2.5">
              <button
                type="button"
                onClick={copyCredentials}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/10 transition"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied to clipboard!' : 'Copy details'}
              </button>
            </div>
          </div>
        )}

        <div className="modal-actions">
          {isConfirm ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                {config.cancelText || 'Cancel'}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  onClose();
                  config.onConfirm?.();
                }}
              >
                {config.confirmText || 'Yes, proceed'}
              </Button>
            </>
          ) : (
            <Button className="w-full sm:w-auto" onClick={onClose}>
              {config.confirmText || 'Done'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<FeedbackConfig | null>(null);

  const showSuccess = (opts: { title: string; description: string; details?: FeedbackDetail[]; confirmText?: string }) => {
    setConfig({ type: 'success', ...opts });
  };

  const showError = (opts: { title?: string; description: string }) => {
    setConfig({ type: 'error', title: opts.title || 'Action could not be completed', description: opts.description });
  };

  const showConfirm = (opts: { title: string; description: string; confirmText?: string; cancelText?: string; onConfirm: () => void }) => {
    setConfig({ type: 'confirm', ...opts });
  };

  const closeFeedback = () => setConfig(null);

  const value = useMemo(() => ({ showSuccess, showError, showConfirm, closeFeedback }), []);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <FeedbackModal config={config} onClose={closeFeedback} />
    </FeedbackContext.Provider>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 60 * 1000,
    },
  },
});
const demoResult = {
  hr: 68, rr: 15, sbp: 118, dbp: 76, spo2: 98, stressIndex: 31, wellnessScore: 8.4,
  cardiovascularAge: 36, cvdRiskPercentage: 2.8,
  healthRadar: { cardiovascular: 82, respiratory: 91, stress: 76, recovery: 88, metabolic: 79 },
  signalQuality: { overall: 94, facePosition: 96, lighting: 91 },
  lowConfidenceFlags: [], isMock: true,
};
const fmtDate = (date?: string | null) => date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not yet';
const initials = (value?: string) => (value || 'PC').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();

type ConsoleRole = 'admin' | 'tenant' | 'subscriber' | 'kiosk';
function Button({ children, variant = 'primary', className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; 'data-testid'?: string }) {
  const variants = {
    primary: 'bg-primary text-primary-foreground shadow-[0_8px_22px_hsl(163_49%_38%/.16)] hover:-translate-y-0.5',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-[hsl(190_30%_87%)]',
    ghost: 'bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground',
    danger: 'bg-[hsl(4_66%_53%/.1)] text-destructive hover:bg-[hsl(4_66%_53%/.16)]',
  };
  return <button data-testid={props['data-testid'] || 'button-action'} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`} {...props}>{children}</button>;
}

function Field({ label, className = '', type, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; 'data-testid'?: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <label className={`grid gap-1.5 text-sm font-semibold text-foreground ${className}`}>
      <span>{label}</span>
      <div className="relative flex items-center">
        <input
          type={inputType}
          data-testid={props['data-testid'] || `input-${label.toLowerCase().replaceAll(' ', '-')}`}
          className={`h-11 w-full rounded-xl border border-input bg-card px-3.5 font-normal outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 ${isPassword ? 'pr-11' : ''}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2.5 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            data-testid="button-toggle-password-visibility"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </label>
  );
}

function MaskedSecret({ value, className = '' }: { value: string; className?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <b className="font-mono text-primary select-all">
        {visible ? value : '••••••••••••'}
      </b>
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
        aria-label={visible ? 'Hide password' : 'Show password'}
        title={visible ? 'Hide password' : 'Show password'}
        data-testid="button-toggle-secret-visibility"
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </span>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/" data-testid="link-brand" className={`flex items-center gap-2.5 ${compact ? '' : 'mb-8'}`}><span className="brand-mark"><Signal size={17} strokeWidth={2.4} /></span><span className="font-display text-[18px] font-extrabold tracking-[-.04em] text-sidebar-foreground">Pro<span className="text-primary">CURE</span></span></Link>;
}

function StatusPill({ children, tone = 'good' }: { children: React.ReactNode; tone?: 'good' | 'warn' | 'neutral' | 'bad' }) {
  const colors = { good: 'bg-[hsl(163_49%_38%/.11)] text-primary', warn: 'bg-[hsl(38_80%_61%/.2)] text-[hsl(29_70%_34%)]', neutral: 'bg-secondary text-muted-foreground', bad: 'bg-[hsl(4_66%_53%/.11)] text-destructive' };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${colors[tone]}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{children}</span>;
}

function MetricCard({ label, value, hint, icon: Icon, tone = 'mint' }: { label: string; value: React.ReactNode; hint: string; icon: typeof Activity; tone?: 'mint' | 'amber' | 'blue' | 'plum' }) {
  const tones = { mint: 'bg-primary/10 text-primary', amber: 'bg-accent/20 text-[hsl(29_70%_34%)]', blue: 'bg-[hsl(198_60%_52%/.12)] text-[hsl(198_60%_38%)]', plum: 'bg-[hsl(271_37%_59%/.13)] text-[hsl(271_37%_49%)]' };
  return <div className="metric-card"><div className={`metric-icon ${tones[tone]}`}><Icon size={18} /></div><div className="mt-5 text-[12px] font-semibold uppercase tracking-[.08em] text-muted-foreground">{label}</div><div className="mt-1 font-display text-[30px] font-extrabold tracking-[-.05em]">{value}</div><div className="mt-1 text-xs text-muted-foreground">{hint}</div></div>;
}

function Skeleton({ className = '' }: { className?: string }) { return <div className={`animate-pulse rounded-lg bg-secondary ${className}`} />; }
function QueryState({ loading, error, children, retry }: { loading?: boolean; error?: boolean; children: React.ReactNode; retry?: () => void }) {
  if (loading) return <div className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-56 w-full" /></div>;
  if (error) return <div className="empty-state"><AlertCircle className="text-destructive" /><h3>We could not load this view</h3><p>Check your connection, then try again.</p><Button variant="secondary" onClick={retry} data-testid="button-retry">Retry</Button></div>;
  return <>{children}</>;
}

function usePanelView(defaultView: string) {
  const search = useSearch();
  const queryView = new URLSearchParams(search).get('view') || defaultView;
  const [view, setView] = useState(queryView);
  useEffect(() => setView(queryView), [queryView]);
  return [view, setView] as const;
}

function Shell({ role, children }: { role: 'admin' | 'tenant' | 'subscriber'; children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const search = useSearch();
  const [open, setOpen] = useState(false);
  const [topbarMessage, setTopbarMessage] = useState('');
  const logout = useLogout();
  const session = useGetSession({ query: { queryKey: getGetSessionQueryKey(), retry: false } });
  const currentUser = session.data?.user;
  const links = role === 'admin'
    ? [{ href: '/admin', label: 'Platform overview', icon: LayoutDashboard }, { href: '/admin?view=tenants', label: 'Tenants', icon: Building2 }, { href: '/admin?view=analytics', label: 'Analytics', icon: Activity }, { href: '/admin?view=staff', label: 'Staff & access', icon: Users }]
    : role === 'tenant'
      ? [{ href: '/tenant', label: 'Console overview', icon: LayoutDashboard }, { href: '/tenant?view=subscribers', label: 'Subscribers', icon: Users }, { href: '/tenant?view=kiosk', label: 'Kiosk mode', icon: Laptop }, { href: '/tenant?view=devices', label: 'Devices', icon: Laptop }, { href: '/tenant?view=usage', label: 'Usage & exports', icon: ClipboardList }, { href: '/tenant?view=settings', label: 'Workspace settings', icon: Settings2 }]
      : [{ href: '/subscriber', label: 'My overview', icon: LayoutDashboard }, { href: '/subscriber?view=scans', label: 'Scan history', icon: Activity }, { href: '/subscriber?view=tracking', label: 'Health tracking', icon: HeartPulse }, { href: '/subscriber?view=profile', label: 'Profile & consent', icon: ShieldCheck }];
  const userName = currentUser?.name || currentUser?.email || (role === 'admin' ? 'Super Admin' : role === 'tenant' ? 'Workspace Admin' : 'Subscriber');
  const userRoleTitle = currentUser?.role === 'super_admin' ? 'Super Admin' : currentUser?.role === 'tenant_admin' ? 'Workspace Admin' : currentUser?.role === 'tenant_staff' ? 'Staff' : currentUser?.role === 'kiosk_operator' ? 'Kiosk Operator' : role === 'admin' ? 'Super Admin' : role === 'tenant' ? 'Workspace Admin' : 'Subscriber';
  const currentPath = location;
  const currentView = new URLSearchParams(search).get('view');
  const announce = (message: string) => { setTopbarMessage(message); window.setTimeout(() => setTopbarMessage(''), 3200); };
  return <div className="app-frame"><aside className={`side-rail ${open ? 'is-open' : ''}`}><div className="flex items-center justify-between"><Brand compact /><button type="button" className="text-sidebar-foreground md:hidden" onClick={() => setOpen(false)} data-testid="button-close-menu" aria-label="Close navigation"><X size={20} /></button></div><div className="rail-context"><span className="context-dot" />{role === 'admin' ? 'ProCURE network' : role === 'tenant' ? 'Workspace Console' : 'Personal health record'}</div><nav className="mt-7 grid gap-1">{links.map(({ href, label, icon: Icon }) => { const linkView = new URLSearchParams(href.split('?')[1] || '').get('view'); const active = currentPath === href.split('?')[0] && (linkView ? currentView === linkView : !currentView); return <Link key={href} href={href} onClick={() => setOpen(false)} data-testid={`link-${label.toLowerCase().replaceAll(' ', '-')}`} className={`rail-link ${active ? 'active' : ''}`}><Icon size={17} />{label}</Link>; })}</nav><div className="mt-auto"><div className="rail-help"><CircleHelp size={16} /><div><div className="font-semibold text-sidebar-foreground">Need a hand?</div><div className="mt-1 text-[11px] text-sidebar-foreground/60">Support is online</div></div></div><button type="button" onClick={() => logout.mutate(undefined, { onSuccess: () => setLocation('/login') })} data-testid="button-sign-out" className="rail-link mt-3 w-full text-left"><LogOut size={17} />Sign out</button></div></aside><main className="main-column"><header className="topbar"><button type="button" className="mr-3 rounded-lg p-2 text-muted-foreground hover:bg-secondary md:hidden" onClick={() => setOpen(true)} data-testid="button-open-menu" aria-label="Open navigation"><Menu size={20} /></button><div className="hidden text-xs font-semibold text-muted-foreground sm:block"><span className="text-primary">Workspace</span><span className="mx-2 text-border">/</span>{role === 'admin' ? 'Platform operations' : role === 'tenant' ? 'Workspace Console' : 'My health'}</div><div className="topbar-actions"><button type="button" className="top-icon" onClick={() => announce('Support is online. Your workspace administrator can help with account access.')} data-testid="button-help" aria-label="Open help"><CircleHelp size={18} /></button><button type="button" className="top-icon relative" onClick={() => announce('Notifications are shown in the recent activity panels.')} data-testid="button-notifications" aria-label="Show notifications"><Bell size={18} /><span className="notification-dot" /></button><div className="avatar">{initials(userName)}</div><div className="hidden text-right sm:block"><div className="text-xs font-bold">{userName}</div><div className="text-[11px] text-muted-foreground">{userRoleTitle}</div></div><ChevronDown size={14} className="text-muted-foreground" /></div>{topbarMessage && <div className="topbar-message" role="status">{topbarMessage}</div>}</header><div className="page-content">{children}</div></main></div>;
}

function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="eyebrow">{eyebrow}</div><h1 className="page-title">{title}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p></div>{action}</div>;
}

function Login() {
  const [, setLocation] = useLocation();
  const login = useLogin();
  const [mfa, setMfa] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', mfaCode: '' });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    login.mutate(
      { data: { email: form.email, password: form.password, mfaCode: mfa ? form.mfaCode : null } },
      {
        onSuccess: (session) => {
          if (session.requiresMfa && !mfa) setMfa(true);
          else {
            queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() });
            const dest = getSessionPolicy(session.user)?.destination || '/subscriber';
            setLocation(dest);
          }
        },
      }
    );
  };
  return (
    <div className="auth-layout">
      <section className="auth-aside">
        <Brand />
        <div className="auth-aside-copy">
          <div className="signal-orbit">
            <div className="orbit-ring ring-one" />
            <div className="orbit-ring ring-two" />
            <div className="orbit-core"><HeartPulse size={42} /></div>
          </div>
          <div className="eyebrow text-primary">A clearer signal</div>
          <h1>Health data,<br /><span>held with care.</span></h1>
          <p>ProCURE turns a quiet moment into a useful picture of your wellbeing — for people, providers, and the teams who support them.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-sidebar-foreground/60">
          <ShieldCheck size={14} /> Secure by design · Built for thoughtful care
        </div>
      </section>
      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <div className="mb-10 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">Welcome back</span>
            <Link href="/register" className="text-xs font-bold text-primary hover:underline" data-testid="link-register">
              Create account <ArrowRight size={13} className="ml-1 inline" />
            </Link>
          </div>
          <h2>{mfa ? 'Confirm it is you' : 'Sign in to ProCURE'}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {mfa ? 'Enter the six-digit code from your authenticator app.' : 'Enter your email address and password to continue.'}
          </p>
          <form className="mt-7 grid gap-4" onSubmit={submit}>
            {mfa ? (
              <>
                <div className="mfa-shield">
                  <KeyRound size={19} />
                  <div>
                    <b>Extra protection enabled</b>
                    <span>Super Admin accounts use MFA at sign-in. Demo code: <strong>123456</strong></span>
                  </div>
                </div>
                <Field
                  label="Authentication code"
                  inputMode="numeric"
                  maxLength={6}
                  value={form.mfaCode}
                  onChange={(e) => setForm({ ...form, mfaCode: e.target.value })}
                  placeholder="000 000"
                  data-testid="input-mfa-code"
                />
              </>
            ) : (
              <>
                <Field
                  label="Email address"
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  data-testid="input-login-email"
                />
                <Field
                  label="Password"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  data-testid="input-login-password"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => window.alert('Password recovery is managed by your workspace administrator.')}
                    className="text-xs font-bold text-primary"
                    data-testid="button-forgot-password"
                  >
                    Forgot password?
                  </button>
                </div>
              </>
            )}
            <Button type="submit" className="mt-2 w-full" disabled={login.isPending} data-testid="button-submit-login">
              {login.isPending ? 'Signing in…' : mfa ? 'Verify and continue' : 'Sign in'}
              <ArrowRight size={16} />
            </Button>
            {login.isError && (
              <div className="form-error" data-testid="status-login-error">
                <AlertCircle size={15} /> Sign-in details were not accepted. Please check your email and password.
              </div>
            )}
          </form>
        </div>
      </section>
    </div>
  );
}

function Register() {
  const [, setLocation] = useLocation();
  const register = useRegisterSubscriber();
  const [form, setForm] = useState({ name: '', email: '', phone: '', dob: '', sex: '', password: '', initialCredits: 0 });
  const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: key === 'initialCredits' ? Number(value) : value }));
  return <div className="auth-layout auth-register"><section className="auth-aside"><Brand /><div className="auth-aside-copy"><div className="eyebrow text-primary">Your baseline, understood</div><h1>Make space<br /><span>for your health.</span></h1><p>Create a private account to follow your scans over time, with a calm view of the signals that matter.</p><div className="mini-stat"><div className="mini-stat-line"><span>Signal quality</span><span className="font-mono text-primary">94 / 100</span></div><div className="signal-bar"><span /></div><div className="mt-2 text-xs text-sidebar-foreground/55">Your results stay yours.</div></div></div><div className="text-xs text-sidebar-foreground/60">Already have access? <Link href="/login" className="font-bold text-primary" data-testid="link-login">Sign in</Link></div></section><section className="auth-form-side"><div className="auth-form-wrap max-w-xl"><div className="mb-8 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[.13em] text-muted-foreground">Private self-signup</span><span className="step-count">01 <span>/ 02</span></span></div><h2>Create your account</h2><p className="mt-2 text-sm text-muted-foreground">A few details help us keep your record accurate.</p><form className="mt-7 grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); register.mutate({ data: { ...form, heightCm: null, weightKg: null } }, { onSuccess: () => setLocation('/subscriber') }); }}><Field label="Full name" required value={form.name} onChange={(e) => update('name', e.target.value)} className="sm:col-span-2" data-testid="input-register-name" /><Field label="Email address" type="email" required value={form.email} onChange={(e) => update('email', e.target.value)} data-testid="input-register-email" /><Field label="Phone number" required value={form.phone} onChange={(e) => update('phone', e.target.value)} data-testid="input-register-phone" /><Field label="Date of birth" type="date" required value={form.dob} onChange={(e) => update('dob', e.target.value)} data-testid="input-register-dob" /><label className="grid gap-1.5 text-sm font-semibold"><span>Sex</span><select className="h-11 rounded-xl border border-input bg-card px-3.5 font-normal outline-none focus:border-primary" value={form.sex} onChange={(e) => update('sex', e.target.value)} data-testid="select-register-sex"><option value="">Select</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></select></label><Field label="Password" type="password" required minLength={6} value={form.password} onChange={(e) => update('password', e.target.value)} className="sm:col-span-2" data-testid="input-register-password" /><div className="sm:col-span-2 rounded-xl bg-secondary p-3 text-xs leading-relaxed text-muted-foreground"><ShieldCheck size={14} className="mr-1 inline text-primary" /> We use your information only to create and protect your health record.</div><Button className="sm:col-span-2" type="submit" disabled={register.isPending} data-testid="button-submit-register">{register.isPending ? 'Creating your record…' : 'Create private account'}<ArrowRight size={16} /></Button>{register.isError && <div className="form-error sm:col-span-2"><AlertCircle size={15} /> We could not create that account. Check each field and try again.</div>}</form></div></section></div>;
}

function AdminTenantDetailPage() {
  const [, params] = useRoute('/admin/tenants/:id');
  const [, navigate] = useLocation();
  const feedback = useFeedback();
  const tenantId = params?.id || '';
  const tenantQuery = useGetTenant(tenantId, { query: { queryKey: getGetTenantQueryKey(tenantId), enabled: Boolean(tenantId), retry: 1 } });
  const updateTenant = useUpdateTenant();
  const deleteTenant = useDeleteTenant();
  const allocateCredit = useAllocateTenantCredit();

  const [editModal, setEditModal] = useState(false);
  const [creditModal, setCreditModal] = useState(false);
  const [creditAmount, setCreditAmount] = useState(100);
  const [creditNote, setCreditNote] = useState('Platform grant');
  const [editForm, setEditForm] = useState({
    name: '',
    type: 'clinic',
    address: '',
    adminName: '',
    adminEmail: '',
    adminPhone: '',
    status: 'active',
    kioskEnabled: false,
  });

  const tenant: any = tenantQuery.data;
  const adminUser = tenant?.adminUser;
  const subscribers: any[] = tenant?.subscribers || [];
  const devices: any[] = tenant?.devices || [];
  const staff: any[] = tenant?.staff || [];
  const ledger: any[] = tenant?.ledger || [];

  useEffect(() => {
    if (tenant) {
      setEditForm({
        name: tenant.name || '',
        type: tenant.type || 'clinic',
        address: tenant.address || '',
        adminName: adminUser?.name || tenant.adminName || tenant.admin_name || '',
        adminEmail: adminUser?.email || tenant.adminEmail || tenant.admin_email || '',
        adminPhone: adminUser?.phone || tenant.adminPhone || tenant.admin_phone || '',
        status: tenant.status || 'active',
        kioskEnabled: Boolean(tenant.kioskEnabled),
      });
    }
  }, [tenant, adminUser]);

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    updateTenant.mutate({ id: tenantId, data: editForm }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(tenantId) });
        queryClient.invalidateQueries({ queryKey: getListTenantsQueryKey() });
        setEditModal(false);
        feedback.showSuccess({
          title: 'Workspace Settings Saved!',
          description: `${editForm.name} organization details have been saved to Supabase.`,
        });
      },
      onError: (err: any) => feedback.showError({ description: err.message }),
    });
  };

  const handleToggleStatus = () => {
    const nextStatus = tenant?.status === 'active' ? 'suspended' : 'active';
    feedback.showConfirm({
      title: `${nextStatus === 'active' ? 'Activate' : 'Deactivate'} ${tenant?.name}?`,
      description: nextStatus === 'active'
        ? 'Activating this workspace restores access for all administrators, operators, and subscribers.'
        : 'Deactivating this workspace will prevent login and kiosk scans until re-activated.',
      confirmText: nextStatus === 'active' ? 'Activate workspace' : 'Deactivate workspace',
      onConfirm: () => {
        updateTenant.mutate({ id: tenantId, data: { status: nextStatus } }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(tenantId) });
            queryClient.invalidateQueries({ queryKey: getListTenantsQueryKey() });
            feedback.showSuccess({
              title: 'Workspace Status Updated',
              description: `${tenant?.name} is now ${nextStatus === 'active' ? 'Active' : 'Deactivated'}.`,
            });
          },
          onError: (err: any) => feedback.showError({ description: err.message }),
        });
      },
    });
  };

  const handleToggleKiosk = () => {
    const nextKiosk = !tenant?.kioskEnabled;
    feedback.showConfirm({
      title: `${nextKiosk ? 'Enable' : 'Disable'} Kiosk Mode for ${tenant?.name}?`,
      description: nextKiosk
        ? 'Staff will be able to launch walk-in guest scan stations using workspace credits.'
        : 'Walk-in kiosk access will be locked for this workspace.',
      confirmText: nextKiosk ? 'Enable kiosk' : 'Disable kiosk',
      onConfirm: () => {
        updateTenant.mutate({ id: tenantId, data: { kioskEnabled: nextKiosk } }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(tenantId) });
            queryClient.invalidateQueries({ queryKey: getListTenantsQueryKey() });
            feedback.showSuccess({
              title: 'Kiosk Feature Updated',
              description: `Kiosk access is now ${nextKiosk ? 'Enabled' : 'Disabled'} for ${tenant?.name}.`,
            });
          },
          onError: (err: any) => feedback.showError({ description: err.message }),
        });
      },
    });
  };

  const handleAllocate = (e: React.FormEvent) => {
    e.preventDefault();
    allocateCredit.mutate({ id: tenantId, data: { amount: creditAmount, note: creditNote } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetTenantQueryKey(tenantId) });
        queryClient.invalidateQueries({ queryKey: getListTenantsQueryKey() });
        setCreditModal(false);
        feedback.showSuccess({
          title: 'Credits Allocated!',
          description: `Allocated ${creditAmount} credits to ${tenant?.name}.`,
          details: [
            { label: 'Workspace', value: tenant?.name || '' },
            { label: 'Amount', value: `+${creditAmount} credits` },
            { label: 'Note', value: creditNote },
          ],
        });
      },
      onError: (err: any) => feedback.showError({ description: err.message }),
    });
  };

  const handleDelete = () => {
    feedback.showConfirm({
      title: `Delete Workspace: ${tenant?.name}?`,
      description: 'Are you sure? This will archive this tenant workspace, deactivate all associated member accounts, and remove kiosk permissions from Supabase.',
      confirmText: 'Yes, delete workspace',
      cancelText: 'Cancel',
      onConfirm: () => {
        deleteTenant.mutate({ id: tenantId }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListTenantsQueryKey() });
            feedback.showSuccess({
              title: 'Workspace Deleted',
              description: `${tenant?.name} has been archived successfully.`,
            });
            navigate('/admin?view=tenants');
          },
          onError: (err: any) => feedback.showError({ description: err.message }),
        });
      },
    });
  };

  const copyAdminInfo = () => {
    const email = adminUser?.email || tenant?.adminEmail || tenant?.admin_email || '';
    const name = adminUser?.name || tenant?.adminName || tenant?.admin_name || 'Administrator';
    const text = `Workspace: ${tenant?.name}\nAdmin Name: ${name}\nAdmin Email: ${email}\nTemporary Password: Password123!\nLogin URL: ${window.location.origin}/login`;
    navigator.clipboard.writeText(text);
    feedback.showSuccess({
      title: 'Credentials Copied!',
      description: 'Admin login email, temporary password, and instructions copied to clipboard.',
      details: [
        { label: 'Workspace', value: tenant?.name || '' },
        { label: 'Admin Email', value: email },
        { label: 'Temporary Password', value: 'Password123!' },
      ],
    });
  };

  return (
    <Shell role="admin">
      <PageHeader
        eyebrow="Super Admin · Workspace directory · Tenant details"
        title={tenant?.name || 'Workspace details'}
        description={`Organization Type: ${tenant?.type || 'General'} · Physical Address: ${tenant?.address || 'Not recorded'}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/admin?view=tenants')}>
              <ArrowRight size={16} className="rotate-180" />
              Back to tenants
            </Button>
            <Button variant="secondary" onClick={() => setCreditModal(true)}>
              <Wallet size={16} />
              Allocate credits
            </Button>
            <Button variant="secondary" onClick={() => setEditModal(true)}>
              <Pencil size={16} />
              Edit workspace
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              <X size={16} />
              Delete workspace
            </Button>
          </div>
        }
      />
      <QueryState loading={tenantQuery.isLoading} error={tenantQuery.isError} retry={() => tenantQuery.refetch()}>
        <div className="metrics-grid">
          <MetricCard label="Credit balance" value={`${tenant?.creditBalance ?? 0}`} hint="Ready for scans" icon={Wallet} />
          <MetricCard label="Completed scans" value={tenant?.creditsConsumed ?? 0} hint="Total workspace scan volume" icon={Activity} tone="blue" />
          <MetricCard label="Kiosk status" value={tenant?.kioskEnabled ? 'Enabled' : 'Disabled'} hint={tenant?.kioskEnabled ? 'Walk-in scanning active' : 'Kiosk access locked'} icon={Laptop} tone="amber" />
          <MetricCard label="Hardware stations" value={devices.length} hint={`${devices.length} registered scanner(s)`} icon={Building2} tone="plum" />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Workspace Settings & Controls */}
          <div className="panel flex flex-col justify-between">
            <div>
              <div className="panel-heading">
                <div>
                  <h3>Workspace profile & controls</h3>
                  <p>Organization configurations and permissions</p>
                </div>
                <StatusPill tone={tenant?.status === 'active' ? 'good' : 'bad'}>
                  {tenant?.status === 'active' ? 'Active' : 'Deactivated'}
                </StatusPill>
              </div>
              <div className="subscriber-detail-meta">
                <div>
                  <span>Workspace Name</span>
                  <b>{tenant?.name}</b>
                </div>
                <div>
                  <span>Organization Type</span>
                  <b className="capitalize">{tenant?.type}</b>
                </div>
                <div>
                  <span>Physical Address</span>
                  <b>{tenant?.address || '—'}</b>
                </div>
                <div>
                  <span>Workspace ID</span>
                  <b className="font-mono text-xs">{tenant?.id}</b>
                </div>
                <div>
                  <span>Created Date</span>
                  <b>{fmtDate(tenant?.createdAt)}</b>
                </div>
                <div>
                  <span>Last Active</span>
                  <b>{fmtDate(tenant?.lastActive)}</b>
                </div>
              </div>
            </div>
            <div className="panel-footer flex-wrap">
              <Button variant={tenant?.status === 'active' ? 'danger' : 'secondary'} onClick={handleToggleStatus}>
                {tenant?.status === 'active' ? 'Deactivate workspace' : 'Activate workspace'}
              </Button>
              <Button variant="secondary" onClick={handleToggleKiosk}>
                <Laptop size={15} />
                {tenant?.kioskEnabled ? 'Disable kiosk feature' : 'Enable kiosk feature'}
              </Button>
              <Button variant="secondary" onClick={() => setEditModal(true)}>
                <Pencil size={15} />
                Edit details
              </Button>
            </div>
          </div>

          {/* Admin User Credentials */}
          <div className="panel flex flex-col justify-between">
            <div>
              <div className="panel-heading">
                <div>
                  <h3>Tenant administrator account</h3>
                  <p>Primary manager credentials for this workspace</p>
                </div>
                <KeyRound className="text-primary" size={19} />
              </div>
              <div className="subscriber-detail-meta">
                <div>
                  <span>Admin Name</span>
                  <b>{adminUser?.name || tenant?.adminName || tenant?.admin_name || 'Workspace Admin'}</b>
                </div>
                <div>
                  <span>Login Email</span>
                  <b>{adminUser?.email || tenant?.adminEmail || tenant?.admin_email || '—'}</b>
                </div>
                <div>
                  <span>Phone / WhatsApp</span>
                  <b>{adminUser?.phone || tenant?.adminPhone || tenant?.admin_phone || '—'}</b>
                </div>
                <div>
                  <span>Account Role</span>
                  <b>Tenant Admin (tenant_admin)</b>
                </div>
                <div>
                  <span>Default Password</span>
                  <MaskedSecret value="Password123!" />
                </div>
                <div>
                  <span>Access Status</span>
                  <b>{adminUser?.status || 'Active'}</b>
                </div>
              </div>
            </div>
            <div className="panel-footer">
              <Button variant="secondary" className="w-full" onClick={copyAdminInfo}>
                <Copy size={15} />
                Copy admin login credentials
              </Button>
            </div>
          </div>
        </div>

        {/* Devices & Ledger Grid */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Connected Devices */}
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h3>Registered hardware stations ({devices.length})</h3>
                <p>Kiosk scanners connected to this workspace</p>
              </div>
              <Laptop className="text-primary" size={19} />
            </div>
            <div className="device-grid">
              {devices.map((device: any) => (
                <div className="device-card" key={device.id}>
                  <div className="flex items-center justify-between">
                    <span className="device-icon"><Laptop size={18} /></span>
                    <StatusPill>Online</StatusPill>
                  </div>
                  <b>{device.label}</b>
                  <small>{device.location} · {device.type}</small>
                </div>
              ))}
              {!devices.length && (
                <div className="empty-state">
                  <Laptop />
                  <h3>No devices registered</h3>
                  <p>Devices added by the tenant admin will appear here.</p>
                </div>
              )}
            </div>
          </div>

          {/* Credit Ledger */}
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h3>Credit transaction history</h3>
                <p>Platform allocations and usage</p>
              </div>
              <Wallet className="text-primary" size={19} />
            </div>
            <div className="request-list">
              {ledger.slice(0, 6).map((entry: any) => (
                <div className="request-item" key={entry.id}>
                  <span className={`table-avatar ${entry.amount > 0 ? '' : 'amber'}`}>
                    {entry.amount > 0 ? '+' : '-'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <b>{entry.note || (entry.amount > 0 ? 'Credit grant' : 'Credit consumption')}</b>
                    <small>{fmtDate(entry.createdAt)} · Type: {entry.type}</small>
                  </div>
                  <b className={`font-mono text-xs ${entry.amount > 0 ? 'text-primary' : 'text-amber-500'}`}>
                    {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                  </b>
                </div>
              ))}
              {!ledger.length && (
                <div className="empty-inline">No credit transactions recorded yet.</div>
              )}
            </div>
          </div>
        </div>
      </QueryState>

      {/* Edit Workspace Modal */}
      {editModal && (
        <Modal title={`Edit ${tenant?.name}`} onClose={() => setEditModal(false)}>
          <form className="grid gap-4" onSubmit={handleUpdate}>
            <Field
              label="Workspace name"
              required
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            />
            <label className="grid gap-1.5 text-sm font-semibold">
              <span>Organization type</span>
              <select
                className="h-11 rounded-xl border border-input bg-card px-3.5 font-normal"
                value={editForm.type}
                onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
              >
                <option value="clinic">Clinic</option>
                <option value="gym">Gym / Fitness Center</option>
                <option value="hospital">Hospital</option>
                <option value="corporate">Corporate Wellness</option>
                <option value="care_home">Care Home</option>
                <option value="wellness">Wellness Center</option>
                <option value="pharmacy">Pharmacy</option>
              </select>
            </label>
            <Field
              label="Physical address"
              value={editForm.address}
              onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Admin full name"
                required
                value={editForm.adminName}
                onChange={(e) => setEditForm({ ...editForm, adminName: e.target.value })}
              />
              <Field
                label="Admin login email"
                type="email"
                required
                value={editForm.adminEmail}
                onChange={(e) => setEditForm({ ...editForm, adminEmail: e.target.value })}
              />
            </div>
            <Field
              label="Admin phone / WhatsApp"
              value={editForm.adminPhone}
              onChange={(e) => setEditForm({ ...editForm, adminPhone: e.target.value })}
            />
            <div className="consent-toggle">
              <div>
                <b>Walk-in kiosk feature</b>
                <span>Allow staff to register walk-in guests and run kiosk scans.</span>
              </div>
              <button
                type="button"
                className={`switch ${editForm.kioskEnabled ? 'on' : ''}`}
                onClick={() => setEditForm({ ...editForm, kioskEnabled: !editForm.kioskEnabled })}
              >
                <span />
              </button>
            </div>
            <div className="consent-toggle">
              <div>
                <b>Workspace active status</b>
                <span>When deactivated, members and staff cannot log in.</span>
              </div>
              <button
                type="button"
                className={`switch ${editForm.status === 'active' ? 'on' : ''}`}
                onClick={() => setEditForm({ ...editForm, status: editForm.status === 'active' ? 'suspended' : 'active' })}
              >
                <span />
              </button>
            </div>
            <div className="flex gap-2 justify-end mt-2">
              <Button variant="ghost" type="button" onClick={() => setEditModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateTenant.isPending}>
                Save workspace details
                <Check size={16} />
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Allocate Credit Modal */}
      {creditModal && (
        <Modal title={`Allocate credits to ${tenant?.name}`} onClose={() => setCreditModal(false)}>
          <form className="grid gap-4" onSubmit={handleAllocate}>
            <p className="text-sm text-muted-foreground">
              Credits will be immediately added to the workspace balance and saved to Supabase.
            </p>
            <Field
              label="Credit amount"
              type="number"
              min={1}
              required
              value={creditAmount}
              onChange={(e) => setCreditAmount(Number(e.target.value))}
            />
            <Field
              label="Allocation note"
              value={creditNote}
              onChange={(e) => setCreditNote(e.target.value)}
            />
            <div className="flex gap-2 justify-end mt-2">
              <Button variant="ghost" type="button" onClick={() => setCreditModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={allocateCredit.isPending}>
                Allocate credits
                <Wallet size={16} />
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Shell>
  );
}

function AdminTenantsView({ tenants, pending, onAdd, onAllocate, onUpdate, onArchive }: any) {
  const [, navigate] = useLocation();
  const managed = tenants.filter((tenant: any) => !tenant.isPrivateTenant);
  const activeCount = managed.filter((tenant: any) => tenant.status === 'active').length;
  const kioskCount = managed.filter((tenant: any) => tenant.kioskEnabled).length;
  return (
    <>
      <PageHeader
        eyebrow="Super Admin · Tenant operations"
        title="Tenant workspaces"
        description="Control workspace access, kiosk availability, credits, and lifecycle from one place."
        action={
          <Button onClick={onAdd} data-testid="button-add-tenant-secondary">
            <Plus size={16} />
            Add tenant
          </Button>
        }
      />
      <div className="metrics-grid">
        <MetricCard label="Active tenants" value={activeCount} hint={`${managed.length - activeCount} currently deactivated`} icon={Building2} />
        <MetricCard label="Kiosk enabled" value={kioskCount} hint={`${managed.length - kioskCount} without kiosk access`} icon={Laptop} tone="blue" />
        <MetricCard label="Tenant subscribers" value={managed.reduce((sum: number, tenant: any) => sum + tenant.subscriberCount, 0)} hint="Across managed workspaces" icon={Users} tone="amber" />
        <MetricCard label="Available credits" value={managed.reduce((sum: number, tenant: any) => sum + tenant.creditBalance, 0)} hint="Ready for tenant scans" icon={Wallet} tone="plum" />
      </div>
      <div className="panel mt-6 overflow-hidden">
        <div className="panel-heading px-5 pt-5">
          <div>
            <h3>Workspace controls</h3>
            <p>Click any workspace row to view full details, subscribers, devices, admin credentials, and edit or delete controls.</p>
          </div>
          <ShieldCheck className="text-primary" size={19} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Access</th>
                <th>Kiosk feature</th>
                <th>Subscribers</th>
                <th>Credits</th>
                <th>Controls</th>
              </tr>
            </thead>
            <tbody>
              {managed.map((tenant: any) => (
                <tr
                  key={tenant.id}
                  className="clickable-row"
                  tabIndex={0}
                  onClick={() => navigate(`/admin/tenants/${tenant.id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/admin/tenants/${tenant.id}`); }}
                  data-testid={`admin-tenant-${tenant.id}`}
                >
                  <td>
                    <div className="flex items-center gap-3">
                      <span className="table-avatar">{initials(tenant.name)}</span>
                      <div>
                        <b className="hover:text-primary transition-colors">{tenant.name}</b>
                        <small>{tenant.type} · {tenant.address}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <StatusPill tone={tenant.status === 'active' ? 'good' : 'bad'}>
                      {tenant.status === 'active' ? 'Active' : 'Deactivated'}
                    </StatusPill>
                  </td>
                  <td>
                    <StatusPill tone={tenant.kioskEnabled ? 'good' : 'neutral'}>
                      {tenant.kioskEnabled ? 'Enabled' : 'Disabled'}
                    </StatusPill>
                  </td>
                  <td className="font-mono text-xs">{tenant.subscriberCount}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="text-left" onClick={() => onAllocate(tenant.id)} data-testid={`button-credit-tenant-${tenant.id}`}>
                      <b className="font-mono text-xs text-primary">{tenant.creditBalance}</b>
                      <small> allocate</small>
                    </button>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => navigate(`/admin/tenants/${tenant.id}`)}>
                        <Eye size={14} />
                        Details
                      </Button>
                      <Button
                        variant={tenant.status === 'active' ? 'danger' : 'secondary'}
                        className="px-3 py-2 text-xs"
                        disabled={pending}
                        onClick={() => onUpdate(tenant, { status: tenant.status === 'active' ? 'suspended' : 'active' })}
                        data-testid={`button-toggle-tenant-${tenant.id}`}
                      >
                        {tenant.status === 'active' ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button
                        variant="secondary"
                        className="px-3 py-2 text-xs"
                        disabled={pending}
                        onClick={() => onUpdate(tenant, { kioskEnabled: !tenant.kioskEnabled })}
                        data-testid={`button-toggle-kiosk-${tenant.id}`}
                      >
                        <Laptop size={14} />
                        {tenant.kioskEnabled ? 'Disable kiosk' : 'Enable kiosk'}
                      </Button>
                      <button
                        type="button"
                        className="icon-action text-destructive"
                        aria-label={`Archive ${tenant.name}`}
                        onClick={() => onArchive(tenant)}
                        data-testid={`button-delete-tenant-${tenant.id}`}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!managed.length && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-inline">No managed tenant workspaces yet.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function AdminAnalyticsView({ analytics, loading, error, retry }: any) {
  const data = analytics || {};
  const topTenants = data.topTenants || [];
  const trend = data.trend || [];
  const maxScans = Math.max(...topTenants.map((tenant: any) => tenant.scans), 1);
  const maxTrend = Math.max(...trend.map((item: any) => item.scans), 1);
  return <><PageHeader eyebrow="Super Admin · Network intelligence" title="Tenant analytics" description="Compare adoption, scan activity, and credit consumption across every managed workspace." /><QueryState loading={loading} error={error} retry={retry}><div className="metrics-grid"><MetricCard label="Total tenants" value={data.totalTenants ?? 0} hint={`${data.activeTenants ?? 0} currently active`} icon={Building2} /><MetricCard label="Subscribers" value={(data.totalSubscribers ?? 0).toLocaleString()} hint="Across the ProCURE network" icon={Users} tone="blue" /><MetricCard label="Completed scans" value={(data.totalScans ?? 0).toLocaleString()} hint="All recorded tenant activity" icon={Activity} tone="amber" /><MetricCard label="Credits consumed" value={(data.creditsConsumed ?? 0).toLocaleString()} hint={`${data.creditsIssued ?? 0} issued in total`} icon={Wallet} tone="plum" /></div><div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_.8fr]"><div className="panel"><div className="panel-heading"><div><h3>Network scan trend</h3><p>Completed scans and credit activity by period.</p></div><Activity className="text-primary" size={19} /></div><div className="activity-chart">{trend.map((item: any, index: number) => <div className="chart-col" key={item.label}><div className="chart-value">{item.scans}</div><div className="chart-track"><div className="chart-bar" style={{ height: `${Math.max(item.scans / maxTrend * 100, 8)}%`, animationDelay: `${index * 60}ms` }} /></div><div className="chart-label">{item.label}</div></div>)}</div></div><div className="panel"><div className="panel-heading"><div><h3>Tenant ranking</h3><p>Completed scans by workspace.</p></div><Building2 className="text-primary" size={19} /></div><div className="rank-list">{topTenants.map((tenant: any, index: number) => <div className="rank-row" key={tenant.name}><span className="rank-number">{String(index + 1).padStart(2, '0')}</span><b>{tenant.name}</b><div className="rank-bar"><span style={{ width: `${Math.max(6, tenant.scans / maxScans * 100)}%` }} /></div><span className="font-mono text-xs">{tenant.scans} scans</span></div>)}{!topTenants.length && <div className="empty-inline">Tenant activity will appear after the first completed scan.</div>}</div></div></div></QueryState></>;
}

function AdminStaffView({ staff, loading, error, retry, onInvite, onSaveSettings }: any) {
  return <><PageHeader eyebrow="Super Admin · Platform governance" title="Staff & access" description="Review every platform-level account and keep administrative access narrow, clear, and auditable." action={<Button onClick={onInvite} data-testid="button-add-staff"><Plus size={16} />Invite staff</Button>} /><QueryState loading={loading} error={error} retry={retry}><div className="metrics-grid"><MetricCard label="Platform staff" value={staff.length} hint="Non-tenant operational accounts" icon={Users} /><MetricCard label="Active access" value={staff.filter((person: any) => person.status === 'active').length} hint="Accounts able to sign in" icon={ShieldCheck} tone="blue" /><MetricCard label="Support roles" value={staff.filter((person: any) => person.subRole === 'support').length} hint="Customer support access" icon={CircleHelp} tone="amber" /><MetricCard label="Suspended" value={staff.filter((person: any) => person.status === 'suspended').length} hint="Accounts with access removed" icon={KeyRound} tone="plum" /></div><div className="panel mt-6"><div className="panel-heading"><div><h3>Platform access directory</h3><p>Platform staff do not inherit tenant ownership or subscriber access.</p></div><ShieldCheck className="text-primary" size={19} /></div><div className="staff-grid">{staff.map((person: any) => <article className="staff-card" key={person.id}><span className="table-avatar">{initials(person.name)}</span><div className="min-w-0"><b>{person.name}</b><small>{person.email}</small><small>{person.subRole?.replaceAll('_', ' ') || 'Platform staff'}</small></div><StatusPill tone={person.status === 'active' ? 'good' : 'bad'}>{person.status}</StatusPill></article>)}{!staff.length && <div className="empty-inline">No platform staff records yet.</div>}</div><div className="settings-strip"><div><b>Default credit grant</b><small>Applied to new private subscriber accounts</small></div><Button variant="secondary" onClick={onSaveSettings} data-testid="button-save-admin-settings"><Check size={15} />Save 100 credits</Button></div></div></QueryState></>;
}

function AdminDashboard() {
  const feedback = useFeedback();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), retry: false } });
  const overview = useGetAdminOverview({ query: { queryKey: getGetAdminOverviewQueryKey(), retry: 1 } });
  const tenants = useListTenants({ query: { queryKey: getListTenantsQueryKey(), retry: 1 } });
  const analytics = useGetAdminAnalytics({ query: { queryKey: getGetAdminAnalyticsQueryKey(), retry: 1 } });
  const privateSubscribers = useListPrivateSubscribers({ query: { queryKey: getListPrivateSubscribersQueryKey(), retry: 1 } });
  const topups = useListPrivateTopups({ query: { queryKey: getListPrivateTopupsQueryKey(), retry: 1 } });
  const staff = useListPlatformStaff({ query: { queryKey: getListPlatformStaffQueryKey(), retry: 1 } });
  const createTenant = useCreateTenant();
  const updateTenant = useUpdateTenant();
  const deleteTenant = useDeleteTenant();
  const allocate = useAllocateTenantCredit();
  const decideTopup = useDecidePrivateTopup();
  const createStaff = useCreatePlatformStaff();
  const updateSettings = useUpdateAdminSettings();
  const [showTenant, setShowTenant] = useState(false);
  const [creditTenant, setCreditTenant] = useState<string | null>(null);
  const [tenantForm, setTenantForm] = useState({ name: '', type: 'clinic', address: '', adminName: '', adminEmail: '', adminPhone: '', initialCredits: 100, kioskEnabled: false });
  const [creditAmount, setCreditAmount] = useState(100);
  const [view, setPanelView] = usePanelView('overview');
  const [, navigate] = useLocation();
  const setView = (nextView: string) => {
    setPanelView(nextView);
    navigate(nextView === 'overview' ? '/admin' : `/admin?view=${nextView}`);
  };
  const data = overview.data;
  const tenantRows: any[] = tenants.data || [];
  const chart = data?.trend || [{ label: 'Mon', scans: 24, credits: 20 }, { label: 'Tue', scans: 38, credits: 33 }, { label: 'Wed', scans: 31, credits: 27 }, { label: 'Thu', scans: 52, credits: 47 }, { label: 'Fri', scans: 44, credits: 39 }, { label: 'Sat', scans: 18, credits: 16 }, { label: 'Sun', scans: 29, credits: 25 }];
  const maxScan = Math.max(...chart.map((item) => item.scans), 1);
  const refreshAdmin = () => {
    queryClient.invalidateQueries({ queryKey: getListTenantsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAdminOverviewQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetAdminAnalyticsQueryKey() });
  };
  const updateManagedTenant = (tenant: any, patch: any) => {
    const isStatus = patch.status !== undefined;
    const isKiosk = patch.kioskEnabled !== undefined;
    const title = isStatus
      ? `${patch.status === 'active' ? 'Activate' : 'Deactivate'} ${tenant.name}?`
      : isKiosk
        ? `${patch.kioskEnabled ? 'Enable' : 'Disable'} Kiosk Mode for ${tenant.name}?`
        : `Update ${tenant.name}?`;
    const description = isStatus
      ? `Are you sure you want to ${patch.status === 'active' ? 'activate' : 'deactivate'} access for ${tenant.name}?`
      : `Are you sure you want to ${patch.kioskEnabled ? 'enable' : 'disable'} walk-in kiosk scanning?`;

    feedback.showConfirm({
      title,
      description,
      confirmText: 'Confirm & apply',
      cancelText: 'Cancel',
      onConfirm: () => {
        updateTenant.mutate({ id: tenant.id, data: patch }, {
          onSuccess: () => {
            refreshAdmin();
            feedback.showSuccess({
              title: 'Workspace Updated',
              description: `${tenant.name} has been updated successfully.`,
            });
          },
          onError: (err: any) => {
            feedback.showError({
              title: 'Update failed',
              description: err.message || 'Could not update tenant workspace.',
            });
          },
        });
      },
    });
  };

  const archiveManagedTenant = (tenant: any) => {
    feedback.showConfirm({
      title: `Archive ${tenant.name}?`,
      description: `Staff and subscribers in ${tenant.name} will no longer be able to log in. Their historical telemetry records remain safely archived in Supabase.`,
      confirmText: 'Yes, archive workspace',
      cancelText: 'Cancel',
      onConfirm: () => {
        deleteTenant.mutate({ id: tenant.id }, {
          onSuccess: () => {
            refreshAdmin();
            feedback.showSuccess({
              title: 'Workspace Archived',
              description: `${tenant.name} has been archived successfully.`,
            });
          },
          onError: (err: any) => {
            feedback.showError({
              title: 'Archive failed',
              description: err.message || 'Could not archive tenant workspace.',
            });
          },
        });
      },
    });
  };

  const handleCreateTenant = (e: React.FormEvent) => {
    e.preventDefault();
    createTenant.mutate(
      { data: tenantForm },
      {
        onSuccess: (newWorkspace: any) => {
          setShowTenant(false);
          refreshAdmin();
          feedback.showSuccess({
            title: 'Tenant Workspace Created!',
            description: 'The new workspace is live in Supabase and ready for login.',
            details: [
              { label: 'Workspace Name', value: tenantForm.name },
              { label: 'Admin Name', value: tenantForm.adminName },
              { label: 'Admin Login Email', value: tenantForm.adminEmail },
              { label: 'Temporary Password', value: 'Password123!' },
              { label: 'Initial Credits', value: `${tenantForm.initialCredits} credits` },
            ],
            confirmText: 'Done',
          });
          setTenantForm({ name: '', type: 'clinic', address: '', adminName: '', adminEmail: '', adminPhone: '', initialCredits: 100, kioskEnabled: false });
        },
        onError: (err: any) => {
          feedback.showError({
            title: 'Could not create workspace',
            description: err.message || 'Please verify the admin email and required fields, then try again.',
          });
        },
      }
    );
  };

  const handleAllocateCredit = () => {
    if (!creditTenant) return;
    allocate.mutate(
      { id: creditTenant, data: { amount: creditAmount, note: 'Platform allocation' } },
      {
        onSuccess: () => {
          refreshAdmin();
          const target = tenantRows.find((t) => t.id === creditTenant)?.name || 'workspace';
          setCreditTenant(null);
          feedback.showSuccess({
            title: 'Platform Credits Allocated!',
            description: `Successfully granted ${creditAmount} credits to ${target}.`,
          });
        },
        onError: (err: any) => {
          feedback.showError({
            title: 'Allocation failed',
            description: err.message || 'Could not allocate platform credits.',
          });
        },
      }
    );
  };

  const adminDialogs = (
    <>
      {showTenant && (
        <Modal title="Create tenant workspace" onClose={() => setShowTenant(false)}>
          <form className="grid gap-4" onSubmit={handleCreateTenant}>
            <Field label="Workspace name" required value={tenantForm.name} onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })} data-testid="input-tenant-name" />
            <Field label="Address" value={tenantForm.address} onChange={(e) => setTenantForm({ ...tenantForm, address: e.target.value })} data-testid="input-tenant-address" />
            <Field label="Admin name" required value={tenantForm.adminName} onChange={(e) => setTenantForm({ ...tenantForm, adminName: e.target.value })} data-testid="input-tenant-admin-name" />
            <Field label="Admin email" type="email" required value={tenantForm.adminEmail} onChange={(e) => setTenantForm({ ...tenantForm, adminEmail: e.target.value })} data-testid="input-tenant-admin-email" />
            <Field label="Initial credits" type="number" min={0} value={tenantForm.initialCredits} onChange={(e) => setTenantForm({ ...tenantForm, initialCredits: Number(e.target.value) })} data-testid="input-tenant-credits" />
            <div className="consent-toggle">
              <div>
                <b>Enable kiosk feature</b>
                <span>Allow this tenant to launch guest and subscriber kiosk scans.</span>
              </div>
              <button
                type="button"
                className={`switch ${tenantForm.kioskEnabled ? 'on' : ''}`}
                onClick={() => setTenantForm({ ...tenantForm, kioskEnabled: !tenantForm.kioskEnabled })}
                data-testid="button-new-tenant-kiosk"
              >
                <span />
              </button>
            </div>
            <Button type="submit" disabled={createTenant.isPending} data-testid="button-submit-tenant">
              {createTenant.isPending ? 'Creating…' : 'Create workspace'}
              <ArrowRight size={16} />
            </Button>
          </form>
        </Modal>
      )}
      {creditTenant && (
        <Modal title="Allocate platform credits" onClose={() => setCreditTenant(null)}>
          <p className="text-sm text-muted-foreground">Credits are available immediately to this tenant workspace.</p>
          <Field className="mt-4" label="Credit amount" type="number" min={1} value={creditAmount} onChange={(e) => setCreditAmount(Number(e.target.value))} data-testid="input-credit-amount" />
          <Button className="mt-4 w-full" onClick={handleAllocateCredit} data-testid="button-submit-credit">
            Allocate credits
          </Button>
        </Modal>
      )}
    </>
  );

  if (view === 'tenants') {
    return (
      <Shell role="admin">
        <AdminTenantsView tenants={tenantRows} pending={updateTenant.isPending || deleteTenant.isPending} onAdd={() => setShowTenant(true)} onAllocate={setCreditTenant} onUpdate={updateManagedTenant} onArchive={archiveManagedTenant} />
        {adminDialogs}
      </Shell>
    );
  }
  if (view === 'analytics') {
    return (
      <Shell role="admin">
        <AdminAnalyticsView analytics={analytics.data} loading={analytics.isLoading} error={analytics.isError} retry={() => analytics.refetch()} />
      </Shell>
    );
  }
  if (view === 'staff') {
    return (
      <Shell role="admin">
        <AdminStaffView
          staff={staff.data || []}
          loading={staff.isLoading}
          error={staff.isError}
          retry={() => staff.refetch()}
          onInvite={() =>
            createStaff.mutate(
              { data: { name: 'New staff member', email: `staff-${Date.now()}@vitalscan.demo`, subRole: 'operator' } },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: getListPlatformStaffQueryKey() });
                  feedback.showSuccess({ title: 'Staff Invited', description: 'New platform staff record added.' });
                },
                onError: (err: any) => feedback.showError({ description: err.message }),
              }
            )
          }
          onSaveSettings={() =>
            updateSettings.mutate(
              { data: { defaultCreditGrant: 100 } },
              {
                onSuccess: () => feedback.showSuccess({ title: 'Settings Saved', description: 'Platform default credit grant updated to 100.' }),
                onError: (err: any) => feedback.showError({ description: err.message }),
              }
            )
          }
        />
      </Shell>
    );
  }
  return (
    <Shell role="admin">
      <PageHeader
        eyebrow="Super Admin · Platform pulse"
        title="Good morning, Elena."
        description="A quiet view of your network’s health operations, ready for the decisions that need you."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setView('analytics')} data-testid="button-open-analytics">
              <Activity size={16} />
              View analytics
            </Button>
            <Button onClick={() => setShowTenant(true)} data-testid="button-add-tenant">
              <Plus size={16} />
              Add tenant
            </Button>
          </div>
        }
      />
      <QueryState loading={overview.isLoading} error={overview.isError} retry={() => overview.refetch()}>
        <div className="metrics-grid">
          <MetricCard label="Active tenants" value={data?.activeTenants ?? '—'} hint={`${data?.totalTenants ?? 0} workspaces in network`} icon={Building2} />
          <MetricCard label="Subscribers" value={data?.totalSubscribers?.toLocaleString() ?? '—'} hint="Across every workspace" icon={Users} tone="blue" />
          <MetricCard label="Scans this month" value={data?.totalScans?.toLocaleString() ?? '—'} hint={`${data?.creditsConsumed ?? 0} credits consumed`} icon={Activity} tone="amber" />
          <MetricCard label="Credits issued" value={data?.creditsIssued?.toLocaleString() ?? '—'} hint="Healthy platform reserve" icon={Wallet} tone="plum" />
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.45fr_.85fr]">
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h3>Network activity</h3>
                <p>Scans completed over the last seven days</p>
              </div>
              <span className="chart-legend"><i /> Scans</span>
            </div>
            <div className="activity-chart">
              {chart.map((item, index) => (
                <div className="chart-col" key={item.label}>
                  <div className="chart-value">{item.scans}</div>
                  <div className="chart-track">
                    <div className="chart-bar" style={{ height: `${Math.max((item.scans / maxScan) * 100, 8)}%`, animationDelay: `${index * 60}ms` }} />
                  </div>
                  <div className="chart-label">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h3>Signal quality</h3>
                <p>Platform health at a glance</p>
              </div>
              <Signal className="text-primary" size={19} />
            </div>
            <div className="quality-score">
              <div className="score-ring">
                <strong>94</strong>
                <span>/ 100</span>
              </div>
              <div>
                <StatusPill>Excellent</StatusPill>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Most scans are returning a clean, usable signal.</p>
              </div>
            </div>
            <div className="quality-list">
              <div>
                <span>Data completeness</span>
                <b>98.1%</b>
              </div>
              <div>
                <span>Active devices</span>
                <b>{(data?.activeTenants || 0) * 2 + 4}</b>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
          <div className="panel overflow-hidden">
            <div className="panel-heading px-5 pt-5">
              <div>
                <h3>Tenant workspaces</h3>
                <p>Recent activity across your network</p>
              </div>
              <button className="icon-action" onClick={() => setView('tenants')} data-testid="button-view-all-tenants">
                <ArrowRight size={17} />
              </button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Workspace</th>
                    <th>Status</th>
                    <th>Subscribers</th>
                    <th>Credits</th>
                    <th>Last active</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {tenantRows.length ? (
                    tenantRows.slice(0, 5).map((tenant) => (
                      <tr
                        key={tenant.id}
                        className="clickable-row"
                        tabIndex={0}
                        onClick={() => navigate(`/admin/tenants/${tenant.id}`)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/admin/tenants/${tenant.id}`); }}
                        data-testid={`row-tenant-${tenant.id}`}
                      >
                        <td>
                          <div className="flex items-center gap-3">
                            <span className="table-avatar">{initials(tenant.name)}</span>
                            <div>
                              <b className="hover:text-primary transition-colors">{tenant.name}</b>
                              <small>{tenant.type}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <StatusPill tone={tenant.status === 'active' ? 'good' : 'warn'}>{tenant.status}</StatusPill>
                        </td>
                        <td className="font-mono text-xs">{tenant.subscriberCount}</td>
                        <td>
                          <span className="font-mono text-xs">{tenant.creditBalance}</span>
                          <small> credits</small>
                        </td>
                        <td className="text-xs text-muted-foreground">{fmtDate(tenant.lastActive)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <button className="icon-action" onClick={() => navigate(`/admin/tenants/${tenant.id}`)} data-testid={`button-credit-tenant-${tenant.id}`} title="View tenant details">
                            <Eye size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty-inline">No tenant workspaces yet.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel">
            <div className="panel-heading">
              <div>
                <h3>Private requests</h3>
                <p>Subscribers waiting for credit</p>
              </div>
              <span className="count-badge">{(topups.data || []).filter((t) => t.status === 'pending').length}</span>
            </div>
            <div className="request-list">
              {(topups.data || []).slice(0, 4).map((topup) => (
                <div className="request-item" key={topup.id}>
                  <span className="table-avatar amber">{initials(topup.subscriberName)}</span>
                  <div className="min-w-0 flex-1">
                    <b>{topup.subscriberName}</b>
                    <small>{topup.amountRequested} credits · {fmtDate(topup.createdAt)}</small>
                  </div>
                  {topup.status === 'pending' ? (
                    <div className="flex gap-1">
                      <button
                        className="round-action approve"
                        onClick={() =>
                          decideTopup.mutate(
                            { id: topup.id, data: { status: 'approved' } },
                            {
                              onSuccess: () => feedback.showSuccess({ title: 'Request Approved', description: 'Credit request approved.' }),
                              onError: (err: any) => feedback.showError({ description: err.message }),
                            }
                          )
                        }
                        data-testid={`button-approve-topup-${topup.id}`}
                      >
                        <Check size={15} />
                      </button>
                      <button
                        className="round-action deny"
                        onClick={() =>
                          decideTopup.mutate(
                            { id: topup.id, data: { status: 'denied' } },
                            {
                              onSuccess: () => feedback.showSuccess({ title: 'Request Denied', description: 'Credit request denied.' }),
                              onError: (err: any) => feedback.showError({ description: err.message }),
                            }
                          )
                        }
                        data-testid={`button-deny-topup-${topup.id}`}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ) : (
                    <StatusPill tone={topup.status === 'approved' ? 'good' : 'bad'}>{topup.status}</StatusPill>
                  )}
                </div>
              ))}
              {!(topups.data || []).length && <div className="empty-inline">No requests need your attention.</div>}
            </div>
          </div>
        </div>
      </QueryState>
      {adminDialogs}
    </Shell>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" role="dialog"><div className="modal"><div className="flex items-start justify-between gap-4"><div><div className="eyebrow">ProCURE</div><h3 className="mt-1 text-xl font-extrabold tracking-tight">{title}</h3></div><button className="icon-action" onClick={onClose} data-testid="button-close-modal"><X size={18} /></button></div><div className="mt-6">{children}</div></div></div>; }

function TenantSubscriberDetail() {
  const [, params] = useRoute('/tenant/subscribers/:id');
  const [, navigate] = useLocation();
  const subscriberId = params?.id || '';
  const usage = useGetSubscriberUsage(subscriberId, { query: { queryKey: getGetSubscriberUsageQueryKey(subscriberId), enabled: Boolean(subscriberId), retry: 1 } });
  const subscriber = usage.data?.subscriber;
  const scans = usage.data?.scans || [];
  const reports = usage.data?.selfReports || [];
  const shared = subscriber?.consentTenantViewResults === true;
  const activity = [...scans.map((scan: any) => ({ kind: 'scan', id: scan.id, at: scan.startedAt, scan })), ...reports.map((report: any) => ({ kind: 'report', id: report.id, at: report.recordedAt, report }))].sort((a: any, b: any) => String(b.at).localeCompare(String(a.at)));
  return <Shell role="tenant"><PageHeader eyebrow="Workspace directory · Subscriber record" title={subscriber?.name || 'Subscriber history'} description={shared ? 'Consent is enabled. Full captured readings and telemetry are available to authorized workspace staff.' : 'This subscriber has not shared captured health data. Activity timing remains visible while every telemetric value is restricted.'} action={<Button variant="secondary" onClick={() => navigate('/tenant?view=subscribers')}><ArrowRight size={16} className="rotate-180" />Back to subscribers</Button>} /><QueryState loading={usage.isLoading} error={usage.isError} retry={() => usage.refetch()}><div className="subscriber-detail-grid"><div className="panel"><div className="panel-heading"><div><h3>{shared ? subscriber?.name : `User ID ${subscriber?.id?.slice(0, 12)}`}</h3><p>{subscriber?.email || 'Guest record'} · {scans.filter((scan: any) => scan.status === 'completed').length} completed scans</p></div><StatusPill tone={shared ? 'good' : 'neutral'}>{shared ? 'Results shared' : 'Results restricted'}</StatusPill></div><div className="subscriber-detail-meta"><div><span>User ID</span><b>{subscriber?.id}</b></div><div><span>Consent</span><b>{shared ? 'Workspace may view results' : 'Workspace may view activity only'}</b></div><div><span>Scan dates</span><b>{scans.length ? `${fmtDate(scans[scans.length - 1]?.startedAt)} – ${fmtDate(scans[0]?.startedAt)}` : 'No scans recorded'}</b></div></div></div><div className="panel"><div className="panel-heading"><div><h3>Health activity</h3><p>Camera scans and manual entries in one chronological record.</p></div><Activity className="text-primary" size={19} /></div><div className="subscriber-timeline">{activity.map((item: any) => item.kind === 'scan' ? <WorkspaceScanDetail key={item.id} scan={item.scan} restricted={!shared} /> : <WorkspaceReportDetail key={item.id} report={item.report} restricted={!shared} />)}{!activity.length && <div className="empty-inline">No health activity has been recorded for this subscriber.</div>}</div></div></div></QueryState></Shell>;
}

function WorkspaceScanDetail({ scan, restricted }: { scan: any; restricted: boolean }) {
  const result = scan.result || {};
  const value = (reading: any) => restricted ? 'Restricted' : (reading ?? '—');
  return <article className="subscriber-scan-detail"><div className="subscriber-scan-head"><div className="scan-row-icon"><Activity size={16} /></div><div className="min-w-0 flex-1"><b>{fmtDate(scan.startedAt)} · Camera scan</b><small>{scan.status} · {scan.creditOwnerType === 'tenant' ? 'Workspace credit' : 'Subscriber credit'}</small></div><StatusPill tone={scan.status === 'completed' ? 'good' : scan.status === 'aborted' ? 'bad' : 'warn'}>{scan.status}</StatusPill></div><div className="subscriber-scan-context"><div><span>Device</span><b>{scan.deviceLabel || 'Personal camera'}</b></div><div><span>Device ID</span><b>{scan.deviceId || 'Not assigned'}</b></div><div><span>Scanner type</span><b>{scan.deviceType || 'Camera'}</b></div><div><span>Location</span><b>{scan.deviceLocation || 'Not recorded'}</b></div><div><span>Operator ID</span><b>{scan.operatorUserId || 'Subscriber'}</b></div></div><div className="subscriber-reading-grid">{[['Blood pressure', result.sbp && result.dbp ? `${value(result.sbp)}/${value(result.dbp)}` : value(null), 'mmHg'], ['Heart rate', value(result.hr), 'bpm'], ['Respiratory rate', value(result.rr), 'brpm'], ['Oxygen saturation', value(result.spo2), '%'], ['Stress index', value(result.stressIndex), ''], ['Wellness score', value(result.wellnessScore), '/10'], ['Cardiovascular age', value(result.cardiovascularAge), 'years'], ['CVD risk', value(result.cvdRiskPercentage), '%']].map(([label, reading, unit]) => <div className="subscriber-reading" key={label}><span>{label}</span><b>{reading} <small>{unit}</small></b></div>)}</div>{restricted ? <div className="restricted-callout"><ShieldCheck size={15} /> Telemetric readings and result fields are Restricted for this subscriber.</div> : <div className="subscriber-telemetry"><b>Telemetry details</b><pre>{JSON.stringify({ healthRadar: result.healthRadar, signalQuality: result.signalQuality, lowConfidenceFlags: result.lowConfidenceFlags }, null, 2)}</pre></div>}</article>;
}

function WorkspaceReportDetail({ report, restricted }: { report: any; restricted: boolean }) {
  const value = (reading: any) => restricted ? 'Restricted' : (reading ?? '—');
  return <article className="subscriber-scan-detail manual"><div className="subscriber-scan-head"><div className="scan-row-icon"><FileText size={16} /></div><div className="min-w-0 flex-1"><b>{fmtDate(report.recordedAt)} · Manual health entry</b><small>Entered by subscriber</small></div><StatusPill tone={restricted ? 'neutral' : 'good'}>{restricted ? 'Restricted' : 'Available'}</StatusPill></div><div className="subscriber-reading-grid">{[['Blood pressure', report.systolicBp && report.diastolicBp ? `${value(report.systolicBp)}/${value(report.diastolicBp)}` : value(null), 'mmHg'], ['Heart rate', value(report.heartRate), 'bpm'], ['Respiratory rate', value(report.respiratoryRate), 'brpm'], ['Oxygen saturation', value(report.spo2), '%'], ['Temperature', value(report.temperatureC), '°C']].map(([label, reading, unit]) => <div className="subscriber-reading" key={label}><span>{label}</span><b>{reading} <small>{unit}</small></b></div>)}</div>{restricted ? <div className="restricted-callout"><ShieldCheck size={15} /> Manual health values and notes are Restricted for this subscriber.</div> : <div className="subscriber-report-notes"><b>Symptoms</b><p>{report.symptoms?.join?.(', ') || report.symptoms || 'None recorded'}</p><b>Notes</b><p>{report.notes || 'None recorded'}</p></div>}</article>;
}

function TenantSectionPage({ view, tenant, subscribers, subusers, devices, topups, exportUsage, onAddSubscriber, onAddDevice, onAddOperator }: any) {
  const [, navigate] = useLocation();
  if (view === 'kiosk' && tenant && !tenant.kioskEnabled) return <><PageHeader eyebrow="Workspace kiosk" title="Kiosk access is disabled." description="A ProCURE Super Admin must enable the kiosk feature for this workspace before staff can register guests or start kiosk scans." /><div className="panel kiosk-launch-card"><div className="kiosk-launch-icon"><KeyRound size={27} /></div><div className="eyebrow text-muted-foreground">Feature unavailable</div><h2>{tenant.name} does not currently have kiosk access</h2><p>Subscriber records, reporting, team access, and personal scans remain available. Contact the platform administrator if this workspace needs a reception or event scanning station.</p><div className="mini-callout"><ShieldCheck size={16} /><div><b>Enforced by the API</b><span>Kiosk lookup, guest registration, and scan start endpoints are blocked while this feature is disabled.</span></div></div></div></>;
  if (view === 'kiosk') return <><PageHeader eyebrow="Workspace kiosk" title="Launch a guest scan station." description="Open a secure kiosk session where staff can register walk-in guests, complete triage, and begin a camera scan using workspace credits." action={<Link href="/kiosk" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_8px_22px_hsl(163_49%_38%/.16)]" data-testid="link-start-kiosk"><Laptop size={17} />Start kiosk<ArrowRight size={16} /></Link>} /><div className="kiosk-launch-grid"><section className="panel kiosk-launch-card"><div className="kiosk-launch-icon"><Laptop size={27} /></div><div className="eyebrow text-primary">Ready station</div><h2>{tenant?.name || 'Workspace'} guest kiosk</h2><p>The kiosk uses this workspace’s credit balance. Guests enter their identity and measurement details, review privacy information, complete the readiness triage, and then start the FaceHeart camera scan.</p><div className="kiosk-launch-steps"><div><span>1</span><b>Guest details</b><small>Name, WhatsApp, date of birth, biological sex, height and weight.</small></div><div><span>2</span><b>Privacy & triage</b><small>Consent, lighting, clear face and readiness confirmation.</small></div><div><span>3</span><b>Camera scan</b><small>One completed measurement consumes one workspace credit.</small></div></div><Link href="/kiosk" className="kiosk-launch-button" data-testid="button-open-kiosk-session"><KeyRound size={16} />Open secure kiosk session<ArrowRight size={16} /></Link></section><aside className="panel kiosk-launch-side"><div className="panel-heading"><div><h3>Station status</h3><p>Workspace-level kiosk controls</p></div><StatusPill>Available</StatusPill></div><div className="quality-list"><div><span>Workspace credits</span><b>{tenant?.creditBalance ?? 0}</b></div><div><span>Registered devices</span><b>{devices.length}</b></div><div><span>Kiosk operators</span><b>{subusers.filter((user: any) => user.subRole === 'kiosk_operator').length}</b></div></div><div className="mini-callout"><ShieldCheck size={16} /><div><b>Authorized access only</b><span>Tenant admins and kiosk operators can run a station.</span></div></div></aside></div></>;
  if (view === 'subscribers') return <><PageHeader eyebrow="Workspace directory" title="Subscribers" description="Manage subscriber access, profile readiness, consent, credits, and scan activity." action={<Button onClick={onAddSubscriber}><Plus size={16} />Add subscriber</Button>} /><div className="panel overflow-hidden"><div className="table-wrap"><table><thead><tr><th>Subscriber</th><th>Profile</th><th>Consent</th><th>Scans</th><th>Credits</th></tr></thead><tbody>{subscribers.map((person: any) => <tr key={person.id} className="clickable-row" tabIndex={0} onClick={() => navigate(`/tenant/subscribers/${person.id}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') navigate(`/tenant/subscribers/${person.id}`); }}><td><div className="flex items-center gap-3"><span className="table-avatar">{initials(person.name)}</span><div><b>{person.name}</b><small>{person.isGuest ? 'Guest record' : person.email}</small></div></div></td><td><StatusPill tone={person.profileComplete ? 'good' : 'warn'}>{person.profileComplete ? 'Complete' : 'Incomplete'}</StatusPill></td><td><StatusPill tone={person.consentTenantViewResults ? 'good' : 'neutral'}>{person.consentTenantViewResults ? 'Shared' : 'Private'}</StatusPill></td><td>{person.scansRun}</td><td>{person.creditBalance}</td></tr>)}</tbody></table></div></div></>;
  if (view === 'devices') return <><PageHeader eyebrow="Workspace hardware" title="Devices" description="Connected and registered scan stations for this workspace." action={<Button onClick={onAddDevice}><Plus size={16} />Add device</Button>} /><div className="device-grid">{devices.map((device: any) => <div className="device-card" key={device.id}><div className="flex items-center justify-between"><span className="device-icon"><Laptop size={18} /></span><StatusPill>Online</StatusPill></div><b>{device.label}</b><small>{device.location} · {device.type}</small></div>)}</div></>;
  if (view === 'usage') return <>
    <PageHeader eyebrow="Workspace reporting" title="Usage & exports" description="Review workspace activity, telemetry volume, and download a copy of usage records." action={<Button variant="secondary" onClick={exportUsage}><CloudDownload size={16} />Download CSV</Button>} />
    <div className="metrics-grid">
      <MetricCard label="Credits consumed" value={tenant?.creditsConsumed ?? 0} hint="Total credits used" icon={Activity} tone="amber" />
      <MetricCard label="Scans recorded" value={subscribers.reduce((sum: number, item: any) => sum + item.scansRun, 0)} hint="Telemetry measurements" icon={HeartPulse} tone="mint" />
      <MetricCard label="Pending top-ups" value={topups.filter((item: any) => item.status === 'pending').length} hint="Requests awaiting review" icon={Wallet} tone="plum" />
      <MetricCard label="Available balance" value={`${tenant?.creditBalance ?? 0}`} hint="Ready for scans" icon={CreditCard} tone="blue" />
    </div>
    <div className="mt-6 panel">
      <div className="panel-heading">
        <div>
          <h3>Export data & telemetry records</h3>
          <p>Export full usage records for reconciliation, clinical reporting, or compliance records.</p>
        </div>
        <FileText className="text-primary" size={20} />
      </div>
      <div className="p-6 pt-0">
        <div className="rounded-xl border border-border bg-secondary/30 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <ClipboardList size={20} />
            </div>
            <div>
              <b className="text-sm font-bold block">Usage Records (CSV)</b>
              <span className="text-xs text-muted-foreground">Includes subscriber ID, scan timestamps, credit deductions, device ID, and station location</span>
            </div>
          </div>
          <Button onClick={exportUsage}>
            <CloudDownload size={16} />
            Download CSV Export
          </Button>
        </div>
      </div>
    </div>
  </>;
  return <WorkspaceAccessManager subusers={subusers} onAdd={onAddOperator} />;
}

const permissionObjects = ['workspace', 'team', 'subscribers', 'scans', 'credits', 'devices', 'self_reports', 'settings'];
const permissionActions = ['read', 'write', 'update', 'delete'];
const rolePermissionPreset = (role: string) => Object.fromEntries(permissionObjects.map((resource) => [resource, role === 'kiosk_operator' ? ({ workspace: ['read'], subscribers: ['read', 'write'], scans: ['read', 'write', 'update'], devices: ['read'] } as any)[resource] || [] : role === 'finance_manager' ? ({ workspace: ['read'], credits: ['read', 'write', 'update'], subscribers: ['read'] } as any)[resource] || [] : role === 'care_manager' ? ({ workspace: ['read'], subscribers: ['read', 'write', 'update'], scans: ['read', 'write', 'update'], self_reports: ['read'], devices: ['read'] } as any)[resource] || [] : resource === 'workspace' ? ['read'] : []]));

function WorkspaceAccessManager({ subusers, onAdd }: any) {
  const feedback = useFeedback();
  const updateMember = useUpdateTenantSubuser();
  const deleteMember = useDeleteTenantSubuser();
  const [editing, setEditing] = useState<any>(null);
  const [permissions, setPermissions] = useState<any>(null);
  const edit = (person: any) => { setEditing(person); setPermissions(structuredClone(person.permissions || rolePermissionPreset(person.subRole))); };
  const toggle = (resource: string, action: string) => setPermissions((current: any) => ({ ...current, [resource]: current[resource]?.includes(action) ? current[resource].filter((item: string) => item !== action) : [...(current[resource] || []), action] }));
  return <><PageHeader eyebrow="Workspace access" title="Team & permissions" description="Create team members and control read, write, update, and delete access for every workspace object." action={<Button onClick={onAdd}><Plus size={16} />Create team member</Button>} /><div className="access-overview panel"><div className="panel-heading"><div><h3>Access directory</h3><p>Permissions are enforced by the API as well as displayed here.</p></div><ShieldCheck className="text-primary" size={19} /></div><div className="access-team-list">{subusers.map((person: any) => <article className="access-member" key={person.id}><div className="access-member-head"><span className="table-avatar">{initials(person.name)}</span><div className="min-w-0 flex-1"><b>{person.name}</b><small>{person.email} · {person.subRole?.replaceAll('_', ' ')}</small></div><StatusPill tone={person.status === 'active' ? 'good' : 'bad'}>{person.status}</StatusPill><button className="icon-action" onClick={() => edit(person)} aria-label={`Edit ${person.name} access`}><Pencil size={15} /></button></div><div className="access-resource-grid">{permissionObjects.map((resource) => { const actions = person.permissions?.[resource] || []; return <div key={resource} className={actions.length ? 'access-resource active' : 'access-resource'}><b>{resource.replaceAll('_', ' ')}</b><span>{actions.length ? actions.join(' · ') : 'No access'}</span></div>; })}</div></article>)}{!subusers.length && <div className="empty-state"><Users /><h3>No team members yet</h3><p>Create the first workspace team member and assign only the access they need.</p></div>}</div></div>{editing && permissions && <Modal title={`Access for ${editing.name}`} onClose={() => setEditing(null)}><div className="permission-editor"><div className="permission-head"><span>Object</span>{permissionActions.map((action) => <span key={action}>{action}</span>)}</div>{permissionObjects.map((resource) => <div className="permission-row" key={resource}><b>{resource.replaceAll('_', ' ')}</b>{permissionActions.map((action) => <label key={action}><input type="checkbox" checked={permissions[resource]?.includes(action)} onChange={() => toggle(resource, action)} /><span>{action}</span></label>)}</div>)}<div className="permission-actions"><Button variant="ghost" onClick={() => { feedback.showConfirm({ title: `Remove ${editing.name}?`, description: 'This team member will no longer be able to log in or access workspace data.', confirmText: 'Yes, remove member', onConfirm: () => deleteMember.mutate({ id: editing.id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTenantSubusersQueryKey() }); setEditing(null); feedback.showSuccess({ title: 'Member Removed', description: `${editing.name} has been removed from this workspace.` }); }, onError: (err: any) => feedback.showError({ description: err.message }) }) }); }}><X size={15} />Delete member</Button><Button onClick={() => updateMember.mutate({ id: editing.id, data: { permissions } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTenantSubusersQueryKey() }); setEditing(null); feedback.showSuccess({ title: 'Permissions Saved', description: `Access rules for ${editing.name} have been updated.` }); }, onError: (err: any) => feedback.showError({ description: err.message }) })}>Save permissions<Check size={15} /></Button></div></div></Modal>}</>;
}

function TenantSectionDialogs({ modal, setModal, form, setForm, createSubscriber, createDevice, createSubuser, refresh }: any) {
  const feedback = useFeedback();
  const [device, setDevice] = useState({ label: 'Workspace kiosk', location: 'Front desk' });
  const [member, setMember] = useState({ name: '', email: '', subRole: 'kiosk_operator' });
  if (modal === 'subscriber') return <Modal title="Add subscriber" onClose={() => setModal(null)}><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); createSubscriber.mutate({ data: { ...form, whatsappNumber: form.phone, heightCm: null, weightKg: null } }, { onSuccess: () => { setModal(null); refresh(); feedback.showSuccess({ title: 'Subscriber Registered!', description: 'The subscriber has been added to this workspace and saved to Supabase.', details: [{ label: 'Name', value: form.name }, { label: 'Email', value: form.email }, { label: 'WhatsApp', value: form.phone }, { label: 'Initial Credits', value: `${form.initialCredits || 5} credits` }] }); }, onError: (err: any) => feedback.showError({ title: 'Registration failed', description: err.message || 'Please check all required fields.' }) }); }}><Field label="Full name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><Field label="Email" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /><Field label="WhatsApp number" required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /><Field label="Date of birth" type="date" required value={form.dob} onChange={(event) => setForm({ ...form, dob: event.target.value })} /><label className="grid gap-1.5 text-sm font-semibold"><span>Biological sex</span><select required className="h-11 rounded-xl border border-input bg-card px-3.5 font-normal" value={form.sex} onChange={(event) => setForm({ ...form, sex: event.target.value })}><option value="">Select</option><option value="female">Female</option><option value="male">Male</option><option value="intersex">Intersex</option><option value="prefer_not_to_say">Prefer not to say</option></select></label><Button type="submit" disabled={createSubscriber.isPending}>Add subscriber<Plus size={16} /></Button></form></Modal>;
  if (modal === 'device') return <Modal title="Connect a kiosk device" onClose={() => setModal(null)}><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); createDevice.mutate({ data: device }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListDevicesQueryKey() }); setModal(null); feedback.showSuccess({ title: 'Kiosk Station Connected!', description: `${device.label} at ${device.location} is online.` }); }, onError: (err: any) => feedback.showError({ description: err.message }) }); }}><Field label="Device label" required value={device.label} onChange={(event) => setDevice({ ...device, label: event.target.value })} /><Field label="Location" required value={device.location} onChange={(event) => setDevice({ ...device, location: event.target.value })} /><Button type="submit" disabled={createDevice.isPending}>Connect device<Plus size={16} /></Button></form></Modal>;
  if (modal === 'subuser') return <Modal title="Create team member" onClose={() => setModal(null)}><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); createSubuser.mutate({ data: { ...member, permissions: rolePermissionPreset(member.subRole) } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTenantSubusersQueryKey() }); setModal(null); feedback.showSuccess({ title: 'Team Member Invited!', description: `${member.name} has been added as ${member.subRole.replaceAll('_', ' ')}.` }); setMember({ name: '', email: '', subRole: 'kiosk_operator' }); }, onError: (err: any) => feedback.showError({ description: err.message }) }); }}><Field label="Full name" required value={member.name} onChange={(event) => setMember({ ...member, name: event.target.value })} /><Field label="Work email" type="email" required value={member.email} onChange={(event) => setMember({ ...member, email: event.target.value })} /><label className="grid gap-1.5 text-sm font-semibold"><span>Access preset</span><select className="h-11 rounded-xl border border-input bg-card px-3.5 font-normal" value={member.subRole} onChange={(event) => setMember({ ...member, subRole: event.target.value })}><option value="kiosk_operator">Kiosk operator</option><option value="care_manager">Care manager</option><option value="finance_manager">Finance manager</option><option value="viewer">Read-only viewer</option></select></label><div className="mini-callout"><ShieldCheck size={16} /><div><b>Fine-grained after creation</b><span>You can edit each object’s CRUD permissions from the team directory.</span></div></div><Button type="submit" disabled={createSubuser.isPending}>Create team member<Plus size={16} /></Button></form></Modal>;
  return null;
}

function TenantConsole() {
  const feedback = useFeedback();
  const overview = useGetTenantOverview({ query: { queryKey: getGetTenantOverviewQueryKey(), retry: 1 } });
  const subscribers = useListSubscribers({ query: { queryKey: getListSubscribersQueryKey(), retry: 1 } });
  const subusers = useListTenantSubusers({ query: { queryKey: getListTenantSubusersQueryKey(), retry: 1 } });
  const topups = useListTenantTopups({ query: { queryKey: getListTenantTopupsQueryKey(), retry: 1 } });
  const devices = useListDevices({ query: { queryKey: getListDevicesQueryKey(), retry: 1 } });
  const createSubscriber = useCreateSubscriber();
  const updateSubscriber = useUpdateSubscriber();
  const allocateSubscriber = useAllocateSubscriberCredit();
  const decideTopup = useDecideTenantTopup();
  const createSubuser = useCreateTenantSubuser();
  const createDevice = useCreateDevice();
  const updateProfile = useUpdateTenantProfile();
  const exportCsv = useExportUsageCsv({ query: { queryKey: getExportUsageCsvQueryKey(), enabled: false } });
  const [view, setView] = usePanelView('overview');
  const [modal, setModal] = useState<'subscriber' | 'device' | 'subuser' | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', dob: '', sex: '', initialCredits: 5 });
  const tenant = overview.data?.tenant;
  const rows = (subscribers.data || []).filter((s) => s.name.toLowerCase().includes(search.toLowerCase()) || s.email.toLowerCase().includes(search.toLowerCase()));
  const refresh = () => { queryClient.invalidateQueries({ queryKey: getListSubscribersQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetTenantOverviewQueryKey() }); };
  if (String(view) !== 'overview') return <Shell role="tenant"><TenantSectionPage view={view} tenant={tenant} subscribers={subscribers.data || []} subusers={subusers.data || []} devices={devices.data || []} topups={topups.data || []} exportUsage={() => { exportCsv.refetch(); feedback.showSuccess({ title: 'Export Generated', description: 'Usage records CSV has been downloaded.' }); }} onAddSubscriber={() => setModal('subscriber')} onAddDevice={() => setModal('device')} onAddOperator={() => setModal('subuser')} /><TenantSectionDialogs modal={modal} setModal={setModal} form={form} setForm={setForm} createSubscriber={createSubscriber} createDevice={createDevice} createSubuser={createSubuser} refresh={refresh} /></Shell>;
  return <Shell role="tenant"><PageHeader eyebrow={`${tenant?.name || 'Workspace'} · Console`} title="Your care console." description="Make every scan count. Keep your people, devices, and credits moving together." action={<div className="flex gap-2"><Button variant="secondary" onClick={() => { exportCsv.refetch(); feedback.showSuccess({ title: 'Export Generated', description: 'Usage records CSV has been downloaded.' }); }} data-testid="button-export-usage"><Download size={16} />Export usage</Button><Button onClick={() => setModal('subscriber')} data-testid="button-add-subscriber"><Plus size={16} />Add subscriber</Button></div>} /><div className="workspace-banner"><div className="banner-orb"><Building2 size={21} /></div><div className="min-w-0 flex-1"><div className="text-xs font-bold uppercase tracking-[.1em] text-primary">Workspace balance</div><div className="mt-1 text-lg font-extrabold">{tenant?.name || 'Workspace'} <span className="mx-1 text-border">·</span> <span className="font-mono text-base">{tenant?.creditBalance ?? 0} credits</span></div></div><div className="hidden text-right sm:block"><div className="text-xs text-muted-foreground">Pending top-ups</div><div className="font-display text-xl font-extrabold">{overview.data?.pendingTopups ?? (topups.data || []).filter((t) => t.status === 'pending').length}</div></div><button className="banner-arrow" data-testid="button-workspace-balance"><ArrowRight size={17} /></button></div><div className="metrics-grid mt-6"><MetricCard label="Subscribers" value={tenant?.subscriberCount ?? subscribers.data?.length ?? '—'} hint="People in your workspace" icon={Users} /><MetricCard label="Scans completed" value={tenant?.creditsConsumed ?? '—'} hint="Credits used this cycle" icon={Activity} tone="amber" /><MetricCard label="Devices online" value={devices.data?.length ?? '—'} hint="Ready for a scan" icon={Laptop} tone="blue" /><MetricCard label="Pending review" value={(topups.data || []).filter((t) => t.status === 'pending').length} hint="Top-up requests" icon={Wallet} tone="plum" /></div><div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]"><div className="panel overflow-hidden"><div className="panel-heading px-5 pt-5"><div><h3>{view === 'subscribers' ? 'Subscribers' : 'Recent subscribers'}</h3><p>Manage access and view consent-aware results.</p></div><div className="flex items-center gap-2"><div className="search-box"><Search size={15} /><input placeholder="Find a person" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-subscribers" /></div><button className="icon-action" onClick={() => setView('subscribers')} data-testid="button-open-subscribers"><ArrowRight size={16} /></button></div></div><QueryState loading={subscribers.isLoading} error={subscribers.isError} retry={() => subscribers.refetch()}><div className="table-wrap"><table><thead><tr><th>Subscriber</th><th>Consent</th><th>Scans</th><th>Balance</th><th>Last scan</th><th /></tr></thead><tbody>{rows.slice(0, view === 'subscribers' ? 12 : 5).map((subscriber) => <tr key={subscriber.id} data-testid={`row-subscriber-${subscriber.id}`}><td><div className="flex items-center gap-3"><span className="table-avatar">{initials(subscriber.name)}</span><div><b>{subscriber.name}</b><small>{subscriber.email}</small></div></div></td><td><StatusPill tone={subscriber.consentTenantViewResults ? 'good' : 'neutral'}>{subscriber.consentTenantViewResults ? 'Shared' : 'Private'}</StatusPill></td><td className="font-mono text-xs">{subscriber.scansRun}</td><td className="font-mono text-xs">{subscriber.creditBalance}</td><td className="text-xs text-muted-foreground">{fmtDate(subscriber.lastScanDate)}</td><td><button className="icon-action" onClick={() => updateSubscriber.mutate({ id: subscriber.id, data: { status: subscriber.status === 'active' ? 'paused' : 'active' } }, { onSuccess: () => { refresh(); feedback.showSuccess({ title: 'Subscriber Updated', description: `Subscriber status set to ${subscriber.status === 'active' ? 'paused' : 'active'}.` }); }, onError: (err: any) => feedback.showError({ description: err.message }) })} data-testid={`button-edit-subscriber-${subscriber.id}`}><Pencil size={15} /></button></td></tr>)}{!rows.length && <tr><td colSpan={6}><div className="empty-inline"><Users size={17} />No subscribers match your search.</div></td></tr>}</tbody></table></div></QueryState></div><div className="panel"><div className="panel-heading"><div><h3>Top-up requests</h3><p>Keep your team ready to scan.</p></div><CreditCard className="text-primary" size={19} /></div><div className="request-list">{(topups.data || []).slice(0, 5).map((topup) => <div className="request-item" key={topup.id}><span className="table-avatar amber">{initials(topup.subscriberName)}</span><div className="min-w-0 flex-1"><b>{topup.subscriberName}</b><small>{topup.amountRequested} credits requested</small></div>{topup.status === 'pending' ? <div className="flex gap-1"><button className="round-action approve" onClick={() => decideTopup.mutate({ id: topup.id, data: { status: 'approved' } }, { onSuccess: () => feedback.showSuccess({ title: 'Top-up Approved', description: 'Credits added to subscriber balance.' }), onError: (err: any) => feedback.showError({ description: err.message }) })} data-testid={`button-approve-tenant-topup-${topup.id}`}><Check size={15} /></button><button className="round-action deny" onClick={() => decideTopup.mutate({ id: topup.id, data: { status: 'denied' } }, { onSuccess: () => feedback.showSuccess({ title: 'Top-up Denied', description: 'Credit request was denied.' }), onError: (err: any) => feedback.showError({ description: err.message }) })} data-testid={`button-deny-tenant-topup-${topup.id}`}><X size={15} /></button></div> : <StatusPill tone={topup.status === 'approved' ? 'good' : 'bad'}>{topup.status}</StatusPill>}</div>)}{!(topups.data || []).length && <div className="empty-inline">Nothing waiting for review.</div>}</div><div className="panel-divider" /><div className="mini-callout"><Zap size={16} /><div><b>Fastest path to a scan</b><span>Launch kiosk mode on any ready device.</span></div><Link href="/kiosk" className="text-primary" data-testid="link-launch-kiosk"><ArrowRight size={16} /></Link></div></div></div>{view === 'devices' && <div className="panel mt-6"><div className="panel-heading"><div><h3>Devices</h3><p>Connected scan stations in your workspace.</p></div><Button onClick={() => setModal('device')} data-testid="button-add-device"><Plus size={16} />Add device</Button></div><div className="device-grid">{(devices.data || []).map((device) => <div className="device-card" key={device.id}><div className="flex items-center justify-between"><span className="device-icon"><Laptop size={18} /></span><StatusPill>online</StatusPill></div><b>{device.label}</b><small>{device.location} · {device.type}</small><div className="mt-4 border-t border-border pt-3 text-[11px] text-muted-foreground">Last active {fmtDate(device.lastActive)}</div></div>)}{!(devices.data || []).length && <div className="empty-state"><Laptop /><h3>No devices connected</h3><p>Add a scan station to start a kiosk flow.</p><Button onClick={() => setModal('device')}>Add first device</Button></div>}</div></div>}{view === 'usage' && <div className="panel mt-6"><div className="panel-heading"><div><h3>Usage & exports</h3><p>Keep a clear record of the work your workspace is doing.</p></div><FileText className="text-primary" size={20} /></div><div className="usage-summary"><div><span>Credits consumed</span><b>{tenant?.creditsConsumed ?? 0}</b></div><div><span>Scans this cycle</span><b>{subscribers.data?.reduce((sum, item) => sum + item.scansRun, 0) ?? 0}</b></div><div><span>Data export</span><b className="text-primary">Ready</b></div></div><Button variant="secondary" onClick={() => { exportCsv.refetch(); feedback.showSuccess({ title: 'Export Ready', description: 'Usage data CSV downloaded.' }); }} data-testid="button-download-csv"><CloudDownload size={16} />Download CSV</Button></div>}{view === 'settings' && <div className="panel mt-6"><div className="panel-heading"><div><h3>Workspace settings</h3><p>Keep workspace details current for your team.</p></div><Settings2 className="text-primary" size={19} /></div><form className="settings-form" onSubmit={(e) => { e.preventDefault(); updateProfile.mutate({ data: { name: tenant?.name, address: tenant?.address } }, { onSuccess: () => feedback.showSuccess({ title: 'Settings Saved', description: 'Workspace details updated.' }), onError: (err: any) => feedback.showError({ description: err.message }) }); }}><Field label="Workspace name" value={tenant?.name || ''} readOnly data-testid="input-workspace-name" /><Field label="Workspace address" value={tenant?.address || ''} readOnly data-testid="input-workspace-address" /><Button type="submit" data-testid="button-save-workspace-settings"><Check size={16} />Save workspace details</Button></form><div className="panel-divider" /><div className="staff-grid">{(subusers.data || []).map((person) => <div className="staff-card" key={person.id}><span className="table-avatar">{initials(person.name)}</span><div><b>{person.name}</b><small>{person.email} · {person.subRole}</small></div><StatusPill>{person.status}</StatusPill></div>)}<Button variant="secondary" onClick={() => setModal('subuser')} data-testid="button-add-subuser"><Plus size={15} />Add sub-user</Button></div></div>}{modal === 'subscriber' && <Modal title="Add subscriber" onClose={() => setModal(null)}><form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); createSubscriber.mutate({ data: { ...form, heightCm: null, weightKg: null } }, { onSuccess: () => { setModal(null); refresh(); feedback.showSuccess({ title: 'Subscriber Registered!', description: 'The subscriber has been added to this workspace and saved in Supabase.', details: [{ label: 'Name', value: form.name }, { label: 'Email', value: form.email }, { label: 'WhatsApp', value: form.phone }, { label: 'Initial Credits', value: `${form.initialCredits || 5} credits` }] }); }, onError: (err: any) => feedback.showError({ title: 'Registration failed', description: err.message || 'Please check all required fields.' }) }); }}><Field label="Full name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-subscriber-name" /><Field label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-subscriber-email" /><Field label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-subscriber-phone" /><Field label="Date of birth" type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} data-testid="input-subscriber-dob" /><Button type="submit" disabled={createSubscriber.isPending} data-testid="button-submit-subscriber">{createSubscriber.isPending ? 'Adding…' : 'Add subscriber'}<Plus size={16} /></Button></form></Modal>}{modal === 'device' && <Modal title="Connect a device" onClose={() => setModal(null)}><form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); createDevice.mutate({ data: { label: form.name || `${tenant?.name || 'Workspace'} station`, location: 'Front desk' } }, { onSuccess: () => { setModal(null); feedback.showSuccess({ title: 'Device Connected', description: 'New station registered to this workspace.' }); }, onError: (err: any) => feedback.showError({ description: err.message }) }); }}><Field label="Device label" placeholder="e.g. Reception Kiosk" data-testid="input-device-label" /><Field label="Location" placeholder="e.g. Front desk" data-testid="input-device-location" /><Button type="submit" data-testid="button-submit-device"><Plus size={16} />Connect device</Button></form></Modal>}{modal === 'subuser' && <Modal title="Invite a sub-user" onClose={() => setModal(null)}><form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); createSubuser.mutate({ data: { name: 'Staff Operator', email: 'staff@workspace.com', subRole: 'operator' } }, { onSuccess: () => { setModal(null); feedback.showSuccess({ title: 'Sub-user Invited', description: 'Invitation sent.' }); }, onError: (err: any) => feedback.showError({ description: err.message }) }); }}><Field label="Name" placeholder="Staff member name" data-testid="input-subuser-name" /><Field label="Email" placeholder="staff@workspace.com" data-testid="input-subuser-email" /><Button type="submit" data-testid="button-submit-subuser">Send invitation<ArrowRight size={16} /></Button></form></Modal>}</Shell>;
}

function Gauge({ value, label, color = 'mint' }: { value: number; label: string; color?: 'mint' | 'amber' | 'blue' }) { return <div className="gauge-card"><div className={`gauge gauge-${color}`} style={{ '--gauge-value': `${Math.min(100, value)}%` } as React.CSSProperties}><div className="gauge-inner"><b>{value}</b><span>/ 100</span></div></div><div className="mt-3 text-center text-xs font-bold text-muted-foreground">{label}</div></div>; }
function ResultsView({ result }: { result: any }) {
  const safe = result || demoResult;
  return (
    <div className="results-wrap">
      {safe.isMock && (
        <div className="demo-banner">
          <Sparkles size={16} className="flex-none text-accent" />
          <b>Demo mode</b>
          <span>Demo Mode — simulated vitals for testing. Not from a real camera measurement.</span>
        </div>
      )}
      <div className="results-hero">
        <div>
          <div className="eyebrow">{safe.isMock ? 'Demo scan · Just now' : 'SDK scan · Just now'}</div>
          <h2>A useful moment<br />to check in.</h2>
          <p>Your signal is clear today. Look for patterns over time, not a single number.</p>
        </div>
        <div className="score-hero">
          <span>Wellness score</span>
          <strong>{safe.wellnessScore ?? '—'}</strong>
          <small>out of 10</small>
        </div>
      </div>
      <div className="gauge-grid">
        <Gauge value={Math.round((safe.wellnessScore || 0) * 10)} label="Wellness score" />
        <Gauge value={safe.signalQuality?.overall || Math.round((safe.signalQuality?.hr_hrv || 0.94) * 100)} label="Signal quality" color="blue" />
        <Gauge value={Math.max(0, Math.round(100 - (safe.stressIndex || 0) / 6))} label="Low stress" color="amber" />
      </div>
      <div className="vitals-grid">
        <div className="vital-card">
          <span>Heart rate</span>
          <b>{safe.hr ?? '—'}<small>bpm</small></b>
          <StatusPill>In range</StatusPill>
        </div>
        <div className="vital-card">
          <span>Blood pressure</span>
          <b>{safe.sbp ?? '—'}/{safe.dbp ?? '—'}<small>mmHg</small></b>
          <StatusPill>In range</StatusPill>
        </div>
        <div className="vital-card">
          <span>Respiratory rate</span>
          <b>{safe.rr ?? '—'}<small>breaths/min</small></b>
          <StatusPill>In range</StatusPill>
        </div>
        <div className="vital-card">
          <span>Oxygen saturation</span>
          <b>{safe.spo2 ?? '—'}<small>%</small></b>
          <StatusPill>Strong</StatusPill>
        </div>
      </div>
      <div className="disclaimer">
        <ShieldCheck size={19} className="text-primary flex-none mt-0.5" />
        <div>
          <b>A note on what you’re seeing</b>
          <p>This scan provides wellness estimates based on camera-derived physiological signals. Heart rate and respiratory rate readings are produced by an FDA-cleared measurement engine; other values (including blood pressure, oxygen saturation, stress index, and any blood-panel estimates) are non-diagnostic estimates and should not replace professional medical advice, diagnosis, or treatment. If you have a medical concern, please consult a qualified healthcare provider.</p>
        </div>
      </div>
    </div>
  );
}

function SubscriberProfilePage({ subscriber, updateMe }: { subscriber: any; updateMe: any }) {
  const feedback = useFeedback();
  const [form, setForm] = useState({ name: '', email: '', phone: '', whatsappNumber: '', nationalIdPassport: '', dob: '', sex: '', heightCm: '', weightKg: '', consentTenantViewResults: false });
  useEffect(() => {
    if (subscriber) setForm({ name: subscriber.name || '', email: subscriber.email || '', phone: subscriber.phone || '', whatsappNumber: subscriber.whatsappNumber || subscriber.phone || '', nationalIdPassport: subscriber.nationalIdPassport || '', dob: subscriber.dob || '', sex: subscriber.sex || '', heightCm: subscriber.heightCm?.toString() || '', weightKg: subscriber.weightKg?.toString() || '', consentTenantViewResults: Boolean(subscriber.consentTenantViewResults) });
  }, [subscriber]);
  const missing = subscriber?.missingProfileFields || [];
  return <Shell role="subscriber"><PageHeader eyebrow="Personal health record" title="Profile & consent" description="Link results to your user ID and receive them on WhatsApp. Even if your number changes, your record remains accessible." /><div className="profile-layout"><section className="panel profile-card"><div className="panel-heading"><div><h3>Identity & delivery</h3><p>Required identity details keep results connected to the right record.</p></div><StatusPill tone={missing.length ? 'warn' : 'good'}>{missing.length ? `${missing.length} missing` : 'Ready to scan'}</StatusPill></div>{missing.length > 0 && <div className="profile-warning"><AlertCircle size={17} /><div><b>Finish your profile</b><span>Missing: {missing.join(', ')}</span></div></div>}<div className="profile-info-note"><Bell size={17} /><div><b>Results delivered on WhatsApp</b><span>Your WhatsApp number is used to receive results and retrieve your ProCURE ID if your number changes.</span></div></div><form className="profile-form" onSubmit={(event) => { event.preventDefault(); updateMe.mutate({ data: { ...form, phone: form.whatsappNumber, nationalIdPassport: form.nationalIdPassport || null, heightCm: form.heightCm ? Number(form.heightCm) : null, weightKg: form.weightKg ? Number(form.weightKg) : null } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetSubscriberMeQueryKey() }); feedback.showSuccess({ title: 'Profile Saved!', description: 'Your health record and WhatsApp preferences are up to date.' }); }, onError: (err: any) => feedback.showError({ description: err.message }) }); }}><Field label="First and last name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><Field label="WhatsApp number" type="tel" required value={form.whatsappNumber} onChange={(event) => setForm({ ...form, whatsappNumber: event.target.value })} /><Field label="Date of birth" type="date" required value={form.dob} onChange={(event) => setForm({ ...form, dob: event.target.value })} /><label className="grid gap-1.5 text-sm font-semibold"><span>Biological sex</span><select required className="h-11 rounded-xl border border-input bg-card px-3.5 font-normal" value={form.sex} onChange={(event) => setForm({ ...form, sex: event.target.value })}><option value="">Select</option><option value="female">Female</option><option value="male">Male</option><option value="intersex">Intersex</option><option value="prefer_not_to_say">Prefer not to say</option></select></label><Field label="National ID / Passport (optional)" value={form.nationalIdPassport} onChange={(event) => setForm({ ...form, nationalIdPassport: event.target.value })} /><Field label="Email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /><div className="profile-section-label">Measurement details</div><Field label="Height (cm)" type="number" min={50} max={250} value={form.heightCm} onChange={(event) => setForm({ ...form, heightCm: event.target.value })} /><Field label="Weight (kg)" type="number" min={20} max={350} value={form.weightKg} onChange={(event) => setForm({ ...form, weightKg: event.target.value })} /><div className="consent-toggle profile-consent"><div><b>Share results with workspace</b><span>This permission can be changed at any time.</span></div><button type="button" className={`switch ${form.consentTenantViewResults ? 'on' : ''}`} onClick={() => setForm({ ...form, consentTenantViewResults: !form.consentTenantViewResults })}><span /></button></div><Button type="submit" disabled={updateMe.isPending}><Check size={16} />{updateMe.isPending ? 'Saving…' : 'Save profile'}</Button></form></section><aside className="panel privacy-panel refined"><div className="privacy-seal"><ShieldCheck size={24} /></div><h3>Your health record stays in your control.</h3><p>The optional ID or passport field provides another way to retrieve your record if your WhatsApp number changes.</p><div className="privacy-row"><CheckCircle2 size={15} /><span>WhatsApp result delivery</span></div><div className="privacy-row"><CheckCircle2 size={15} /><span>Optional identity recovery</span></div><div className="privacy-row"><CheckCircle2 size={15} /><span>Consent can be withdrawn</span></div></aside></div></Shell>;
}

function SubscriberTriage({ subscriber, pending, onContinue, onCancel }: { subscriber: any; pending: boolean; onContinue: () => void; onCancel: () => void }) {
  const [consent, setConsent] = useState(false);
  const [ready, setReady] = useState({ light: false, face: false, still: false });
  const allReady = consent && Object.values(ready).every(Boolean);
  return <Shell role="subscriber"><div className="triage-shell"><div className="triage-header"><button type="button" onClick={onCancel} className="triage-back"><ArrowRight size={17} className="rotate-180" />Back</button><div><div className="eyebrow">Before we start</div><h1>Privacy and scan preparation</h1><p>Confirm how ProCURE handles your data, then prepare your camera environment.</p></div><StatusPill tone="neutral">Step 1 of 2</StatusPill></div><div className="triage-grid"><section className="triage-card positive"><div className="triage-card-title"><CheckCircle2 size={18} /><h2>What ProCURE does</h2></div><ul><li>Processes a local face scan through the authorized FaceHeart engine</li><li>Calculates informational wellness indicators</li><li>Links results to {subscriber?.name || 'your'} user record</li><li>Sends results to your saved WhatsApp number</li><li>Stores results only under your user ID and consent settings</li></ul></section><section className="triage-card negative"><div className="triage-card-title"><AlertCircle size={18} /><h2>What ProCURE does not do</h2></div><ul><li>Store camera video or facial images</li><li>Share your identity without explicit permission</li><li>Diagnose disease or replace medical advice</li><li>Sell your personal health information</li></ul></section><section className="triage-card preparation"><div className="triage-card-title"><Activity size={18} /><h2>Camera readiness</h2></div><p>Use direct light, look straight at the camera, remove glasses or a mask, and stay still during measurement.</p><div className="readiness-list"><label><input type="checkbox" checked={ready.light} onChange={(event) => setReady({ ...ready, light: event.target.checked })} /><span><b>Lighting is clear</b><small>My face is evenly and directly lit.</small></span></label><label><input type="checkbox" checked={ready.face} onChange={(event) => setReady({ ...ready, face: event.target.checked })} /><span><b>Face is unobstructed</b><small>I removed glasses, a mask, or anything covering my face.</small></span></label><label><input type="checkbox" checked={ready.still} onChange={(event) => setReady({ ...ready, still: event.target.checked })} /><span><b>I can remain still</b><small>I can look straight ahead with a neutral expression.</small></span></label></div></section><section className="triage-consent"><label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /><span><b>I understand and consent</b><small>I allow ProCURE to access my camera and process health signals. Results are indicative and not a medical diagnosis.</small></span></label><div className="triage-actions"><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button disabled={!allReady || pending} onClick={onContinue}>{pending ? 'Preparing camera…' : 'I’m ready — Start scan'}<ArrowRight size={16} /></Button></div></section></div></div></Shell>;
}

function SubscriberScanHistory({ scans, begin }: { scans: any[]; begin: () => void }) {
  return <Shell role="subscriber"><PageHeader eyebrow="Personal health record" title="Scan history" description="Review completed, cancelled, and pending measurements in one clear timeline." action={<Button onClick={begin}><Activity size={16} />Start a scan</Button>} /><div className="panel history-panel"><div className="history-summary"><div><span>Total scans</span><b>{scans.filter((scan) => scan.status === 'completed').length}</b></div><div><span>Latest activity</span><b>{scans[0] ? fmtDate(scans[0].startedAt) : 'No scans yet'}</b></div></div><div className="scan-history">{scans.map((scan) => <div className="scan-row enhanced" key={scan.id}><span className="scan-row-icon"><Activity size={16} /></span><div className="min-w-0"><b>{fmtDate(scan.startedAt)}</b><small>{scan.deviceLabel || 'Personal camera'} · {scan.creditOwnerType === 'tenant' ? 'Workspace credit' : 'Subscriber credit'}</small></div><StatusPill tone={scan.status === 'completed' ? 'good' : scan.status === 'aborted' ? 'bad' : 'warn'}>{scan.status}</StatusPill></div>)}{!scans.length && <div className="empty-state"><Activity /><h3>No scans yet</h3><p>Your first measurement will appear here.</p><Button onClick={begin}>Start your first scan</Button></div>}</div></div></Shell>;
}

function SubscriberHealthTracking({ reports, loading, createReport }: { reports: any[]; loading: boolean; createReport: any }) {
  const feedback = useFeedback();
  const [form, setForm] = useState({ recordedAt: new Date().toISOString().slice(0, 16), heartRate: '', systolicBp: '', diastolicBp: '', spo2: '', respiratoryRate: '', temperatureC: '', symptoms: [] as string[], notes: '' });
  const symptoms = ['Headache', 'Dizziness', 'Fatigue', 'Shortness of breath', 'Chest discomfort', 'Nausea'];
  const toggleSymptom = (symptom: string) => setForm((current) => ({ ...current, symptoms: current.symptoms.includes(symptom) ? current.symptoms.filter((item) => item !== symptom) : [...current.symptoms, symptom] }));
  const numeric = (value: string) => value === '' ? null : Number(value);
  return <Shell role="subscriber"><PageHeader eyebrow="Personal health record" title="Health tracking" description="Add readings from a home device or note how you feel. Self-reports sit alongside camera scans so you can follow patterns over time." /><div className="tracking-layout"><section className="panel tracking-form-card"><div className="panel-heading"><div><h3>New self-report</h3><p>Enter only what you measured or observed today.</p></div><HeartPulse className="text-primary" size={20} /></div><form className="tracking-form" onSubmit={(event) => { event.preventDefault(); createReport.mutate({ data: { recordedAt: new Date(form.recordedAt).toISOString(), heartRate: numeric(form.heartRate), systolicBp: numeric(form.systolicBp), diastolicBp: numeric(form.diastolicBp), spo2: numeric(form.spo2), respiratoryRate: numeric(form.respiratoryRate), temperatureC: numeric(form.temperatureC), symptoms: form.symptoms, notes: form.notes || null } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListSubscriberSelfReportsQueryKey() }); feedback.showSuccess({ title: 'Self-Report Saved!', description: 'Your vital measurements and symptoms have been logged.' }); setForm({ recordedAt: new Date().toISOString().slice(0, 16), heartRate: '', systolicBp: '', diastolicBp: '', spo2: '', respiratoryRate: '', temperatureC: '', symptoms: [], notes: '' }); }, onError: (err: any) => feedback.showError({ description: err.message }) }); }}><Field label="Date and time" type="datetime-local" value={form.recordedAt} onChange={(event) => setForm({ ...form, recordedAt: event.target.value })} /><Field label="Heart rate (bpm)" type="number" min={20} max={250} value={form.heartRate} onChange={(event) => setForm({ ...form, heartRate: event.target.value })} /><Field label="Systolic BP (mmHg)" type="number" min={50} max={260} value={form.systolicBp} onChange={(event) => setForm({ ...form, systolicBp: event.target.value })} /><Field label="Diastolic BP (mmHg)" type="number" min={30} max={180} value={form.diastolicBp} onChange={(event) => setForm({ ...form, diastolicBp: event.target.value })} /><Field label="Oxygen saturation (%)" type="number" min={50} max={100} value={form.spo2} onChange={(event) => setForm({ ...form, spo2: event.target.value })} /><Field label="Respiratory rate" type="number" min={4} max={80} value={form.respiratoryRate} onChange={(event) => setForm({ ...form, respiratoryRate: event.target.value })} /><Field label="Temperature (°C)" type="number" min={30} max={45} step="0.1" value={form.temperatureC} onChange={(event) => setForm({ ...form, temperatureC: event.target.value })} /><div className="tracking-symptoms"><span>How are you feeling?</span><div>{symptoms.map((symptom) => <button type="button" key={symptom} className={form.symptoms.includes(symptom) ? 'selected' : ''} onClick={() => toggleSymptom(symptom)}>{symptom}</button>)}</div></div><label className="tracking-notes"><span>Notes</span><textarea rows={4} maxLength={1000} placeholder="Medication, activity, context, or anything else you noticed…" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label><div className="tracking-disclaimer"><AlertCircle size={15} /><span>Self-reported values are not verified by ProCURE and are not a diagnosis. Seek urgent care for severe or worsening symptoms.</span></div><Button type="submit" disabled={createReport.isPending}>{createReport.isPending ? 'Saving…' : 'Save self-report'}<Check size={16} /></Button></form></section><section className="panel tracking-history"><div className="panel-heading"><div><h3>Reported timeline</h3><p>Your latest entries first</p></div><ClipboardList className="text-primary" size={19} /></div>{loading ? <div className="p-5"><Skeleton className="h-24 w-full" /></div> : <div className="self-report-list">{reports.map((report) => <article className="self-report-card" key={report.id}><div className="self-report-date"><b>{fmtDate(report.recordedAt)}</b><small>Self-reported</small></div><div className="self-report-vitals">{report.heartRate != null && <span><b>{report.heartRate}</b> bpm</span>}{report.systolicBp != null && <span><b>{report.systolicBp}/{report.diastolicBp ?? '—'}</b> mmHg</span>}{report.spo2 != null && <span><b>{report.spo2}%</b> SpO₂</span>}{report.temperatureC != null && <span><b>{report.temperatureC}°C</b></span>}</div>{report.symptoms?.length > 0 && <div className="self-report-tags">{report.symptoms.map((symptom: string) => <span key={symptom}>{symptom}</span>)}</div>}{report.notes && <p>{report.notes}</p>}</article>)}{!reports.length && <div className="empty-state"><HeartPulse /><h3>No self-reports yet</h3><p>Add a reading or symptom check-in to begin your personal timeline.</p></div>}</div>}</section></div></Shell>;
}

function SubscriberPortal() {
  const feedback = useFeedback();
  const me = useGetSubscriberMe({ query: { queryKey: getGetSubscriberMeQueryKey(), retry: 1 } });
  const scans = useListSubscriberScans({ query: { queryKey: getListSubscriberScansQueryKey(), retry: 1 } });
  const notifications = useListSubscriberNotifications({ query: { queryKey: getListSubscriberNotificationsQueryKey(), retry: 1 } });
  const selfReports = useListSubscriberSelfReports({ query: { queryKey: getListSubscriberSelfReportsQueryKey(), retry: 1 } });
  const start = useStartSubscriberScan();
  const complete = useCompleteSubscriberScan();
  const abort = useAbortSubscriberScan();
  const topup = useCreateSubscriberTopup();
  const updateMe = useUpdateSubscriberMe();
  const createSelfReport = useCreateSubscriberSelfReport();
  const [flow, setFlow] = useState<'idle' | 'triage' | 'scanning' | 'result'>('idle');
  const [activeScan, setActiveScan] = useState<any>(null);
  const activeScanDetail = useGetSubscriberScan(activeScan?.id || '', { query: { queryKey: getGetSubscriberScanQueryKey(activeScan?.id || ''), enabled: Boolean(activeScan?.id), retry: false } });
  const [view, setView] = usePanelView('overview');
  const [message, setMessage] = useState('');
  const subscriber = me.data;
  const latest = subscriber?.latestResult || demoResult;
  const begin = () => setFlow('triage');
  if (view === 'profile' || (subscriber && !subscriber.profileComplete && view === 'overview')) return <SubscriberProfilePage subscriber={subscriber} updateMe={updateMe} />;
  if (view === 'scans') return <SubscriberScanHistory scans={scans.data || []} begin={begin} />;
  if (view === 'tracking') return <SubscriberHealthTracking reports={selfReports.data || []} loading={selfReports.isLoading} createReport={createSelfReport} />;
  if (flow === 'triage') return <SubscriberTriage subscriber={subscriber} pending={start.isPending} onCancel={() => setFlow('idle')} onContinue={() => start.mutate(undefined, { onSuccess: (scan) => { setActiveScan(scan); setFlow('scanning'); }, onError: (err: any) => feedback.showError({ description: err.message }) })} />;
  if (flow === 'scanning' && activeScan) return <Shell role="subscriber"><PageHeader eyebrow="Personal health record" title="Your live camera scan." description="Follow the SDK guidance and hold still while ProCURE reads your signal." /><RealCameraScan subscriber={subscriber || {}} onComplete={(result) => complete.mutate({ id: activeScan.id, data: result }, { onSuccess: (completedScan) => { setActiveScan(completedScan); setFlow('result'); queryClient.invalidateQueries({ queryKey: getListSubscriberScansQueryKey() }); queryClient.invalidateQueries({ queryKey: getGetSubscriberMeQueryKey() }); feedback.showSuccess({ title: 'Scan Completed!', description: 'Your physiological telemetry has been processed and saved.' }); }, onError: (err: any) => feedback.showError({ description: err.message }) })} onAbort={() => { abort.mutate({ id: activeScan.id }); setFlow('idle'); }} /></Shell>;
  return <Shell role="subscriber"><PageHeader eyebrow="Personal health record" title={`Good morning, ${subscriber?.name?.split(' ')[0] || 'there'}.`} description="A calm place to notice how you are doing, one signal at a time." action={<Button variant="secondary" onClick={() => setView('profile')} data-testid="button-open-profile"><ShieldCheck size={16} />Profile & consent</Button>} /><QueryState loading={me.isLoading} error={me.isError} retry={() => me.refetch()}>{flow === 'result' ? <div className="panel"><div className="panel-heading"><div><div className="eyebrow">Scan complete</div><h2 className="section-title mt-1">Here’s your readout.</h2></div><Button variant="secondary" onClick={() => setFlow('idle')} data-testid="button-close-results">Back to overview</Button></div><ResultsView result={activeScan?.result || latest} /></div> : view === 'profile' ? <div className="grid gap-6 lg:grid-cols-[1fr_.75fr]"><div className="panel"><div className="panel-heading"><div><h3>Profile & consent</h3><p>Keep your details and sharing preferences in your hands.</p></div><ShieldCheck className="text-primary" size={19} /></div><form className="settings-form" onSubmit={(e) => { e.preventDefault(); updateMe.mutate({ data: { name: subscriber?.name } }, { onSuccess: () => feedback.showSuccess({ title: 'Preferences Saved', description: 'Your preferences have been saved.' }), onError: (err: any) => feedback.showError({ description: err.message }) }); }}><Field label="Full name" value={subscriber?.name || ''} readOnly data-testid="input-profile-name" /><Field label="Email" value={subscriber?.email || ''} readOnly data-testid="input-profile-email" /><div className="consent-toggle"><div><b>Share results with workspace</b><span>Your workspace can see results when consent is on.</span></div><button type="button" className={`switch ${subscriber?.consentTenantViewResults ? 'on' : ''}`} onClick={() => updateMe.mutate({ data: { consentTenantViewResults: !subscriber?.consentTenantViewResults } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetSubscriberMeQueryKey() }); feedback.showSuccess({ title: 'Sharing Updated', description: `Consent set to ${!subscriber?.consentTenantViewResults ? 'Shared with workspace' : 'Private'}.` }); }, onError: (err: any) => feedback.showError({ description: err.message }) })} data-testid="button-toggle-consent"><span /></button></div><Button type="submit" data-testid="button-save-profile"><Check size={16} />Save preferences</Button></form></div><div className="panel privacy-panel"><div className="privacy-seal"><ShieldCheck size={24} /></div><h3>Your record is yours.</h3><p>ProCURE keeps your personal data private by default. You decide when a workspace can view results.</p><div className="privacy-row"><CheckCircle2 size={15} /><span>Consent is reversible</span></div><div className="privacy-row"><CheckCircle2 size={15} /><span>Results are informational</span></div></div></div> : <><div className="subscriber-hero"><div><div className="eyebrow text-primary">Your latest signal</div><h2>Small check-in.<br /><span>Clearer next step.</span></h2><p>{subscriber?.lastScanDate ? `Last scan on ${fmtDate(subscriber.lastScanDate)}. Your trends are best read together.` : 'Take your first scan to start building a personal baseline.'}</p><Button onClick={begin} disabled={start.isPending || subscriber?.creditBalance === 0} data-testid="button-start-scan"><Activity size={17} />{start.isPending ? 'Preparing scan…' : 'Start a scan'}<ArrowRight size={16} /></Button>{subscriber?.creditBalance === 0 && <div className="mt-3 text-xs font-semibold text-[hsl(29_70%_34%)]">You are out of scan credits. <button type="button" className="underline" onClick={() => topup.mutate({ data: { amountRequested: 5 } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetSubscriberMeQueryKey() }); feedback.showSuccess({ title: 'Credit Request Sent', description: 'Requested 5 credits from workspace admin.' }); }, onError: (err: any) => feedback.showError({ description: err.message }) })} data-testid="button-request-credit">Request 5 credits</button></div>}</div><div className="hero-signal"><div className="pulse-ring" /><div className="hero-score">{(latest as any)?.wellnessScore || 8.4}<span>wellness / 10</span></div><div className="signal-caption"><span className="h-2 w-2 rounded-full bg-primary" /> Signal quality {latest && ((latest as any).signalQuality?.overall || 94)}%</div></div></div><div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_.85fr]"><div className="panel"><div className="panel-heading"><div><h3>Latest readout</h3><p>Information to help you notice patterns.</p></div><button type="button" className="icon-action" onClick={() => setView('scans')} data-testid="button-open-scan-history"><ArrowRight size={16} /></button></div><ResultsView result={latest} /></div><div className="panel"><div className="panel-heading"><div><h3>Recent activity</h3><p>Your care timeline</p></div><Bell size={18} className="text-primary" /></div><div className="timeline">{(notifications.data || []).slice(0, 3).map((item) => <div className="timeline-item" key={item.id}><span className="timeline-dot" /><div><b>{item.title}</b><p>{item.message}</p><small>{fmtDate(item.createdAt)}</small></div></div>)}{!(notifications.data || []).length && (scans.data || []).slice(0, 3).map((scan) => <div className="timeline-item" key={scan.id}><span className="timeline-dot" /><div><b>Scan {scan.status}</b><p>{scan.deviceLabel || 'Personal scan'}</p><small>{fmtDate(scan.startedAt)}</small></div></div>)}{!(notifications.data || []).length && !(scans.data || []).length && <div className="empty-inline">Your activity will appear here after your first scan.</div>}</div></div></div>{view === 'scans' && <div className="panel mt-6"><div className="panel-heading"><div><h3>Scan history</h3><p>Every scan, in one place.</p></div><ClipboardList className="text-primary" size={19} /></div><div className="scan-history">{(scans.data || []).map((scan) => <div className="scan-row" key={scan.id}><span className="scan-row-icon"><Activity size={16} /></span><div><b>{fmtDate(scan.startedAt)}</b><small>{scan.deviceLabel || 'Personal scan'} · {scan.creditUsed} credit</small></div><StatusPill tone={scan.status === 'completed' ? 'good' : scan.status === 'aborted' ? 'bad' : 'warn'}>{scan.status}</StatusPill><ArrowRight size={16} className="ml-auto text-muted-foreground" /></div>)}{!(scans.data || []).length && <div className="empty-state"><Activity /><h3>No scans yet</h3><p>Your first scan takes less than a minute.</p><Button onClick={begin}>Start a scan</Button></div>}</div></div>}</>}</QueryState>{message && <div>{message}</div>}</Shell>;
}
function KioskTriage({ person, pending, onStart, onBack }: { person: any; pending: boolean; onStart: () => void; onBack: () => void }) {
  const [accepted, setAccepted] = useState(false);
  const [ready, setReady] = useState({ light: false, face: false, still: false });
  const canStart = accepted && Object.values(ready).every(Boolean);
  return <div className="kiosk-shell"><div className="kiosk-top"><Brand compact /><div className="kiosk-lock"><KeyRound size={14} /> Privacy & triage</div></div><div className="kiosk-triage"><div className="eyebrow text-primary">Before the scan</div><h1>Prepare for a clear signal.</h1><p>{person?.name}, confirm each check before the camera starts. Results are informational and not a medical diagnosis.</p><div className="kiosk-triage-grid"><section><div className="triage-card-title"><CheckCircle2 size={18} /><h2>What ProCURE does</h2></div><ul><li>Processes the camera signal through the authorized FaceHeart engine</li><li>Links the result to the guest or subscriber record</li><li>Uses workspace credit only after a completed kiosk scan</li></ul></section><section><div className="triage-card-title danger"><AlertCircle size={18} /><h2>What it does not do</h2></div><ul><li>Store video or facial images</li><li>Diagnose disease or replace professional care</li><li>Share identity without permission</li></ul></section></div><div className="kiosk-ready-list"><label><input type="checkbox" checked={ready.light} onChange={(event) => setReady({ ...ready, light: event.target.checked })} /><span><b>Direct, even lighting</b><small>My face is clearly visible.</small></span></label><label><input type="checkbox" checked={ready.face} onChange={(event) => setReady({ ...ready, face: event.target.checked })} /><span><b>Face unobstructed</b><small>Glasses and mask removed.</small></span></label><label><input type="checkbox" checked={ready.still} onChange={(event) => setReady({ ...ready, still: event.target.checked })} /><span><b>Ready to stay still</b><small>Neutral expression, facing forward.</small></span></label></div><label className="kiosk-consent"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span><b>I consent to camera access and signal processing</b><small>I understand that the result is indicative, non-diagnostic health information.</small></span></label><div className="kiosk-triage-actions"><Button variant="ghost" onClick={onBack}>Back</Button><Button disabled={!canStart || pending} onClick={onStart}>{pending ? 'Preparing…' : 'I’m ready — Start scan'}<ArrowRight size={16} /></Button></div></div><div className="kiosk-footer"><ShieldCheck size={14} /> Video and facial images are not stored</div></div>;
}


function Kiosk() {
  const overview = useGetTenantOverview({ query: { queryKey: getGetTenantOverviewQueryKey(), retry: false } });
  const deviceId = overview.data?.devices?.[0]?.id || '';
  const [query, setQuery] = useState('');
  const params = useMemo(() => ({ query }), [query]);
  const lookup = useLookupKioskSubscribers(params, { query: { queryKey: getLookupKioskSubscribersQueryKey(params), enabled: query.length > 1 } });
  const start = useStartKioskScan();
  const complete = useCompleteKioskScan();
  const abort = useAbortKioskScan();
  const createGuest = useCreateKioskGuest();
  const [selected, setSelected] = useState<any>(null);
  const [scan, setScan] = useState<any>(null);
  const [done, setDone] = useState(false);
  const [showTriage, setShowTriage] = useState(false);
  const [guestMode, setGuestMode] = useState(true);
  const [guestForm, setGuestForm] = useState({ name: '', email: '', phone: '', dob: '', sex: '', heightCm: 170, weightKg: 70 });
  useEffect(() => {
    if (selected && selected.creditBalance < 1) setSelected({ ...selected, creditBalance: 1 });
  }, [selected]);
  useEffect(() => {
    if (selected && !guestMode && !scan && !done) setShowTriage(true);
  }, [selected, guestMode]);
  if (showTriage && selected) return <KioskTriage person={selected} pending={start.isPending} onBack={() => { setShowTriage(false); setSelected(null); }} onStart={() => start.mutate({ data: { subscriberId: selected.id } }, { onSuccess: (value) => { setScan(value); setShowTriage(false); } })} />;
  if (guestMode) return <div className="kiosk-shell"><div className="kiosk-top"><Brand compact /><div className="kiosk-lock"><KeyRound size={14} /> Authorized kiosk session</div></div><div className="kiosk-guest-card panel"><div className="eyebrow text-primary">Walk-in guest</div><h1>Guest details</h1><p>These details are required by the measurement engine. The completed scan consumes one workspace credit.</p><form className="kiosk-guest-form" onSubmit={(event) => { event.preventDefault(); createGuest.mutate({ data: guestForm }, { onSuccess: (guest) => { setSelected(guest); setGuestMode(false); } }); }}><Field label="Full name" required value={guestForm.name} onChange={(event) => setGuestForm({ ...guestForm, name: event.target.value })} /><Field label="Phone number" required value={guestForm.phone} onChange={(event) => setGuestForm({ ...guestForm, phone: event.target.value })} /><Field label="Email (optional)" type="email" value={guestForm.email} onChange={(event) => setGuestForm({ ...guestForm, email: event.target.value })} /><Field label="Date of birth" type="date" required value={guestForm.dob} onChange={(event) => setGuestForm({ ...guestForm, dob: event.target.value })} /><label className="grid gap-1.5 text-sm font-semibold"><span>Sex</span><select required className="h-11 rounded-xl border border-input bg-card px-3.5 font-normal" value={guestForm.sex} onChange={(event) => setGuestForm({ ...guestForm, sex: event.target.value })}><option value="">Select</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option><option value="prefer_not_to_say">Prefer not to say</option></select></label><Field label="Height (cm)" type="number" min={50} max={250} required value={guestForm.heightCm} onChange={(event) => setGuestForm({ ...guestForm, heightCm: Number(event.target.value) })} /><Field label="Weight (kg)" type="number" min={20} max={350} required value={guestForm.weightKg} onChange={(event) => setGuestForm({ ...guestForm, weightKg: Number(event.target.value) })} /><div className="kiosk-guest-actions"><Button type="button" variant="ghost" onClick={() => setGuestMode(false)}>Back</Button><Button type="submit" disabled={createGuest.isPending}>{createGuest.isPending ? 'Creating guest…' : 'Continue as guest'}<ArrowRight size={16} /></Button></div>{createGuest.isError && <div className="form-error"><AlertCircle size={15} />Guest details could not be saved. Check each required field.</div>}</form></div><div className="kiosk-footer"><ShieldCheck size={14} /> Guest records are tagged separately from subscriber accounts</div></div>;
  if (done) return <div className="kiosk-shell"><Brand /><div className="kiosk-complete"><div className="complete-check"><Check size={30} /></div><div className="eyebrow text-primary">Scan complete</div><h1>You’re all set.</h1><p>Your results are available in your ProCURE account.</p><Button onClick={() => { setDone(false); setSelected(null); setQuery(''); }} data-testid="button-kiosk-new-scan">Return to check-in</Button></div><div className="kiosk-footer"><ShieldCheck size={14} /> This station does not display personal results</div></div>;
  if (scan) return <div className="kiosk-shell"><div className="kiosk-top"><Brand compact /><div className="kiosk-lock"><KeyRound size={14} /> Locked station</div></div><div className="kiosk-camera-wrap"><RealCameraScan subscriber={selected || {}} onComplete={(result) => complete.mutate({ id: scan.id, data: result }, { onSuccess: () => setDone(true) })} onAbort={() => { abort.mutate({ id: scan.id }); setScan(null); }} /></div><div className="kiosk-footer"><ShieldCheck size={14} /> Results are informational and not a medical diagnosis</div></div>;
  return <div className="kiosk-shell"><div className="kiosk-top"><Brand compact /><div className="kiosk-lock"><KeyRound size={14} /> Locked station</div></div>{scan ? <div className="kiosk-scan"><div className="kiosk-scan-orbit"><div className="pulse-ring" /><Activity size={42} /></div><div className="eyebrow text-primary">Scanning {selected?.name}</div><h1>Hold still.<br /><span>We have the signal.</span></h1><p>Keep your face within the frame. This will only take a moment.</p><div className="progress-line mt-7"><span /></div><div className="mt-7 flex justify-center gap-2"><Button onClick={() => complete.mutate({ id: scan.id, data: demoResult }, { onSuccess: () => setDone(true) })} data-testid="button-kiosk-complete">Complete scan</Button><Button variant="ghost" onClick={() => { abort.mutate({ id: scan.id }); setScan(null); }} data-testid="button-kiosk-abort">Cancel</Button></div></div> : <div className="kiosk-main"><div className="kiosk-copy"><div className="eyebrow text-primary">Welcome to ProCURE</div><h1>A quiet minute<br /><span>for your health.</span></h1><p>Search your name to begin a private wellness scan. Your results will be sent to your account.</p><div className="kiosk-trust"><div><ShieldCheck size={18} /><span>Private by default</span></div><div><Zap size={18} /><span>Less than a minute</span></div></div></div><div className="kiosk-lookup panel"><div className="eyebrow">Subscriber lookup</div><h3 className="mt-2">Who is checking in?</h3><div className="search-box large mt-5"><Search size={18} /><input autoFocus placeholder="Search name, email, or phone" value={query} onChange={(e) => setQuery(e.target.value)} data-testid="input-kiosk-search" /></div><div className="kiosk-results">{lookup.isLoading && <><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></>}{(lookup.data || []).map((person) => <button key={person.id} className="kiosk-person" onClick={() => setSelected(person)} data-testid={`button-kiosk-subscriber-${person.id}`}><span className="table-avatar">{initials(person.name)}</span><span><b>{person.name}</b><small>{person.email}</small></span><ArrowRight size={16} className="ml-auto text-muted-foreground" /></button>)}{query.length > 1 && !lookup.isLoading && !(lookup.data || []).length && <div className="empty-inline">No matching subscriber found.</div>}</div>{selected && <div className="kiosk-confirm"><div className="flex items-center gap-3"><span className="table-avatar">{initials(selected.name)}</span><div><b>{selected.name}</b><small>{selected.creditBalance} credits available</small></div></div><Button className="mt-4 w-full" disabled={!selected.creditBalance} onClick={() => start.mutate({ data: { subscriberId: selected.id } }, { onSuccess: (value) => setScan(value) })} data-testid="button-kiosk-start">Begin scan<ArrowRight size={16} /></Button></div>}</div></div>}<div className="kiosk-footer"><ShieldCheck size={14} /> Results are informational and not a medical diagnosis</div></div>;
}

function Home() {
  const [location, setLocation] = useLocation();
  const session = useGetSession({ query: { queryKey: getGetSessionQueryKey(), retry: false } });
  const user = session.data?.user;
  const destination = user ? getSessionPolicy(user)?.destination : undefined;

  useEffect(() => {
    if (!session.isLoading && user && destination) {
      if (location !== destination) {
        setLocation(destination);
      }
    }
  }, [destination, user, session.isLoading, location, setLocation]);

  if (session.isLoading && !session.data) return <div className="loading-screen"><Brand /><Skeleton className="h-3 w-48" /><Skeleton className="h-10 w-72" /></div>;
  if (user && destination) return <div className="loading-screen"><Brand /><Skeleton className="h-3 w-48" /><Skeleton className="h-10 w-72" /></div>;
  return <Login />;
}

function RoleGuard({ role, children }: { role: ConsoleRole; children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const session = useGetSession({ query: { queryKey: getGetSessionQueryKey(), retry: false } });
  const user = session.data?.user;
  const policy = user ? getSessionPolicy(user) : null;
  const hasAccess = Boolean(policy?.consoles.includes(role));

  useEffect(() => {
    if (!session.isLoading) {
      if (session.isError || !user) {
        if (location !== '/login') {
          setLocation('/login');
        }
      } else if (!hasAccess && policy?.destination) {
        if (location !== policy.destination) {
          setLocation(policy.destination);
        }
      }
    }
  }, [hasAccess, policy?.destination, user, session.isError, session.isLoading, location, setLocation]);

  if (session.isLoading && !session.data) {
    return <div className="loading-screen"><Brand /><Skeleton className="h-3 w-48" /><Skeleton className="h-10 w-72" /></div>;
  }

  if (session.isError || !user || !hasAccess) {
    return <div className="loading-screen"><Brand /><Skeleton className="h-3 w-48" /><Skeleton className="h-10 w-72" /></div>;
  }

  return <>{children}</>;
}
function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/admin/tenants/:id">
          <RoleGuard role="admin">
            <AdminTenantDetailPage />
          </RoleGuard>
        </Route>
        <Route path="/admin">
          <RoleGuard role="admin">
            <AdminDashboard />
          </RoleGuard>
        </Route>
        <Route path="/tenant/subscribers/:id">
          <RoleGuard role="tenant">
            <TenantSubscriberDetail />
          </RoleGuard>
        </Route>
        <Route path="/tenant">
          <RoleGuard role="tenant">
            <TenantConsole />
          </RoleGuard>
        </Route>
        <Route path="/subscriber">
          <RoleGuard role="subscriber">
            <SubscriberPortal />
          </RoleGuard>
        </Route>
        <Route path="/kiosk">
          <RoleGuard role="kiosk">
            <Kiosk />
          </RoleGuard>
        </Route>
        <Route
          component={() => (
            <div className="loading-screen">
              <Brand />
              <h1>That page is not here.</h1>
              <Link href="/" className="text-primary underline" data-testid="link-not-found-home">
                Return home
              </Link>
            </div>
          )}
        />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <FeedbackProvider>
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </FeedbackProvider>
    </QueryClientProvider>
  );
}

export default App;

function getSessionPolicy(user: SessionUser): SessionPolicy | null {
  if (!user) return null;
  const role = String(user.role || '').toLowerCase();
  const subRole = String(user.subRole || '').toLowerCase();
  if (role === 'super_admin' || role === 'platform_staff') return { destination: '/admin', consoles: ['admin'] };
  if (role === 'tenant_admin' || role === 'tenant') return { destination: '/tenant', consoles: ['tenant', 'kiosk'] };
  if (role === 'tenant_staff') return { destination: '/tenant', consoles: ['tenant', 'kiosk'] };
  if (role === 'kiosk_operator' || subRole === 'kiosk_operator') return { destination: '/kiosk', consoles: ['kiosk'] };
  if (role === 'tenant_subuser') {
    return subRole === 'kiosk_operator'
      ? { destination: '/kiosk', consoles: ['kiosk'] }
      : { destination: '/tenant', consoles: ['tenant'] };
  }
  if (role === 'subscriber') return { destination: '/subscriber', consoles: ['subscriber'] };
  return { destination: '/subscriber', consoles: ['subscriber'] };
}

type SessionPolicy = { destination: '/admin' | '/tenant' | '/subscriber' | '/kiosk'; consoles: ConsoleRole[] };

type SessionUser = { role: string; subRole?: string | null };
