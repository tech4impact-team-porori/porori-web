import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import type { Database, Json } from './lib/database.types';
import logoImage from './assets/doum-logo.png';
import wordmarkImage from './assets/doum-wordmark.png';
import mapImage from './assets/darori-map.png';

type Profile = Database['public']['Tables']['profiles']['Row'];
type HelpRequestRow = Database['public']['Tables']['help_requests']['Row'];
type AssignmentRow = Database['public']['Tables']['assignments']['Row'];
type CompletionProofRow =
  Database['public']['Tables']['completion_proofs']['Row'];
type CreditLedgerRow = Database['public']['Tables']['credit_ledger']['Row'];
type NotificationRow = Database['public']['Tables']['notifications']['Row'];
type VoiceCallRow = Database['public']['Tables']['voice_calls']['Row'];
type AdminCallTaskRow = Database['public']['Tables']['admin_call_tasks']['Row'];
type HelpRequestStatus = Database['public']['Enums']['help_request_status'];
type HelpCategory = Database['public']['Enums']['help_category'];
type SafetyTier = Database['public']['Enums']['safety_tier'];
type AdminCallTaskStatus =
  Database['public']['Enums']['admin_call_task_status'];
type AdminTabId = 'requesters' | 'approval' | 'calls' | 'notifications';
type HelperTabId = 'home' | 'appointments' | 'mypage';
type PublishedHelpRequestRow =
  Database['public']['Functions']['list_published_help_requests']['Returns'][number];
type HelperAssignmentRpcRow =
  Database['public']['Functions']['list_my_helper_assignments']['Returns'][number];
type HelpRequestDetailRow =
  Database['public']['Functions']['get_help_request_detail']['Returns'][number];
type RegisteredRequesterRow =
  Database['public']['Functions']['list_admin_requester_profiles']['Returns'][number];
type UnsubmittedCompletionCandidateRow =
  Database['public']['Functions']['list_unsubmitted_completion_candidates']['Returns'][number];

type HelpRequestTimeOption = {
  id: string;
  label: string;
  starts_at: string;
  timezone: string;
  status: Database['public']['Enums']['help_request_time_option_status'];
  locked_at: string | null;
  applied_count: number;
  accepted_count: number;
  is_locked: boolean;
  is_available: boolean;
  current_helper_assignment_id?: string | null;
  current_helper_assignment_status?: AssignmentRow['status'] | null;
};

type RequesterSummary = Pick<
  Profile,
  'id' | 'name' | 'phone' | 'village' | 'address_public' | 'address_detail'
> & {
  personal_notes?: string | null;
};
type HelperSummary = Pick<Profile, 'id' | 'name' | 'phone'>;
type CompanionSummary = HelperSummary & {
  status?: AssignmentRow['status'] | null;
};

type HelpRequestWithRequester = HelpRequestRow & {
  requester?: RequesterSummary | RequesterSummary[] | null;
  distance_meters?: number | null;
  is_new?: boolean;
  applied_count?: number;
  accepted_count?: number;
  current_helper_assignment_id?: string | null;
  current_helper_assignment_status?: AssignmentRow['status'] | null;
  current_helper_time_option_id?: string | null;
  locked_time_option_id?: string | null;
  time_options?: HelpRequestTimeOption[];
  application_deadline?: string | null;
  applications_locked?: boolean;
  is_full?: boolean;
  can_apply?: boolean;
  apply_block_reason?: string | null;
  application_state?: string | null;
};

type AssignmentWithRequest = AssignmentRow & {
  help_request?:
    | (HelpRequestWithRequester & {
        requester?: RequesterSummary | RequesterSummary[] | null;
      })
    | HelpRequestWithRequester[]
    | null;
  helper?: HelperSummary | HelperSummary[] | null;
  companion_helpers?: CompanionSummary[] | null;
  completion_proofs?: CompletionProofRow[] | null;
  credit_ledger?: CreditLedgerRow[] | null;
};

type CreditCelebration = {
  assignmentId: string;
  title: string;
  requesterName: string;
  amount: number;
  totalCredits: number;
};

type GeocodeMatch = {
  provider: 'vworld';
  sourceType: 'road' | 'parcel';
  matchedAddress: string;
  latitude: number;
  longitude: number;
};

type GeocodeResponse = {
  query?: string;
  match?: GeocodeMatch | null;
  error?: string;
};

type NotificationPayload = {
  title?: string;
  requester_name?: string;
  requester_phone?: string;
  helper_name?: string;
  appointment_time?: string;
  credit_reward?: number;
  accepted_helper_count?: number;
  active_count?: number;
  status?: string;
};

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
};

type RequesterRegistrationForm = {
  name: string;
  phone: string;
  village: string;
  address_public: string;
  address_detail: string;
  latitude: string;
  longitude: string;
  personal_notes: string;
  consent_info: boolean;
  consent_voice: boolean;
  consent_photo: boolean;
};

type ThemeMode = 'light' | 'dark';

const adminRoles = new Set<Profile['role']>(['mediator', 'admin']);
const helpCategoryOptions: HelpCategory[] = [
  'electronics',
  'labor',
  'daily_life',
  'mobility_care',
];
const safetyTierOptions: SafetyTier[] = [
  'tier_3',
  'tier_2',
  'tier_1',
  'needs_review',
];
const emptyRequesterRegistrationForm: RequesterRegistrationForm = {
  name: '',
  phone: '',
  village: '다로리',
  address_public: '',
  address_detail: '',
  latitude: '',
  longitude: '',
  personal_notes: '',
  consent_info: false,
  consent_voice: false,
  consent_photo: false,
};

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const storedTheme = window.localStorage.getItem('doum-theme');
  if (storedTheme === 'dark' || storedTheme === 'light') {
    return storedTheme;
  }

  return 'light';
}

export function App() {
  const [auth, setAuth] = useState<AuthState>({
    session: null,
    profile: null,
    loading: true,
    error: null,
  });
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('doum-theme', theme);
  }, [theme]);

  const loadProfile = useCallback(async (session: Session | null) => {
    if (!session) {
      setAuth({ session: null, profile: null, loading: false, error: null });
      return;
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('auth_user_id', session.user.id)
      .single();

    setAuth({
      session,
      profile: data,
      loading: false,
      error: error ? error.message : null,
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        void loadProfile(data.session);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadProfile(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  if (!isSupabaseConfigured) {
    return (
      <MissingConfig
        theme={theme}
        onToggleTheme={() =>
          setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
        }
      />
    );
  }

  if (auth.loading) {
    return (
      <ScreenMessage
        title="로딩 중"
        body="로그인 상태를 확인하고 있습니다."
        theme={theme}
        onToggleTheme={() =>
          setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
        }
      />
    );
  }

  if (!auth.session) {
    return (
      <LoginPage
        theme={theme}
        onToggleTheme={() =>
          setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
        }
      />
    );
  }

  if (auth.error || !auth.profile) {
    return (
      <ScreenMessage
        title="프로필을 다시 확인해야 합니다"
        body="로그인은 되어 있지만 현재 세션과 연결된 프로필을 찾지 못했습니다. 로컬 DB를 초기화했거나 테스트 계정을 다시 만든 뒤에 자주 발생합니다."
        theme={theme}
        onToggleTheme={() =>
          setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
        }
        actionLabel="로그아웃하고 다시 로그인"
        onAction={async () => {
          await supabase.auth.signOut();
          window.location.reload();
        }}
      />
    );
  }

  return (
    <AppShell
      profile={auth.profile}
      theme={theme}
      onToggleTheme={() =>
        setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
      }
    >
      {adminRoles.has(auth.profile.role) ? (
        <AdminDashboard profile={auth.profile} />
      ) : (
        <HelperDashboard profile={auth.profile} />
      )}
    </AppShell>
  );
}

function ThemeToggle({
  theme,
  onToggleTheme,
}: {
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={theme === 'dark' ? '밝은 화면으로 전환' : '어두운 화면으로 전환'}
      aria-pressed={theme === 'dark'}
      onClick={onToggleTheme}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );
}

function MissingConfig({
  theme,
  onToggleTheme,
}: {
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  return (
    <ScreenMessage
      title="Supabase environment missing"
      body="Create porori-web/.env.local from .env.example and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
      theme={theme}
      onToggleTheme={onToggleTheme}
    />
  );
}

function ScreenMessage({
  title,
  body,
  theme,
  onToggleTheme,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  theme: ThemeMode;
  onToggleTheme: () => void;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
}) {
  return (
    <main className="screen-message">
      <section className="panel">
        <div className="compact-theme-row">
          <ThemeToggle theme={theme} onToggleTheme={onToggleTheme} />
        </div>
        <img className="brand-mark compact" src={wordmarkImage} alt="DOUM" />
        <h1>{title}</h1>
        <p>{body}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            className="primary-action screen-message-action"
            onClick={() => void onAction()}
          >
            {actionLabel}
          </button>
        ) : null}
      </section>
    </main>
  );
}

function LoginPage({
  theme,
  onToggleTheme,
}: {
  theme: ThemeMode;
  onToggleTheme: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const result =
      mode === 'sign-in'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { name: email.split('@')[0] } },
          });

    if (result.error) {
      setMessage(result.error.message);
    } else if (mode === 'sign-up') {
      setMessage(
        'Account created. If email confirmation is enabled, check your inbox before signing in.',
      );
    }

    setBusy(false);
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="compact-theme-row">
          <ThemeToggle theme={theme} onToggleTheme={onToggleTheme} />
        </div>
        <div className="login-brand">
          <img className="brand-logo" src={logoImage} alt="DOUM" />
          <p>이웃과 함께하는 따뜻한 커뮤니티</p>
        </div>
        <form onSubmit={handleSubmit} className="stack">
          <label>
            이메일
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="이메일을 입력하세요"
              required
              autoComplete="email"
            />
          </label>
          <label>
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="비밀번호를 입력하세요"
              required
              minLength={6}
              autoComplete={
                mode === 'sign-in' ? 'current-password' : 'new-password'
              }
            />
          </label>
          {message ? <p className="form-message">{message}</p> : null}
          <button type="submit" disabled={busy}>
            {busy
              ? '처리 중...'
              : mode === 'sign-in'
                ? '로그인'
                : '계정 만들기'}
          </button>
        </form>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in');
            setMessage(null);
          }}
        >
          {mode === 'sign-in'
            ? '계정이 없으신가요? 회원가입'
            : '이미 계정이 있으신가요? 로그인'}
        </button>
        <p className="hint">
          신규 계정은 청년 도움자로 생성됩니다. 운영자 계정은 Supabase에서 역할을
          admin 또는 mediator로 변경하세요.
        </p>
      </section>
    </main>
  );
}

function AppShell({
  profile,
  theme,
  onToggleTheme,
  children,
}: {
  profile: Profile;
  theme: ThemeMode;
  onToggleTheme: () => void;
  children: React.ReactNode;
}) {
  const isAdmin = adminRoles.has(profile.role);

  return (
    <div className={isAdmin ? 'app-shell admin-app-shell' : 'app-shell helper-app-shell'}>
      <header className="topbar">
        <div className="topbar-brand">
          <ThemeToggle theme={theme} onToggleTheme={onToggleTheme} />
          <div>
            <img className="brand-mark" src={wordmarkImage} alt="DOUM" />
            <p className="eyebrow">
              {isAdmin ? '운영자 콘솔' : '청년 도움 앱'}
            </p>
          </div>
        </div>
        <div className="user-block">
          <span>{profile.name}</span>
          <span className="role-badge">{profile.role}</span>
          <button type="button" onClick={() => void supabase.auth.signOut()}>
            로그아웃
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

function AdminDashboard({ profile }: { profile: Profile }) {
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<AdminTabId>('requesters');
  const [tabCounts, setTabCounts] = useState<Record<AdminTabId, number>>({
    requesters: 0,
    approval: 0,
    calls: 0,
    notifications: 0,
  });

  const tabs = [
    { id: 'requesters', label: '어르신 등록' },
    { id: 'approval', label: '승인' },
    { id: 'calls', label: '전화 업무' },
    { id: 'notifications', label: '운영 알림' },
  ] as const;

  const loadTabCounts = useCallback(async () => {
    const [
      pendingRequests,
      pendingApplications,
      pendingCompletions,
      pendingCalls,
      adminNotifications,
    ] = await Promise.all([
      supabase
        .from('help_requests')
        .select('id', { count: 'exact', head: true })
        .in('status', ['draft', 'pending_review']),
      supabase
        .from('assignments')
        .select('id', { count: 'exact', head: true })
        .in('status', ['applied', 'accepted']),
      supabase
        .from('assignments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed_submitted'),
      supabase
        .from('admin_call_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('channel', 'in_app')
        .is('recipient_profile_id', null),
    ]);

    setTabCounts({
      requesters: 0,
      approval:
        (pendingRequests.count ?? 0) +
        (pendingApplications.count ?? 0) +
        (pendingCompletions.count ?? 0),
      calls: pendingCalls.count ?? 0,
      notifications: adminNotifications.count ?? 0,
    });
  }, []);

  useEffect(() => {
    void loadTabCounts();
  }, [loadTabCounts, activityRefreshKey]);

  function markAdminActivityChanged() {
    setActivityRefreshKey((current) => current + 1);
  }

  return (
    <div className="dashboard-grid admin-dashboard">
      <section className="hero-panel admin-hero">
        <p className="eyebrow">오늘의 운영</p>
        <h1>포로리가 접수한 요청을 확인하세요</h1>
        <p>공고 초안을 검토하고, 완료 인증을 승인해 크레딧을 지급합니다.</p>
      </section>

      <div className="admin-tab-list" role="tablist" aria-label="운영 작업">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'admin-tab active' : 'admin-tab'}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.label}</span>
            {tabCounts[tab.id] > 0 ? (
              <span className="tab-count-badge" aria-label={`${tabCounts[tab.id]}건 대기`}>
                {tabCounts[tab.id] > 99 ? '99+' : tabCounts[tab.id]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="admin-tab-panels">
        {activeTab === 'requesters' ? (
          <AdminRequesterRegistrationPanel
            onRegistered={markAdminActivityChanged}
          />
        ) : null}

        {activeTab === 'approval' ? (
          <div className="admin-approval-stack">
            <AdminPendingRequests
              onReviewed={markAdminActivityChanged}
            />
            <AdminApplicationQueue
              onReviewed={markAdminActivityChanged}
            />
            <AdminCompletionQueue onReviewed={markAdminActivityChanged} />
          </div>
        ) : null}

        {activeTab === 'calls' ? (
          <AdminCallTasksPanel
            onUpdated={markAdminActivityChanged}
          />
        ) : null}

        {activeTab === 'notifications' ? (
          <ActivityPanel
            audience="admin"
            profile={profile}
            refreshKey={activityRefreshKey}
          />
        ) : null}
      </div>
    </div>
  );
}

function GeocodeLookupControl({
  address,
  onApply,
}: {
  address: string;
  onApply: (match: GeocodeMatch) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [match, setMatch] = useState<GeocodeMatch | null>(null);
  const [message, setMessage] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);

  const normalizedAddress = address.trim();

  async function lookup() {
    if (!normalizedAddress) {
      setMessage({
        tone: 'error',
        text: '좌표를 찾을 주소를 먼저 입력하세요.',
      });
      return;
    }

    setBusy(true);
    setMatch(null);
    setMessage(null);

    const { data, error } = await supabase.functions.invoke<GeocodeResponse>(
      'geocode-address',
      {
        body: {
          address: normalizedAddress,
        },
      },
    );

    if (error || data?.error || !data?.match) {
      setMessage({
        tone: 'error',
        text:
          data?.error ??
          error?.message ??
          '주소 좌표를 찾지 못했습니다. 주소를 더 자세히 입력해 주세요.',
      });
    } else {
      setMatch(data.match);
      setMessage({
        tone: 'success',
        text: '좌표 후보를 찾았습니다. 주소를 확인한 뒤 적용하세요.',
      });
    }

    setBusy(false);
  }

  function applyMatch() {
    if (!match) {
      return;
    }

    onApply(match);
    setMessage({
      tone: 'success',
      text: '좌표를 입력칸에 적용했습니다. 저장해야 최종 반영됩니다.',
    });
  }

  return (
    <div className="geocode-control form-wide">
      <div className="geocode-control-header">
        <div>
          <strong>주소 좌표 찾기</strong>
          <p>VWorld에서 주소를 위도/경도로 변환합니다.</p>
        </div>
        <button
          type="button"
          className="secondary"
          disabled={busy || !normalizedAddress}
          onClick={lookup}
        >
          {busy ? '찾는 중...' : '좌표 찾기'}
        </button>
      </div>

      {match ? (
        <div className="geocode-result">
          <div>
            <span className="status-badge">
              {match.sourceType === 'road' ? '도로명' : '지번'}
            </span>
            <p>{match.matchedAddress}</p>
            <small>
              위도 {formatCoordinate(match.latitude)} · 경도{' '}
              {formatCoordinate(match.longitude)}
            </small>
          </div>
          <button type="button" onClick={applyMatch}>
            좌표 적용
          </button>
        </div>
      ) : null}

      {message ? (
        <p
          className={
            message.tone === 'error'
              ? 'error-message compact'
              : 'form-message compact'
          }
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

function AdminRequesterRegistrationPanel({
  onRegistered,
}: {
  onRegistered: () => void;
}) {
  const [form, setForm] = useState<RequesterRegistrationForm>(
    emptyRequesterRegistrationForm,
  );
  const [consentDocFile, setConsentDocFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [requesters, setRequesters] = useState<RegisteredRequesterRow[]>([]);
  const [loadingRequesters, setLoadingRequesters] = useState(false);
  const [requesterListError, setRequesterListError] = useState<string | null>(
    null,
  );

  const loadRequesterDirectory = useCallback(async () => {
    setLoadingRequesters(true);
    setRequesterListError(null);

    const { data, error } = await supabase.rpc(
      'list_admin_requester_profiles',
    );

    if (error) {
      setRequesterListError(requesterDirectoryErrorMessage(error.message));
    } else {
      setRequesters(data ?? []);
    }

    setLoadingRequesters(false);
  }, []);

  useEffect(() => {
    if (!directoryOpen) {
      return;
    }

    void loadRequesterDirectory();
  }, [directoryOpen, loadRequesterDirectory]);

  function updateField<K extends keyof RequesterRegistrationForm>(
    key: K,
    value: RequesterRegistrationForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    if (!form.consent_info || !form.consent_voice || !form.consent_photo) {
      setFeedback({
        type: 'error',
        text: '필수 동의 3가지를 모두 확인해야 등록할 수 있습니다.',
      });
      return;
    }

    if (!consentDocFile) {
      setFeedback({
        type: 'error',
        text: '서명된 수기 동의서 스캔 파일을 업로드해야 등록할 수 있습니다.',
      });
      return;
    }

    setBusy(true);

    const consentDocPath = buildConsentDocumentPath(
      form.phone,
      consentDocFile.name,
    );
    const { error: uploadError } = await supabase.storage
      .from('consent-documents')
      .upload(consentDocPath, consentDocFile, {
        contentType: consentDocFile.type,
        upsert: false,
      });

    if (uploadError) {
      setFeedback({
        type: 'error',
        text: `동의서 파일 업로드에 실패했습니다: ${uploadError.message}`,
      });
      setBusy(false);
      return;
    }

    const { data, error } = await supabase.rpc('register_requester_profile', {
      p_name: form.name.trim(),
      p_phone: form.phone.trim(),
      p_village: nullableText(form.village),
      p_address_public: nullableText(form.address_public),
      p_address_detail: nullableText(form.address_detail),
      p_latitude: nullableNumber(form.latitude),
      p_longitude: nullableNumber(form.longitude),
      p_personal_notes: nullableText(form.personal_notes),
      p_consent_info: form.consent_info,
      p_consent_voice: form.consent_voice,
      p_consent_photo: form.consent_photo,
      p_consent_doc_url: consentDocPath,
    });

    if (error) {
      setFeedback({
        type: 'error',
        text: requesterRegistrationErrorMessage(error.message),
      });
    } else {
      setFeedback({
        type: 'success',
        text: `어르신 등록을 완료했습니다. 등록 ID: ${data}`,
      });
      setForm(emptyRequesterRegistrationForm);
      setConsentDocFile(null);
      setFileInputKey((current) => current + 1);
      onRegistered();
      if (directoryOpen) {
        void loadRequesterDirectory();
      }
    }

    setBusy(false);
  }

  return (
    <section className="panel requester-registration-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">어르신 등록</p>
          <h2>대면 수기 등록</h2>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => setDirectoryOpen(true)}
        >
          등록 명단 보기
        </button>
      </div>

      <form className="requester-registration-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            <span>
              성함 <span className="required-marker">*</span>
            </span>
            <input
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
              placeholder="김말숙"
              required
            />
          </label>
          <label>
            <span>
              전화번호 <span className="required-marker">*</span>
            </span>
            <input
              value={form.phone}
              onChange={(event) => updateField('phone', event.target.value)}
              placeholder="010-0000-0000"
              required
            />
          </label>
          <label>
            마을
            <input
              value={form.village}
              onChange={(event) => updateField('village', event.target.value)}
              placeholder="다로리"
            />
          </label>
          <label>
            공개 주소
            <input
              value={form.address_public}
              onChange={(event) =>
                updateField('address_public', event.target.value)
              }
              placeholder="다로리 30길"
            />
          </label>
          <label className="form-wide">
            상세 주소
            <input
              value={form.address_detail}
              onChange={(event) =>
                updateField('address_detail', event.target.value)
              }
              placeholder="다로리 30길 12번지"
            />
          </label>
          <GeocodeLookupControl
            address={form.address_detail || form.address_public}
            onApply={(match) => {
              updateField('latitude', formatCoordinate(match.latitude));
              updateField('longitude', formatCoordinate(match.longitude));
            }}
          />
          <div className="coordinate-row form-wide">
            <label>
              위도
              <input value={form.latitude} placeholder="좌표 찾기 후 자동 입력" readOnly />
            </label>
            <label>
              경도
              <input value={form.longitude} placeholder="좌표 찾기 후 자동 입력" readOnly />
            </label>
          </div>
          <label className="form-wide">
            개인 특이사항
            <textarea
              value={form.personal_notes}
              onChange={(event) =>
                updateField('personal_notes', event.target.value)
              }
              placeholder="청각 어려움, 거동 불편 등 공고에 노출하면 안 되는 운영 메모"
              rows={3}
            />
          </label>
          <label className="form-wide file-upload-field">
            <span>
              수기 동의서 스캔 파일 <span className="required-marker">*</span>
            </span>
            <input
              key={fileInputKey}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              required
              onChange={(event) =>
                setConsentDocFile(event.target.files?.[0] ?? null)
              }
            />
            <small>
              PDF, JPG, PNG, WebP 파일을 비공개 Supabase Storage에 저장합니다.
            </small>
            {consentDocFile ? (
              <span className="file-upload-name">{consentDocFile.name}</span>
            ) : null}
          </label>
        </div>

        <fieldset className="consent-fieldset">
          <legend>필수 동의 확인</legend>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.consent_info}
              onChange={(event) =>
                updateField('consent_info', event.target.checked)
              }
            />
            개인정보 수집·이용 동의
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.consent_voice}
              onChange={(event) =>
                updateField('consent_voice', event.target.checked)
              }
            />
            통화 내용 녹음 동의
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.consent_photo}
              onChange={(event) =>
                updateField('consent_photo', event.target.checked)
              }
            />
            완료 인증 사진 촬영·보관 동의
          </label>
        </fieldset>

        {feedback ? (
          <p
            className={
              feedback.type === 'error' ? 'error-message' : 'form-message'
            }
          >
            {feedback.text}
          </p>
        ) : null}

        <div className="button-row">
          <button type="submit" disabled={busy}>
            {busy ? '등록 중...' : '어르신 등록'}
          </button>
        </div>
      </form>

      {directoryOpen ? (
        <RequesterDirectoryModal
          requesters={requesters}
          loading={loadingRequesters}
          error={requesterListError}
          onClose={() => setDirectoryOpen(false)}
          onRefresh={() => void loadRequesterDirectory()}
        />
      ) : null}
    </section>
  );
}

function RequesterDirectoryModal({
  requesters,
  loading,
  error,
  onClose,
  onRefresh,
}: {
  requesters: RegisteredRequesterRow[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Modal title="등록 어르신 명단" onClose={onClose}>
      <div className="detail-stack">
        <div className="section-header compact-section-header">
          <p className="muted">
            등록된 어르신 {requesters.length.toLocaleString('ko-KR')}명
          </p>
          <button
            type="button"
            className="secondary"
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? '불러오는 중...' : '새로고침'}
          </button>
        </div>

        {error ? <p className="error-message">{error}</p> : null}
        {loading && requesters.length === 0 ? (
          <p className="muted">등록 명단을 불러오는 중...</p>
        ) : null}
        {!loading && requesters.length === 0 && !error ? (
          <div className="empty-state">
            <img src={logoImage} alt="" />
            <p>아직 등록된 어르신이 없어요</p>
          </div>
        ) : null}

        {requesters.length > 0 ? (
          <ol className="requester-directory-list">
            {requesters.map((requester) => {
              const expanded = expandedId === requester.id;

              return (
                <li key={requester.id} className="requester-directory-item">
                  <div className="requester-directory-summary">
                    <strong>{requester.name}</strong>
                    <span>{requester.phone ?? '-'}</span>
                    <time dateTime={requester.created_at}>
                      {formatDate(requester.created_at)}
                    </time>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        setExpandedId(expanded ? null : requester.id)
                      }
                    >
                      {expanded ? '닫기' : '상세'}
                    </button>
                  </div>

                  {expanded ? (
                    <RequesterDirectoryDetail requester={requester} />
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </Modal>
  );
}

function RequesterDirectoryDetail({
  requester,
}: {
  requester: RegisteredRequesterRow;
}) {
  return (
    <div className="requester-directory-detail">
      <dl className="meta-grid">
        <div>
          <dt>성함</dt>
          <dd>{requester.name}</dd>
        </div>
        <div>
          <dt>전화번호</dt>
          <dd>{requester.phone ?? '-'}</dd>
        </div>
        <div>
          <dt>마을</dt>
          <dd>{requester.village || '-'}</dd>
        </div>
        <div>
          <dt>등록일</dt>
          <dd>{formatDateTime(requester.created_at)}</dd>
        </div>
        <div>
          <dt>공개 주소</dt>
          <dd>{requester.address_public ?? '-'}</dd>
        </div>
        <div>
          <dt>상세 주소</dt>
          <dd>{requester.address_detail ?? '-'}</dd>
        </div>
        <div>
          <dt>위도</dt>
          <dd>{requester.latitude ?? '-'}</dd>
        </div>
        <div>
          <dt>경도</dt>
          <dd>{requester.longitude ?? '-'}</dd>
        </div>
        <div>
          <dt>개인 특이사항</dt>
          <dd>{requester.personal_notes ?? '비공개 메모 없음'}</dd>
        </div>
        <div>
          <dt>개인정보 동의</dt>
          <dd>{formatBoolean(requester.consent_info)}</dd>
        </div>
        <div>
          <dt>통화 녹음 동의</dt>
          <dd>{formatBoolean(requester.consent_voice)}</dd>
        </div>
        <div>
          <dt>인증 사진 동의</dt>
          <dd>{formatBoolean(requester.consent_photo)}</dd>
        </div>
      </dl>
      <details className="proof-path-details">
        <summary>수기 동의서 파일 경로</summary>
        <p>{requester.consent_doc_url ?? '-'}</p>
      </details>
    </div>
  );
}

function AdminPendingRequests({ onReviewed }: { onReviewed: () => void }) {
  const [requests, setRequests] = useState<HelpRequestWithRequester[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] =
    useState<HelpRequestWithRequester | null>(null);

  const loadPendingRequests = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: requestError } = await supabase
      .from('help_requests')
      .select(
        `
        *,
        requester:profiles!help_requests_requester_id_fkey (
          id,
          name,
	          phone,
	          village,
	          address_public,
	          address_detail,
	          personal_notes
	        )
	      `,
      )
      .in('status', ['draft', 'pending_review'])
      .order('created_at', { ascending: false });

    if (requestError) {
      setError(requestError.message);
      setRequests([]);
    } else {
      setRequests((data ?? []) as HelpRequestWithRequester[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPendingRequests();
  }, [loadPendingRequests]);

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">공고 승인</p>
          <h2>검토 대기 요청</h2>
        </div>
        <button
          type="button"
          onClick={() => void loadPendingRequests()}
          disabled={loading}
        >
          새로고침
        </button>
      </div>

      {error ? <p className="error-message">{error}</p> : null}
      {loading ? <p className="muted">검토 대기 요청을 불러오는 중...</p> : null}
      {!loading && requests.length === 0 ? (
        <p className="muted">
          검토할 요청이 없습니다. Vapi 또는 수동 접수 요청이 여기에 표시됩니다.
        </p>
      ) : null}

      <div className="request-list">
        {requests.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            actions={
              <>
	                <button
	                  type="button"
	                  onClick={() => setSelectedRequest(request)}
	                >
                  검토
                </button>
              </>
            }
          />
        ))}
      </div>

      {selectedRequest ? (
        <AdminReviewModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onSaved={async () => {
            await loadPendingRequests();
          }}
          onReviewed={(reviewedId) => {
            setRequests((current) =>
              current.filter((request) => request.id !== reviewedId),
            );
            setSelectedRequest(null);
            onReviewed();
          }}
        />
      ) : null}
    </section>
  );
}

function AdminApplicationQueue({ onReviewed }: { onReviewed: () => void }) {
  const [assignments, setAssignments] = useState<AssignmentWithRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: assignmentError } = await supabase
      .from('assignments')
      .select(
        `
        *,
        helper:profiles!assignments_helper_id_fkey (
          id,
          name,
          phone
        ),
        help_request:help_requests!assignments_help_request_id_fkey (
          *,
          requester:profiles!help_requests_requester_id_fkey (
            id,
            name,
            phone,
            village,
            address_public,
            address_detail,
            personal_notes
          )
        )
      `,
      )
      .in('status', ['applied', 'accepted'])
      .order('applied_at', { ascending: true });

    if (assignmentError) {
      setError(assignmentError.message);
      setAssignments([]);
    } else {
      setAssignments((data ?? []) as AssignmentWithRequest[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  const groupedAssignments = useMemo(() => {
    const groups = new Map<string, AssignmentWithRequest[]>();

    for (const assignment of assignments) {
      const request = normalizeOne(assignment.help_request);
      const requestId = request?.id ?? assignment.help_request_id;
      groups.set(requestId, [...(groups.get(requestId) ?? []), assignment]);
    }

    return Array.from(groups.entries()).map(([requestId, groupAssignments]) => ({
      requestId,
      request: normalizeOne(groupAssignments[0]?.help_request),
      assignments: groupAssignments,
      appliedCount: groupAssignments.filter((assignment) => assignment.status === 'applied').length,
      acceptedCount: groupAssignments.filter((assignment) => assignment.status === 'accepted').length,
    }));
  }, [assignments]);

  async function reviewApplication(
    assignmentId: string,
    action: 'approve' | 'reject',
  ) {
    setWorkingId(assignmentId);
    setError(null);

    const { error: rpcError } =
      action === 'approve'
        ? await supabase.rpc('approve_assignment', {
            p_assignment_id: assignmentId,
          })
        : await supabase.rpc('reject_assignment', {
            p_assignment_id: assignmentId,
            p_reason: '관리자 검토 반려',
          });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setAssignments((current) =>
        current.filter((assignment) => assignment.id !== assignmentId),
      );
      onReviewed();
    }

    setWorkingId(null);
  }

  async function approveAllForRequest(requestId: string) {
    setWorkingId(requestId);
    setError(null);

    const { error: rpcError } = await supabase.rpc(
      'approve_all_assignments_for_request',
      {
        p_help_request_id: requestId,
      },
    );

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setAssignments((current) =>
        current.filter((assignment) => assignment.help_request_id !== requestId),
      );
      onReviewed();
    }

    setWorkingId(null);
  }

  async function finalizeMatch(requestId: string, acceptedCount: number) {
    const reason =
      acceptedCount < 3
        ? window.prompt('부족 인원으로 진행하는 사유를 입력하세요.')
        : null;

    if (acceptedCount < 3 && !reason?.trim()) {
      setError('부족 인원으로 확정하려면 사유가 필요합니다.');
      return;
    }

    setWorkingId(requestId);
    setError(null);

    const { error: rpcError } = await supabase.rpc(
      'finalize_help_request_match',
      {
        p_help_request_id: requestId,
        p_underfilled_reason: reason,
      },
    );

    if (rpcError) {
      setError(adminMatchingErrorMessage(rpcError.message));
    } else {
      setAssignments((current) =>
        current.filter((assignment) => assignment.help_request_id !== requestId),
      );
      onReviewed();
    }

    setWorkingId(null);
  }

  async function markUnfilled(requestId: string) {
    const reason = window.prompt('무산 사유를 입력하세요.');

    if (!reason?.trim()) {
      setError('무산 처리하려면 사유가 필요합니다.');
      return;
    }

    setWorkingId(requestId);
    setError(null);

    const { error: rpcError } = await supabase.rpc(
      'mark_help_request_unfilled',
      {
        p_help_request_id: requestId,
        p_reason: reason,
      },
    );

    if (rpcError) {
      setError(adminMatchingErrorMessage(rpcError.message));
    } else {
      setAssignments((current) =>
        current.filter((assignment) => assignment.help_request_id !== requestId),
      );
      onReviewed();
    }

    setWorkingId(null);
  }

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">신청 승인</p>
          <h2>청년 신청 대기</h2>
        </div>
        <button type="button" onClick={() => void loadApplications()} disabled={loading}>
          새로고침
        </button>
      </div>

      {error ? <p className="error-message">{error}</p> : null}
      {loading ? <p className="muted">신청 내역을 불러오는 중...</p> : null}
      {!loading && assignments.length === 0 ? (
        <p className="muted">승인 대기 중인 도움 신청이 없습니다.</p>
      ) : null}

      <div className="request-list">
        {groupedAssignments.map((group) => (
          <section className="application-group" key={group.requestId}>
            <div className="application-group-header">
              <div>
                <p className="eyebrow">도움 요청</p>
                <h3>{group.request?.title ?? '제목 없는 요청'}</h3>
                <p className="muted">
                  신청 {group.appliedCount}명 · 확정 {group.acceptedCount}명 · 필요{' '}
                  {group.request?.required_helpers ?? 3}명
                </p>
              </div>
              <div className="button-row compact-actions application-group-actions">
                <button
                  type="button"
                  onClick={() => void approveAllForRequest(group.requestId)}
                  disabled={workingId === group.requestId || group.appliedCount === 0}
                >
                  대기자 모두 승인
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void finalizeMatch(group.requestId, group.acceptedCount)}
                  disabled={workingId === group.requestId || group.acceptedCount < 2}
                >
                  매칭 확정
                </button>
                <button
                  type="button"
                  className="secondary danger"
                  onClick={() => void markUnfilled(group.requestId)}
                  disabled={workingId === group.requestId}
                >
                  무산
                </button>
              </div>
            </div>
            <div className="request-list compact-list">
              {group.assignments.map((assignment) => (
                <ApplicationReviewCard
                  key={assignment.id}
                  assignment={assignment}
                  busy={workingId === assignment.id}
                  onApprove={() => void reviewApplication(assignment.id, 'approve')}
                  onReject={() => void reviewApplication(assignment.id, 'reject')}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function AdminCallTasksPanel({ onUpdated }: { onUpdated: () => void }) {
  const [tasks, setTasks] = useState<AdminCallTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: taskError } = await supabase
      .from('admin_call_tasks')
      .select('*')
      .order('status', { ascending: true })
      .order('created_at', { ascending: false });

    if (taskError) {
      setError(taskError.message);
      setTasks([]);
    } else {
      const nextTasks = data ?? [];
      setTasks(nextTasks);
      setNotes((current) => {
        const nextNotes = { ...current };
        for (const task of nextTasks) {
          nextNotes[task.id] = current[task.id] ?? task.admin_notes ?? '';
        }
        return nextNotes;
      });
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  async function completeTask(taskId: string) {
    setWorkingId(taskId);
    setError(null);

    const { error: rpcError } = await supabase.rpc('complete_admin_call_task', {
      p_task_id: taskId,
      p_admin_notes: notes[taskId] ?? null,
    });

    if (rpcError) {
      setError(adminCallTaskErrorMessage(rpcError.message));
    } else {
      await loadTasks();
      onUpdated();
    }

    setWorkingId(null);
  }

  async function logNoAnswer(taskId: string) {
    setWorkingId(taskId);
    setError(null);

    const { error: rpcError } = await supabase.rpc('log_admin_call_no_answer', {
      p_task_id: taskId,
      p_admin_notes: notes[taskId] ?? null,
    });

    if (rpcError) {
      setError(adminCallTaskErrorMessage(rpcError.message));
    } else {
      await loadTasks();
      onUpdated();
    }

    setWorkingId(null);
  }

  const pendingCount = tasks.filter((task) => task.status === 'pending').length;

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">전화 업무</p>
          <h2>어르신 콜백 목록</h2>
          <p className="hint">
            매칭이 확정되면 어르신께 직접 안내할 통화 스크립트가 생성됩니다.
          </p>
        </div>
        <button type="button" onClick={() => void loadTasks()} disabled={loading}>
          새로고침
        </button>
      </div>

      {error ? <p className="error-message">{error}</p> : null}
      {loading ? <p className="muted">전화 업무를 불러오는 중...</p> : null}
      {!loading && tasks.length === 0 ? (
        <p className="muted">아직 처리할 전화 업무가 없습니다.</p>
      ) : null}
      {!loading && pendingCount > 0 ? (
        <p className="form-message">대기 중인 어르신 콜백이 {pendingCount}건 있습니다.</p>
      ) : null}

      <div className="call-task-list">
        {tasks.map((task) => {
          const isPending = task.status === 'pending';
          const helperNames =
            task.accepted_helper_names.length > 0
              ? task.accepted_helper_names.join(', ')
              : '-';

          return (
            <article key={task.id} className="request-card call-task-card">
              <div className="application-group-header">
                <div>
                  <span className={`status-badge call-status-${task.status}`}>
                    {adminCallTaskStatusLabel(task.status)}
                  </span>
                  <h3>{task.request_title}</h3>
                  <p>
                    {task.requester_name} 어르신 · {task.requester_phone}
                  </p>
                </div>
                <a
                  className="button-link"
                  href={phoneHref(task.requester_phone)}
                  aria-label={`${task.requester_name} 어르신에게 전화하기`}
                >
                  전화 걸기
                </a>
              </div>

              <dl className="meta-grid">
                <div>
                  <dt>방문 시간</dt>
                  <dd>{formatDateTime(task.appointment_time)}</dd>
                </div>
                <div>
                  <dt>확정 인원</dt>
                  <dd>{task.accepted_helper_count}명</dd>
                </div>
                <div>
                  <dt>확정 청년</dt>
                  <dd>{helperNames}</dd>
                </div>
                <div>
                  <dt>생성 시각</dt>
                  <dd>{formatDateTime(task.created_at)}</dd>
                </div>
                <div>
                  <dt>부재중 시도</dt>
                  <dd>{task.no_answer_count}회</dd>
                </div>
                <div>
                  <dt>마지막 부재중</dt>
                  <dd>{formatDateTime(task.last_no_answer_at)}</dd>
                </div>
              </dl>

              <div className="call-script-box">
                <p className="eyebrow">통화 스크립트</p>
                <p>{task.call_script}</p>
              </div>

              <label className="form-wide">
                통화 메모
                <textarea
                  value={notes[task.id] ?? ''}
                  onChange={(event) =>
                    setNotes((current) => ({
                      ...current,
                      [task.id]: event.target.value,
                    }))
                  }
                  placeholder="예: 통화 완료, 일정 재확인함"
                  rows={3}
                  disabled={!isPending}
                />
              </label>

              {task.completed_at ? (
                <p className="hint">
                  처리 시각: {formatDateTime(task.completed_at)}
                </p>
              ) : null}

              {isPending ? (
                <div className="button-row">
                  <button
                    type="button"
                    onClick={() => void completeTask(task.id)}
                    disabled={workingId === task.id}
                  >
                    통화 완료
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void logNoAnswer(task.id)}
                    disabled={workingId === task.id}
                  >
                    부재중 기록
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AdminCompletionQueue({ onReviewed }: { onReviewed: () => void }) {
  const [assignments, setAssignments] = useState<AssignmentWithRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [selectedAssignment, setSelectedAssignment] =
    useState<AssignmentWithRequest | null>(null);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: assignmentError } = await supabase
      .from('assignments')
      .select(
        `
        *,
        helper:profiles!assignments_helper_id_fkey (
          id,
          name,
          phone
        ),
        help_request:help_requests!assignments_help_request_id_fkey (
          *,
          requester:profiles!help_requests_requester_id_fkey (
            id,
            name,
            phone,
            village,
            address_public,
            address_detail
          )
        ),
        completion_proofs (*),
        credit_ledger (*)
      `,
      )
      .eq('status', 'completed_submitted')
      .order('completed_at', { ascending: false });

    if (assignmentError) {
      setError(assignmentError.message);
      setAssignments([]);
    } else {
      setAssignments((data ?? []) as AssignmentWithRequest[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  async function confirmAndCredit(assignmentId: string) {
    setWorkingId(assignmentId);
    setError(null);

    const { error: rpcError } = await supabase.rpc(
      'confirm_assignment_and_credit',
      {
        p_assignment_id: assignmentId,
        p_rating: 5,
        p_review_text: '관리자가 완료 사진과 활동 후기를 확인했습니다.',
        p_source: 'admin_manual',
      },
    );

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setAssignments((current) =>
        current.filter((assignment) => assignment.id !== assignmentId),
      );
      onReviewed();
    }

    setWorkingId(null);
  }

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">완료 인증</p>
          <h2>승인 대기 활동</h2>
        </div>
        <button type="button" onClick={() => void loadAssignments()} disabled={loading}>
          새로고침
        </button>
      </div>

      {error ? <p className="error-message">{error}</p> : null}
      {loading ? <p className="muted">완료 인증을 불러오는 중...</p> : null}
      {!loading && assignments.length === 0 ? (
        <p className="muted">승인 대기 중인 완료 인증이 없습니다.</p>
      ) : null}

      <div className="request-list">
        {assignments.map((assignment) => (
          <CompletionReviewCard
            key={assignment.id}
            assignment={assignment}
            busy={workingId === assignment.id}
            onViewDetails={() => setSelectedAssignment(assignment)}
            onConfirm={() => void confirmAndCredit(assignment.id)}
          />
        ))}
      </div>

      {selectedAssignment ? (
        <CompletionDetailModal
          assignment={selectedAssignment}
          onClose={() => setSelectedAssignment(null)}
        />
      ) : null}

      <AdminMissingCompletionQueue onReviewed={onReviewed} />
    </section>
  );
}

function AdminMissingCompletionQueue({ onReviewed }: { onReviewed: () => void }) {
  const [candidates, setCandidates] = useState<UnsubmittedCompletionCandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: candidateError } = await supabase.rpc(
      'list_unsubmitted_completion_candidates',
    );

    if (candidateError) {
      setError(candidateError.message);
      setCandidates([]);
    } else {
      setCandidates(data ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  async function resolveCandidate(
    candidate: UnsubmittedCompletionCandidateRow,
    elderConfirmedVisit: boolean,
  ) {
    const defaultNote = elderConfirmedVisit
      ? '어르신 전화 확인: 청년이 방문했다고 확인했습니다.'
      : '어르신 전화 확인: 청년이 방문하지 않았다고 확인했습니다.';
    const adminNotes = window.prompt('전화 확인 메모를 입력하세요.', defaultNote);

    if (adminNotes === null) {
      return;
    }

    setWorkingId(candidate.assignment_id);
    setError(null);

    const { error: rpcError } = await supabase.rpc(
      'resolve_unsubmitted_completion',
      {
        p_assignment_id: candidate.assignment_id,
        p_elder_confirmed_visit: elderConfirmedVisit,
        p_admin_notes: adminNotes,
      },
    );

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setCandidates((current) =>
        current.filter((item) => item.assignment_id !== candidate.assignment_id),
      );
      onReviewed();
    }

    setWorkingId(null);
  }

  return (
    <section className="detail-section">
      <div className="section-header">
        <div>
          <p className="eyebrow">미인증 확인</p>
          <h3>전화 확인 대상</h3>
        </div>
        <button type="button" onClick={() => void loadCandidates()} disabled={loading}>
          새로고침
        </button>
      </div>

      <p className="hint">
        약속 시간이 지났지만 완료 인증이 없는 활동입니다. 어르신께 전화해 방문 여부를
        확인한 뒤 처리하세요.
      </p>
      {error ? <p className="error-message">{error}</p> : null}
      {loading ? <p className="muted">미인증 활동을 불러오는 중...</p> : null}
      {!loading && candidates.length === 0 ? (
        <p className="muted">전화 확인이 필요한 미인증 활동이 없습니다.</p>
      ) : null}

      <div className="request-list">
        {candidates.map((candidate) => (
          <article className="request-card" key={candidate.assignment_id}>
            <div>
              <span className="status-badge closed">미인증</span>
              <h3>{candidate.request_title}</h3>
              <p>
                {candidate.helper_name}님 완료 인증 없음 ·{' '}
                {candidate.hours_overdue ?? 0}시간 경과
              </p>
            </div>
            <dl className="meta-grid">
              <div>
                <dt>방문 시간</dt>
                <dd>{formatDateTime(candidate.appointment_time)}</dd>
              </div>
              <div>
                <dt>청년 연락처</dt>
                <dd>{candidate.helper_phone ?? '-'}</dd>
              </div>
              <div>
                <dt>어르신</dt>
                <dd>{candidate.requester_name}</dd>
              </div>
              <div>
                <dt>어르신 연락처</dt>
                <dd>{candidate.requester_phone ?? '-'}</dd>
              </div>
            </dl>
            <div className="button-row">
              <button
                type="button"
                className="secondary"
                disabled={workingId === candidate.assignment_id}
                onClick={() => void resolveCandidate(candidate, true)}
              >
                왔다고 확인
              </button>
              <button
                type="button"
                className="danger"
                disabled={workingId === candidate.assignment_id}
                onClick={() => void resolveCandidate(candidate, false)}
              >
                안 왔다고 확인
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function HelperDashboard({ profile }: { profile: Profile }) {
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<HelperTabId>('home');
  const [creditCelebration, setCreditCelebration] =
    useState<CreditCelebration | null>(null);
  const displayName = shortDisplayName(profile.name);
  const handleCreditEarned = useCallback((celebration: CreditCelebration) => {
    setCreditCelebration(celebration);
    setActivityRefreshKey((current) => current + 1);
  }, []);

  return (
    <div className="dashboard-grid helper-dashboard helper-phone-screen">
      <div className="helper-screen-content">
        {activeTab === 'home' ? (
          <>
            <section className="helper-greeting">
              <div>
                <p className="eyebrow">다로리 도움</p>
                <h1>{displayName}님, 오늘도 도울 이웃을 찾아보세요</h1>
                <p>근처 어르신의 작은 요청을 확인하고 가능한 도움을 신청하세요.</p>
              </div>
              <CreditSummaryPanel
                profile={profile}
                refreshKey={activityRefreshKey}
                variant="hero"
              />
            </section>
            <HelperFeed
              profile={profile}
              onAccepted={() => setActivityRefreshKey((current) => current + 1)}
            />
          </>
        ) : null}

        {activeTab === 'appointments' ? (
          <HelperAssignments
            profile={profile}
            onCreditEarned={handleCreditEarned}
          />
        ) : null}

        {activeTab === 'mypage' ? (
          <HelperMyPage
            profile={profile}
            refreshKey={activityRefreshKey}
          />
        ) : null}
      </div>
      <HelperBottomNav activeTab={activeTab} onChange={setActiveTab} />
      {creditCelebration ? (
        <CreditEarnedModal
          celebration={creditCelebration}
          onClose={() => setCreditCelebration(null)}
        />
      ) : null}
    </div>
  );
}

function HelperBottomNav({
  activeTab,
  onChange,
}: {
  activeTab: HelperTabId;
  onChange: (tab: HelperTabId) => void;
}) {
  const navItems: Array<{
    id: HelperTabId;
    label: string;
    icon: string;
  }> = [
    { id: 'home', label: '홈', icon: '⌂' },
    { id: 'appointments', label: '내 약속', icon: '◷' },
    { id: 'mypage', label: '마이페이지', icon: '○' },
  ];

  return (
    <nav className="helper-bottom-nav" aria-label="청년 메뉴">
      {navItems.map((item) => (
        <button
          key={item.id}
          type="button"
          className={activeTab === item.id ? 'active' : ''}
          aria-current={activeTab === item.id ? 'page' : undefined}
          onClick={() => onChange(item.id)}
        >
          <span className="helper-nav-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

function HelperMyPage({
  profile,
  refreshKey,
}: {
  profile: Profile;
  refreshKey: number;
}) {
  return (
    <section className="helper-mypage-stack">
      <section className="helper-profile-card">
        <div className="helper-avatar" aria-hidden="true">
          {shortDisplayName(profile.name).slice(0, 1)}
        </div>
        <div>
          <p className="eyebrow">마이페이지</p>
          <h1>{profile.name}</h1>
          <p>{profile.village ?? '다로리'} · {profile.address_public ?? '주소 미등록'}</p>
        </div>
      </section>
      <CreditSummaryPanel
        profile={profile}
        refreshKey={refreshKey}
      />
      <ActivityPanel
        audience="helper"
        profile={profile}
        refreshKey={refreshKey}
      />
    </section>
  );
}

function HelperFeed({
  profile,
  onAccepted,
}: {
  profile: Profile;
  onAccepted: () => void;
}) {
  const [requests, setRequests] = useState<HelpRequestWithRequester[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] =
    useState<HelpRequestWithRequester | null>(null);
  const [category, setCategory] = useState<HelpCategory | 'all'>('all');
  const [sort, setSort] = useState<'latest' | 'distance'>('latest');
  const [newOnly, setNewOnly] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [coordinates, setCoordinates] = useState<{
    latitude: number | null;
    longitude: number | null;
    source: 'profile' | 'current' | 'unavailable';
  }>({
    latitude: profile.latitude,
    longitude: profile.longitude,
    source:
      profile.latitude !== null && profile.longitude !== null
        ? 'profile'
        : 'unavailable',
  });

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: 'current',
        });
      },
      () => {
        setCoordinates({
          latitude: profile.latitude,
          longitude: profile.longitude,
          source:
            profile.latitude !== null && profile.longitude !== null
              ? 'profile'
              : 'unavailable',
        });
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
    );
  }, [profile.latitude, profile.longitude]);

  const loadPublishedRequests = useCallback(
    async (append = false, offset = 0) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
    setError(null);

    const { data, error: requestError } = await supabase.rpc(
      'list_published_help_requests',
      {
        p_sort: sort,
        p_category: category === 'all' ? null : category,
        p_new_only: newOnly,
        p_limit: 10,
        p_offset: append ? offset : 0,
        p_latitude: coordinates.latitude,
        p_longitude: coordinates.longitude,
        p_search: null,
      },
    );

    if (requestError) {
      setError(requestError.message);
      if (!append) {
        setRequests([]);
      }
      setHasMore(false);
    } else {
      const nextRequests = ((data ?? []) as PublishedHelpRequestRow[]).map(
        mapPublishedRequest,
      );
      setRequests((current) =>
        append ? [...current, ...nextRequests] : nextRequests,
      );
      setHasMore(nextRequests.length === 10);
    }

      setLoading(false);
      setLoadingMore(false);
    },
    [
      category,
      coordinates.latitude,
      coordinates.longitude,
      newOnly,
      sort,
    ],
  );

  useEffect(() => {
    void loadPublishedRequests(false);
  }, [loadPublishedRequests]);

  async function acceptRequest(id: string, timeOptionId?: string | null) {
    setWorkingId(id);
    setError(null);

    const { error: rpcError } = await supabase.rpc('apply_help_request', {
      p_help_request_id: id,
      p_time_option_id: timeOptionId ?? null,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      await loadPublishedRequests(false);
      onAccepted();
    }

    setWorkingId(null);
  }

  async function acceptSelectedRequest(
    request: HelpRequestWithRequester,
    timeOptionId?: string | null,
  ) {
    await acceptRequest(request.id, timeOptionId);
    setSelectedRequest((current) =>
      current?.id === request.id
        ? {
            ...current,
            current_helper_assignment_status: 'applied',
            current_helper_time_option_id: timeOptionId ?? current.current_helper_time_option_id,
            application_state: 'pending',
          }
        : current,
    );
  }

  const newCount = requests.filter((request) => request.is_new).length;
  const nudge =
    requests.length === 0
      ? '지금은 근처에 요청이 없어요. 조금 이따 다시 와주세요.'
      : newCount > 0
        ? `오늘 근처에 새로운 도움 요청이 ${newCount}개 있어요!`
        : '어떤 이웃을 도와드릴까요? 천천히 둘러보세요.';

  return (
    <section className="panel explore-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">일손 탐색</p>
          <h2>도움 요청</h2>
        </div>
        <button
          type="button"
          onClick={() => void loadPublishedRequests()}
          disabled={loading}
        >
          새로고침
        </button>
      </div>

      <div className="nudge-row">
        <img src={logoImage} alt="" aria-hidden="true" />
        <p>{nudge}</p>
      </div>

      <div className="filter-stack" aria-label="도움 요청 필터">
        <div className="filter-row category-filter-row">
          <button
            type="button"
            className={category === 'all' ? 'filter-chip active' : 'filter-chip'}
            onClick={() => setCategory('all')}
          >
            전체
          </button>
          {helpCategoryOptions.map((option) => (
            <button
              key={option}
              type="button"
              className={category === option ? 'filter-chip active' : 'filter-chip'}
              onClick={() => setCategory(option)}
            >
              {categoryLabel(option)}
            </button>
          ))}
        </div>
        <div className="filter-row filter-toggle-row">
          <button
            type="button"
            className={sort === 'distance' ? 'filter-chip active' : 'filter-chip'}
            onClick={() => setSort(sort === 'distance' ? 'latest' : 'distance')}
            disabled={coordinates.latitude === null || coordinates.longitude === null}
          >
            가까운 순
          </button>
          <button
            type="button"
            className={newOnly ? 'filter-chip active' : 'filter-chip'}
            onClick={() => setNewOnly((current) => !current)}
            title="게시 후 48시간 이내 요청"
          >
            NEW
          </button>
        </div>
      </div>

      <p className="hint">
        {coordinates.source === 'current'
          ? '현재 위치 기준으로 거리를 계산합니다.'
          : coordinates.source === 'profile'
            ? '위치 권한이 없어서 가입 주소 기준으로 거리를 계산합니다.'
            : '등록된 위치가 없어 거리 배지는 표시하지 않습니다.'}
      </p>

      {error ? <p className="error-message">{error}</p> : null}
      {loading ? <p className="muted">도움 요청을 불러오는 중...</p> : null}
      {!loading && requests.length === 0 ? (
        <div className="empty-state">
          <img src={wordmarkImage} alt="" aria-hidden="true" />
          <p>아직 도움 요청이 없어요</p>
        </div>
      ) : null}

      <div className="request-list">
        {requests.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            compactPrivateFields
            actions={
              <>
                <button
                  type="button"
                  onClick={() => setSelectedRequest(request)}
                >
                  {request.current_helper_assignment_status ||
                  request.is_full ||
                  request.applications_locked
                    ? '상세'
                    : '상세 / 신청'}
                </button>
              </>
            }
          />
        ))}
      </div>

      {hasMore ? (
        <div className="button-row load-more-row">
          <button
            type="button"
            className="secondary"
            onClick={() => void loadPublishedRequests(true, requests.length)}
            disabled={loadingMore}
          >
            더 보기
          </button>
        </div>
      ) : null}

      {selectedRequest ? (
        <RequestDetailModal
          audience="helper"
          request={selectedRequest}
          working={workingId === selectedRequest.id}
          onApply={(timeOptionId) => void acceptSelectedRequest(selectedRequest, timeOptionId)}
          onClose={() => setSelectedRequest(null)}
        />
      ) : null}
    </section>
  );
}

function HelperAssignments({
  profile,
  onCreditEarned,
}: {
  profile: Profile;
  onCreditEarned: (celebration: CreditCelebration) => void;
}) {
  const [assignments, setAssignments] = useState<AssignmentWithRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [selectedAssignment, setSelectedAssignment] =
    useState<AssignmentWithRequest | null>(null);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: assignmentError } = await supabase.rpc(
      'list_my_helper_assignments',
    );

    if (assignmentError) {
      setError(assignmentError.message);
      setAssignments([]);
    } else {
      const nextAssignments = ((data ?? []) as HelperAssignmentRpcRow[]).map(
        mapHelperAssignment,
      );
      setAssignments(nextAssignments);

      const creditedAssignment = nextAssignments.find((assignment) => {
        const creditedAmount = assignmentCreditAmount(assignment);
        if (creditedAmount <= 0 || assignment.status !== 'confirmed') {
          return false;
        }

        const celebrationKey = creditCelebrationStorageKey(
          profile.id,
          assignment.id,
          creditedAmount,
        );
        return localStorage.getItem(celebrationKey) !== 'shown';
      });

      if (creditedAssignment) {
        const creditedAmount = assignmentCreditAmount(creditedAssignment);
        const { data: creditRows } = await supabase
          .from('credit_ledger')
          .select('amount')
          .eq('profile_id', profile.id);
        const totalCredits =
          creditRows?.reduce((sum, credit) => sum + credit.amount, 0) ??
          creditedAmount;
        const request = normalizeOne(creditedAssignment.help_request);
        const requester = normalizeOne(request?.requester);

        localStorage.setItem(
          creditCelebrationStorageKey(
            profile.id,
            creditedAssignment.id,
            creditedAmount,
          ),
          'shown',
        );
        onCreditEarned({
          assignmentId: creditedAssignment.id,
          title: request?.title ?? '도움 활동',
          requesterName: requester?.name ?? '어르신',
          amount: creditedAmount,
          totalCredits,
        });
      }
    }

    setLoading(false);
  }, [onCreditEarned, profile.id]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  async function submitCompletion(assignment: AssignmentWithRequest) {
    const file = files[assignment.id];
    if (!file) {
      setError('완료 사진을 선택한 뒤 제출하세요.');
      return;
    }

    const note = notes[assignment.id]?.trim() ?? '';

    setWorkingId(assignment.id);
    setError(null);

    const extension = file.name.split('.').pop() || 'jpg';
    const imagePath = `${assignment.id}/${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('completion-proofs')
      .upload(imagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      setError(uploadError.message);
      setWorkingId(null);
      return;
    }

    const { error: rpcError } = await supabase.rpc('submit_completion', {
      p_assignment_id: assignment.id,
      p_image_path: imagePath,
      p_note: note || null,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setFiles((current) => ({ ...current, [assignment.id]: null }));
      setNotes((current) => ({ ...current, [assignment.id]: '' }));
      await loadAssignments();
    }

    setWorkingId(null);
  }

  async function cancelApplication(assignmentId: string) {
    setWorkingId(assignmentId);
    setError(null);

    const { error: rpcError } = await supabase.rpc('cancel_help_application', {
      p_assignment_id: assignmentId,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      await loadAssignments();
    }

    setWorkingId(null);
  }

  async function moveApplication(assignmentId: string) {
    setWorkingId(assignmentId);
    setError(null);

    const { error: rpcError } = await supabase.rpc(
      'move_help_application_to_locked_option',
      {
        p_assignment_id: assignmentId,
      },
    );

    if (rpcError) {
      setError(rpcError.message);
    } else {
      await loadAssignments();
    }

    setWorkingId(null);
  }

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">나의 활동</p>
          <h2>수락한 도움</h2>
        </div>
        <button type="button" onClick={() => void loadAssignments()} disabled={loading}>
          새로고침
        </button>
      </div>

      {error ? <p className="error-message">{error}</p> : null}
      {loading ? <p className="muted">수락한 요청을 불러오는 중...</p> : null}
      {!loading && assignments.length === 0 ? (
        <p className="muted">수락한 도움이 여기에 표시됩니다.</p>
      ) : null}

      <div className="request-list">
        {assignments.map((assignment) => (
          <HelperAssignmentCard
            key={assignment.id}
            assignment={assignment}
            busy={workingId === assignment.id}
            onCancel={() => void cancelApplication(assignment.id)}
            onMove={() => void moveApplication(assignment.id)}
            onViewDetails={() => setSelectedAssignment(assignment)}
          />
        ))}
      </div>

      {selectedAssignment ? (
        <AcceptedHelpDetailModal
          assignment={selectedAssignment}
          file={files[selectedAssignment.id] ?? null}
          note={notes[selectedAssignment.id] ?? ''}
          busy={workingId === selectedAssignment.id}
          onFileChange={(file) =>
            setFiles((current) => ({
              ...current,
              [selectedAssignment.id]: file,
            }))
          }
          onNoteChange={(note) =>
            setNotes((current) => ({
              ...current,
              [selectedAssignment.id]: note,
            }))
          }
          onSubmit={() => void submitCompletion(selectedAssignment)}
          onClose={() => setSelectedAssignment(null)}
        />
      ) : null}
    </section>
  );
}

function CreditSummaryPanel({
  profile,
  refreshKey,
  variant = 'panel',
}: {
  profile: Profile;
  refreshKey: number;
  variant?: 'panel' | 'hero';
}) {
  const [credits, setCredits] = useState<CreditLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCredits = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: creditError } = await supabase
      .from('credit_ledger')
      .select('*')
      .eq('profile_id', profile.id)
      .order('created_at', { ascending: false });

    if (creditError) {
      setError(creditError.message);
      setCredits([]);
    } else {
      setCredits(data ?? []);
    }

    setLoading(false);
  }, [profile.id]);

  useEffect(() => {
    void loadCredits();
  }, [loadCredits, refreshKey]);

  const totalCredits = credits.reduce((sum, credit) => sum + credit.amount, 0);
  const latestCredit = credits[0] ?? null;

  const content = (
    <>
      <div className="section-header">
        <div>
          <p className="eyebrow">크레딧 시스템</p>
          <h2>내 총 크레딧</h2>
        </div>
        <button type="button" onClick={() => void loadCredits()} disabled={loading}>
          새로고침
        </button>
      </div>
      {error ? <p className="error-message">{error}</p> : null}
      <div className="credit-total">{loading ? '...' : formatCredits(totalCredits)}</div>
      {latestCredit ? (
        <p className="hint">
          최근 적립: {formatCredits(latestCredit.amount)} ·{' '}
          {creditReasonLabel(latestCredit.reason)}
        </p>
      ) : (
        <p className="hint">활동이 승인되면 크레딧이 적립됩니다.</p>
      )}
    </>
  );

  if (variant === 'hero') {
    return <div className="credit-panel hero-credit-panel">{content}</div>;
  }

  return (
    <section className="panel credit-panel">
      {content}
    </section>
  );
}

function ActivityPanel({
  audience,
  profile,
  refreshKey,
}: {
  audience: 'admin' | 'helper';
  profile: Profile;
  refreshKey: number;
}) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (audience === 'admin') {
      const { error: refreshError } = await supabase.rpc(
        'refresh_matching_operational_alerts',
      );

      if (refreshError) {
        setError(refreshError.message);
        setNotifications([]);
        setLoading(false);
        return;
      }
    }

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('channel', 'in_app');

    query =
      audience === 'admin'
        ? query.is('recipient_profile_id', null)
        : query.eq('recipient_profile_id', profile.id);

    const { data, error: notificationError } = await query
      .order('created_at', { ascending: false })
      .limit(20);

    if (notificationError) {
      setError(notificationError.message);
      setNotifications([]);
    } else {
      setNotifications(data ?? []);
    }

    setLoading(false);
  }, [audience, profile.id]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications, refreshKey]);

  return (
    <section className="panel activity-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">
            {audience === 'admin' ? '운영 알림' : '나의 알림'}
          </p>
          <h2>최근 활동</h2>
        </div>
        <button
          type="button"
          onClick={() => void loadNotifications()}
          disabled={loading}
        >
          새로고침
        </button>
      </div>

      {error ? <p className="error-message">{error}</p> : null}
      {loading ? <p className="muted">활동 내역을 불러오는 중...</p> : null}
      {!loading && notifications.length === 0 ? (
        <p className="muted">아직 활동 알림이 없습니다.</p>
      ) : null}

      <ol className="activity-list" aria-label="Recent activity">
        {notifications.map((notification) => {
          const payload = readNotificationPayload(notification.payload);

          return (
            <li key={notification.id} className="activity-item">
              <div>
                <span className="status-badge">
                  {notificationPurposeLabel(notification.purpose)}
                </span>
                <p>{notificationSummary(notification, payload, audience)}</p>
              </div>
              <time dateTime={notification.created_at}>
                {formatDateTime(notification.created_at)}
              </time>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function AdminReviewModal({
  request,
  onClose,
  onSaved,
  onReviewed,
}: {
  request: HelpRequestWithRequester;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onReviewed: (requestId: string) => void;
}) {
  const requester = normalizeOne(request.requester);
  const [form, setForm] = useState(() => ({
    category: request.category,
    title: request.title,
    content: request.content,
    items_needed_details: request.items_needed_details ?? '',
    appointment_time: toDateTimeLocalValue(request.appointment_time),
    location_public: request.location_public ?? requester?.address_public ?? '',
    location_detail: request.location_detail ?? requester?.address_detail ?? '',
    location_latitude: request.location_latitude?.toString() ?? '',
    location_longitude: request.location_longitude?.toString() ?? '',
    credit_reward: request.credit_reward.toString(),
    required_helpers: request.required_helpers.toString(),
    safety_tier: request.safety_tier,
    estimated_duration_minutes: request.estimated_duration_minutes.toString(),
    admin_notes: request.admin_notes ?? '',
    reject_reason: request.reject_reason ?? '',
  }));
  const [voiceCalls, setVoiceCalls] = useState<VoiceCallRow[]>([]);
  const [loadingVoice, setLoadingVoice] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoadingVoice(true);

    supabase
      .from('voice_calls')
      .select('*')
      .eq('help_request_id', request.id)
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data }) => {
        if (!mounted) {
          return;
        }
        setVoiceCalls(data ?? []);
        setLoadingVoice(false);
      });

    return () => {
      mounted = false;
    };
  }, [request.id]);

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function buildPatch() {
    return {
      category: form.category,
      title: form.title,
      content: form.content,
      items_needed_details: form.items_needed_details || null,
      appointment_time: form.appointment_time
        ? new Date(form.appointment_time).toISOString()
        : null,
      location_public: form.location_public || null,
      location_detail: form.location_detail || null,
      location_latitude: form.location_latitude
        ? Number(form.location_latitude)
        : null,
      location_longitude: form.location_longitude
        ? Number(form.location_longitude)
        : null,
      required_helpers: Number(form.required_helpers),
      safety_tier: form.safety_tier,
      estimated_duration_minutes: Number(form.estimated_duration_minutes),
      admin_notes: form.admin_notes || null,
    } satisfies Json;
  }

  async function saveEdits() {
    setBusy(true);
    setFeedback(null);

    const { error: rpcError } = await supabase.rpc('admin_update_help_request', {
      p_help_request_id: request.id,
      p_patch: buildPatch(),
    });

    if (rpcError) {
      setFeedback({
        tone: 'error',
        text: adminReviewErrorMessage(rpcError.message),
      });
      setBusy(false);
      return false;
    }

    setFeedback({
      tone: 'success',
      text: '수정 내용을 저장했습니다. 게시나 반려 없이 닫아도 됩니다.',
    });
    await onSaved();
    setBusy(false);
    return true;
  }

  async function review(status: Extract<HelpRequestStatus, 'published' | 'rejected'>) {
    const saved = await saveEdits();
    if (!saved) {
      return;
    }

    setBusy(true);
    setFeedback(null);

    const { error: rpcError } = await supabase.rpc('review_help_request', {
      p_help_request_id: request.id,
      p_status: status,
      p_reject_reason:
        status === 'rejected' ? form.reject_reason || '운영자 검토 반려' : null,
    });

    if (rpcError) {
      setFeedback({
        tone: 'error',
        text: adminReviewErrorMessage(rpcError.message),
      });
    } else {
      onReviewed(request.id);
    }

    setBusy(false);
  }

  const latestVoiceCall = voiceCalls[0] ?? null;
  const baseCreditPreview = calculateBaseCredit(
    form.category,
    Number(form.estimated_duration_minutes),
  );

  return (
    <Modal title="공고 검토" onClose={onClose}>
      <div className="detail-stack">
        <section className="review-grid">
          <label>
            <span>제목 <span className="required-marker">*</span></span>
            <input
              value={form.title}
              onChange={(event) => updateField('title', event.target.value)}
            />
          </label>
          <label>
            카테고리
            <select
              value={form.category}
              onChange={(event) =>
                updateField('category', event.target.value as HelpCategory)
              }
            >
              {helpCategoryOptions.map((category) => (
                <option key={category} value={category}>
                  {categoryLabel(category)}
                </option>
              ))}
            </select>
          </label>
          <label className="review-wide">
            <span>본문 <span className="required-marker">*</span></span>
            <textarea
              value={form.content}
              onChange={(event) => updateField('content', event.target.value)}
              rows={4}
            />
          </label>
          <label className="review-wide">
            작업 특이사항
            <textarea
              value={form.items_needed_details}
              onChange={(event) =>
                updateField('items_needed_details', event.target.value)
              }
              rows={3}
            />
          </label>
          <label>
            <span>희망 일시 <span className="required-marker">*</span></span>
            <input
              type="datetime-local"
              value={form.appointment_time}
              onChange={(event) =>
                updateField('appointment_time', event.target.value)
              }
            />
          </label>
          <label>
            <span>필요 인원 <span className="required-marker">*</span></span>
            <input
              type="number"
              min={3}
              max={6}
              value={form.required_helpers}
              onChange={(event) =>
                updateField('required_helpers', event.target.value)
              }
            />
          </label>
          <label>
            예상 시간(분)
            <input
              type="number"
              min={15}
              step={15}
              value={form.estimated_duration_minutes}
              onChange={(event) =>
                updateField('estimated_duration_minutes', event.target.value)
              }
            />
          </label>
          <label>
            예상 크레딧
            <div className="readonly-field">{formatCredits(baseCreditPreview)}</div>
            <span className="field-help">
              카테고리와 예상 시간으로 자동 계산됩니다. 거리 보상은 청년별 위치 기준으로 더해집니다.
            </span>
          </label>
          <label>
            <span>안전 등급 <span className="required-marker">*</span></span>
            <select
              value={form.safety_tier}
              onChange={(event) =>
                updateField('safety_tier', event.target.value as SafetyTier)
              }
            >
              {safetyTierOptions.map((tier) => (
                <option key={tier} value={tier}>
                  {safetyTierLabel(tier)}
                </option>
              ))}
            </select>
            <span className="field-help">게시하려면 Tier 2 또는 Tier 3이어야 합니다.</span>
          </label>
          <label>
            <span>공개 장소 <span className="required-marker">*</span></span>
            <input
              value={form.location_public}
              onChange={(event) =>
                updateField('location_public', event.target.value)
              }
            />
          </label>
          <label>
            상세 주소
            <input
              value={form.location_detail}
              onChange={(event) =>
                updateField('location_detail', event.target.value)
              }
            />
          </label>
          <GeocodeLookupControl
            address={form.location_detail || form.location_public}
            onApply={(match) => {
              updateField('location_latitude', formatCoordinate(match.latitude));
              updateField(
                'location_longitude',
                formatCoordinate(match.longitude),
              );
            }}
          />
          <div className="coordinate-row review-wide">
            <label>
              위도
              <input
                value={form.location_latitude}
                placeholder="좌표 찾기 후 자동 입력"
                readOnly
              />
            </label>
            <label>
              경도
              <input
                value={form.location_longitude}
                placeholder="좌표 찾기 후 자동 입력"
                readOnly
              />
            </label>
          </div>
          <label className="review-wide">
            운영자 메모
            <textarea
              value={form.admin_notes}
              onChange={(event) =>
                updateField('admin_notes', event.target.value)
              }
              rows={3}
            />
          </label>
          <label className="review-wide">
            반려 사유
            <input
              value={form.reject_reason}
              onChange={(event) =>
                updateField('reject_reason', event.target.value)
              }
              placeholder="반려 시 어르신에게 전화로 안내할 사유"
            />
          </label>
        </section>

        <dl className="meta-grid">
          <div>
            <dt>요청자</dt>
            <dd>{requester?.name ?? '알 수 없음'}</dd>
          </div>
          <div>
            <dt>연락처</dt>
            <dd>{requester?.phone ?? '-'}</dd>
          </div>
          <div>
            <dt>개인 특이사항</dt>
            <dd>{requester?.personal_notes ?? '비공개 메모 없음'}</dd>
          </div>
          <div>
            <dt>상태</dt>
            <dd>{statusLabel(request.status)}</dd>
          </div>
        </dl>

        <section className="detail-section">
          <h4>어르신 발화 원문</h4>
          {loadingVoice ? <p className="muted">통화 정보를 불러오는 중...</p> : null}
          {!loadingVoice && !latestVoiceCall ? (
            <p className="muted">연결된 통화가 없습니다.</p>
          ) : null}
          {latestVoiceCall ? (
            <div className="detail-stack">
              <ConversationTranscript transcript={latestVoiceCall.transcript} />
              <JsonBlock
                label="AI 추출 원본"
                value={latestVoiceCall.extracted_payload ?? request.ai_extracted_payload}
              />
            </div>
          ) : null}
        </section>

        {feedback ? (
          <p className={feedback.tone === 'success' ? 'form-message' : 'error-message'}>
            {feedback.text}
          </p>
        ) : null}
        <div className="button-row">
          <button type="button" className="secondary" onClick={() => void saveEdits()} disabled={busy}>
            저장
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void review('rejected')}
            disabled={busy}
          >
            반려
          </button>
          <button type="button" onClick={() => void review('published')} disabled={busy}>
            게시
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RequestDetailModal({
  audience,
  request,
  working = false,
  onApply,
  onClose,
}: {
  audience: 'admin' | 'helper';
  request: HelpRequestWithRequester;
  working?: boolean;
  onApply?: (timeOptionId?: string | null) => void | Promise<void>;
  onClose: () => void;
}) {
  const [detailRequest, setDetailRequest] =
    useState<HelpRequestWithRequester | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(audience === 'helper');
  const [detailError, setDetailError] = useState<string | null>(null);
  const displayRequest = detailRequest ?? request;
  const requester = normalizeOne(displayRequest.requester);
  const [voiceCalls, setVoiceCalls] = useState<VoiceCallRow[]>([]);
  const [loadingVoice, setLoadingVoice] = useState(audience === 'admin');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [pendingApplyOption, setPendingApplyOption] =
    useState<HelpRequestTimeOption | null>(null);
  const helperCta = helperRequestCta(displayRequest);
  const timeOptions = displayRequest.time_options ?? [];
  const selectedAppliedOption = timeOptions.find(
    (option) => option.id === displayRequest.current_helper_time_option_id,
  );
  const lockedOption = timeOptions.find(
    (option) => option.id === displayRequest.locked_time_option_id,
  );

  const loadDetail = useCallback(async () => {
    if (audience !== 'helper') {
      setDetailRequest(null);
      setLoadingDetail(false);
      setDetailError(null);
      return;
    }

    setLoadingDetail(true);
    setDetailError(null);

    const { data, error } = await supabase.rpc('get_help_request_detail', {
      p_help_request_id: request.id,
      p_latitude: null,
      p_longitude: null,
    });

    if (error) {
      setDetailError(error.message);
      setDetailRequest(null);
    } else {
      setDetailRequest(
        data && data.length > 0 ? mapHelpRequestDetail(data[0]) : null,
      );
    }

    setLoadingDetail(false);
  }, [audience, request.id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  useEffect(() => {
    if (audience !== 'helper') {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void loadDetail();
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [audience, loadDetail]);

  async function handleApplyFromDetail(timeOptionId?: string | null) {
    if (!onApply || !helperCta.canApply) {
      return;
    }

    setApplying(true);
    try {
      await onApply(timeOptionId);
      await loadDetail();
    } finally {
      setApplying(false);
      setPendingApplyOption(null);
    }
  }

  useEffect(() => {
    let mounted = true;

    if (audience !== 'admin') {
      setLoadingVoice(false);
      setVoiceCalls([]);
      setVoiceError(null);
      return () => {
        mounted = false;
      };
    }

    setLoadingVoice(true);
    setVoiceError(null);

    supabase
      .from('voice_calls')
      .select('*')
      .eq('help_request_id', displayRequest.id)
      .order('created_at', { ascending: false })
      .limit(3)
      .then(({ data, error }) => {
        if (!mounted) {
          return;
        }

        if (error) {
          setVoiceError(error.message);
          setVoiceCalls([]);
        } else {
          setVoiceCalls(data ?? []);
        }

        setLoadingVoice(false);
      });

    return () => {
      mounted = false;
    };
  }, [audience, displayRequest.id]);

  const latestVoiceCall = voiceCalls[0] ?? null;

  return (
    <Modal
      title={audience === 'admin' ? '요청 상세' : '도움 요청 상세'}
      onClose={onClose}
    >
      <div className="detail-stack">
        {loadingDetail ? (
          <p className="muted">상세 정보를 불러오는 중...</p>
        ) : null}
        {detailError ? <p className="error-message">{detailError}</p> : null}

        <div>
          <span className="status-badge">{statusLabel(displayRequest.status)}</span>
          <h3>{displayRequest.title}</h3>
          <p>{displayRequest.content}</p>
        </div>

        <dl className="meta-grid">
          <div>
            <dt>요청자</dt>
            <dd>{requester?.name ?? '알 수 없음'}</dd>
          </div>
          {audience === 'admin' ? (
            <div>
              <dt>연락처</dt>
              <dd>{requester?.phone ?? '-'}</dd>
            </div>
          ) : null}
          <div>
            <dt>확정 활동 시간</dt>
            <dd>{formatDateTime(displayRequest.appointment_time)}</dd>
          </div>
          <div>
            <dt>요청 장소</dt>
            <dd>{displayRequest.location_public ?? requester?.address_public ?? '-'}</dd>
          </div>
          {audience === 'admin' ? (
            <div>
              <dt>상세 주소</dt>
              <dd>
                {displayRequest.location_detail ?? requester?.address_detail ?? '-'}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>카테고리</dt>
            <dd>{categoryLabel(displayRequest.category)}</dd>
          </div>
          <div>
            <dt>지급 예정 크레딧</dt>
            <dd>{formatCredits(displayRequest.credit_reward)}</dd>
          </div>
          <div>
            <dt>필요 인원</dt>
            <dd>
              {displayRequest.accepted_count ?? 0}/{displayRequest.required_helpers}명 확정 ·{' '}
              {displayRequest.applied_count ?? 0}명 신청
            </dd>
          </div>
          <div>
            <dt>안전 등급</dt>
            <dd>{safetyTierLabel(displayRequest.safety_tier)}</dd>
          </div>
          <div>
            <dt>준비물 구비</dt>
            <dd>{formatBoolean(displayRequest.items_provided)}</dd>
          </div>
          <div>
            <dt>준비물 메모</dt>
            <dd>{displayRequest.items_needed_details ?? '-'}</dd>
          </div>
        </dl>

        {audience === 'helper' ? (
          <>
            <div className="locked-info-box">
              <strong>상세 주소·연락처는 매칭 확정 후 안내돼요</strong>
              <p>
                지금은 어르신 성함과 대략 위치만 확인할 수 있습니다.
              </p>
            </div>

            {timeOptions.length > 0 ? (
              <section className="detail-section">
                <div className="section-header compact">
                  <div>
                    <p className="eyebrow">활동 시간 선택</p>
                    <h4>가능한 시간대</h4>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void loadDetail()}
                    disabled={loadingDetail}
                  >
                    현황 새로고침
                  </button>
                </div>
                <div className="time-option-grid">
                  {timeOptions.map((option) => {
                    const isMine =
                      option.id === displayRequest.current_helper_time_option_id;
                    const isLocked = option.status === 'locked';
                    const isClosed = option.status === 'closed';
                    const canPick =
                      helperCta.canApply &&
                      option.is_available &&
                      !isClosed &&
                      (!displayRequest.locked_time_option_id || isLocked);

                    return (
                      <article
                        key={option.id}
                        className={[
                          'time-option-card',
                          isMine ? 'selected' : '',
                          isLocked ? 'locked' : '',
                          isClosed ? 'closed' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <div>
                          <span className="status-badge">
                            {isLocked ? '확정 시간' : isClosed ? '마감' : '신청 가능'}
                          </span>
                          <h5>{option.label}</h5>
                          <p>{formatDateTime(option.starts_at)}</p>
                        </div>
                        <dl className="mini-meta-grid">
                          <div>
                            <dt>신청</dt>
                            <dd>{option.applied_count}/6명</dd>
                          </div>
                          <div>
                            <dt>확정</dt>
                            <dd>{option.accepted_count}명</dd>
                          </div>
                        </dl>
                        {isMine ? (
                          <p className="hint">내가 신청한 시간대입니다.</p>
                        ) : null}
                        {canPick ? (
                          <button
                            type="button"
                            onClick={() => setPendingApplyOption(option)}
                            disabled={working || applying || loadingDetail}
                          >
                            이 시간에 신청
                          </button>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <div className="detail-cta-bar">
              <div>
                <p className="eyebrow">신청 상태</p>
                <strong>{helperCta.message}</strong>
                {displayRequest.application_state === 'locked_my_time' && lockedOption ? (
                  <p className="hint">
                    {formatDateTime(lockedOption.starts_at)} 시간대로 진행 준비 중입니다.
                  </p>
                ) : null}
                {displayRequest.application_state === 'move_needed' && lockedOption ? (
                  <p className="error-message">
                    다른 시간대가 먼저 확정됐어요. 내 약속에서 확정 시간대로 옮기거나
                    무페널티로 신청을 취소할 수 있습니다.
                  </p>
                ) : null}
                {selectedAppliedOption ? (
                  <p className="hint">
                    내 신청 시간: {formatDateTime(selectedAppliedOption.starts_at)}
                  </p>
                ) : null}
                {displayRequest.application_deadline ? (
                  <p className="muted">
                    신청 마감: {formatDateTime(displayRequest.application_deadline)}
                  </p>
                ) : null}
              </div>
              {timeOptions.length === 0 ? (
                <button
                  type="button"
                  onClick={() => void handleApplyFromDetail(null)}
                  disabled={!helperCta.canApply || working || applying || loadingDetail}
                >
                  {working || applying ? '처리 중...' : helperCta.label}
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        {audience === 'admin' ? (
          <>
            {displayRequest.admin_notes ? (
              <section className="detail-section">
                <h4>운영자 메모</h4>
                <p>{displayRequest.admin_notes}</p>
              </section>
            ) : null}

            <section className="detail-section">
              <h4>전화 접수</h4>
              {loadingVoice ? (
                <p className="muted">통화 정보를 불러오는 중...</p>
              ) : null}
              {voiceError ? <p className="error-message">{voiceError}</p> : null}
              {!loadingVoice && !voiceError && !latestVoiceCall ? (
                <p className="muted">이 요청과 연결된 통화가 없습니다.</p>
              ) : null}
              {latestVoiceCall ? (
                <div className="detail-stack">
                  <dl className="meta-grid">
                    <div>
                      <dt>통화 상태</dt>
                      <dd>{latestVoiceCall.status ?? '-'}</dd>
                    </div>
                    <div>
                      <dt>발신자</dt>
                      <dd>{latestVoiceCall.phone}</dd>
                    </div>
                    <div>
                      <dt>신뢰도</dt>
                      <dd>{latestVoiceCall.confidence ?? '-'}</dd>
                    </div>
                    <div>
                      <dt>어르신 확인</dt>
                      <dd>{formatBoolean(latestVoiceCall.confirmed_by_requester)}</dd>
                    </div>
                  </dl>
                  <div>
                    <h5>통화 내용</h5>
                    <ConversationTranscript transcript={latestVoiceCall.transcript} />
                  </div>
                  <JsonBlock
                    label="추출 데이터"
                    value={
                      latestVoiceCall.extracted_payload ??
                      request.ai_extracted_payload
                    }
                  />
                </div>
              ) : null}
              {!latestVoiceCall ? (
                <JsonBlock label="AI 데이터" value={request.ai_extracted_payload} />
              ) : null}
            </section>
          </>
        ) : null}
      </div>
      {audience === 'helper' && pendingApplyOption ? (
        <Modal
          title="신청 확인"
          onClose={() => setPendingApplyOption(null)}
        >
          <div className="detail-stack">
            <p className="eyebrow">확정 시간 확인</p>
            <h3>{formatDateTime(pendingApplyOption.starts_at)}</h3>
            <p>
              이 시간에 참여 신청할까요? 신청 후에는 수락 대기 상태가 되며,
              약속 확정 전까지 무페널티로 취소할 수 있습니다.
            </p>
            <div className="button-row">
              <button
                type="button"
                className="secondary"
                onClick={() => setPendingApplyOption(null)}
                disabled={applying}
              >
                취소하기
              </button>
              <button
                type="button"
                onClick={() => void handleApplyFromDetail(pendingApplyOption.id)}
                disabled={applying || working}
              >
                {applying ? '처리 중...' : '신청하기'}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </Modal>
  );
}

function CompletionDetailModal({
  assignment,
  onClose,
}: {
  assignment: AssignmentWithRequest;
  onClose: () => void;
}) {
  const request = normalizeOne(assignment.help_request);
  const requester = normalizeOne(request?.requester);
  const helper = normalizeOne(assignment.helper);
  const isPending = assignment.status === 'applied';
  const proof = assignment.completion_proofs?.[0] ?? null;

  return (
    <Modal title="완료 인증 상세" onClose={onClose}>
      <div className="detail-stack">
        <div>
          <span className="status-badge">{assignmentStatusLabel(assignment.status)}</span>
          <h3>{request?.title ?? '제목 없는 요청'}</h3>
          <p>{request?.content ?? '요청 상세가 없습니다.'}</p>
        </div>

        <dl className="meta-grid">
          <div>
            <dt>도움자</dt>
            <dd>{helper?.name ?? '알 수 없음'}</dd>
          </div>
          <div>
            <dt>요청자</dt>
            <dd>{requester?.name ?? '알 수 없음'}</dd>
          </div>
          <div>
            <dt>방문 시간</dt>
            <dd>{formatDateTime(request?.appointment_time ?? null)}</dd>
          </div>
          <div>
            <dt>상세 주소</dt>
            <dd>{request?.location_detail ?? requester?.address_detail ?? '-'}</dd>
          </div>
          <div>
            <dt>제출 시간</dt>
            <dd>{formatDateTime(proof?.submitted_at ?? null)}</dd>
          </div>
          <div>
            <dt>인증 상태</dt>
            <dd>{proof?.status ?? '-'}</dd>
          </div>
        </dl>

        <section className="map-preview">
          <img src={mapImage} alt="다로리 지도" />
          <span className="map-pin" aria-hidden="true">●</span>
        </section>

        <section className="detail-section">
          <h4>활동 후기</h4>
          <p>{proof?.note ?? '제출된 후기가 없습니다.'}</p>
        </section>

        {proof ? (
          <section className="detail-section">
            <h4>완료 사진</h4>
            <CompletionProofPreview imagePath={proof.image_path} />
          </section>
        ) : (
          <p className="muted">이 활동에 등록된 완료 사진이 없습니다.</p>
        )}
      </div>
    </Modal>
  );
}

function AcceptedHelpDetailModal({
  assignment,
  file,
  note,
  busy,
  onFileChange,
  onNoteChange,
  onSubmit,
  onClose,
}: {
  assignment: AssignmentWithRequest;
  file: File | null;
  note: string;
  busy: boolean;
  onFileChange: (file: File | null) => void;
  onNoteChange: (note: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const request = normalizeOne(assignment.help_request);
  const requester = normalizeOne(request?.requester);
  const proof = assignment.completion_proofs?.[0] ?? null;
  const creditedAmount = assignmentCreditAmount(assignment);
  const hasStarted = hasVisitStarted(request?.appointment_time ?? null);
  const canSubmitCompletion =
    assignment.status === 'accepted' &&
    hasStarted &&
    Boolean(file);
  const companions = assignment.companion_helpers ?? [];
  const requesterPhone = requester?.phone?.trim() ?? '';
  const expectedCredits = request?.credit_reward ?? 0;
  const reviewBonusCredits = note.trim().length > 0 ? 1000 : 0;

  return (
    <Modal title="방문 준비" onClose={onClose}>
      <div className="detail-stack accepted-detail">
        <div className="visit-hero">
          <span className="status-badge">{assignmentStatusLabel(assignment.status)}</span>
          <h3>{request?.title ?? '도움 활동'}</h3>
          <p>
            {requester?.name ?? '어르신'}께 방문하기 전에 시간, 장소, 연락 수단을
            확인하세요.
          </p>
        </div>

        <dl className="meta-grid">
          <div>
            <dt>방문 시간</dt>
            <dd>{formatDateTime(request?.appointment_time ?? null)}</dd>
          </div>
          <div>
            <dt>정확한 방문 주소</dt>
            <dd>
              {request?.location_detail ??
                requester?.address_detail ??
                request?.location_public ??
                '-'}
            </dd>
          </div>
          <div>
            <dt>어르신 연락처</dt>
            <dd>{requesterPhone || '-'}</dd>
          </div>
          <div>
            <dt>예상 크레딧</dt>
            <dd>{formatCredits(request?.credit_reward ?? 0)}</dd>
          </div>
          <div>
            <dt>확정 인원</dt>
            <dd>
              {request?.accepted_count ?? companions.length}/
              {request?.required_helpers ?? 3}명
            </dd>
          </div>
          <div>
            <dt>작업 참고</dt>
            <dd>{request?.items_needed_details ?? '추가 참고사항 없음'}</dd>
          </div>
        </dl>

        <section className="map-preview">
          <img src={mapImage} alt="다로리 지도" />
          <span className="map-pin" aria-hidden="true">●</span>
        </section>

        <section className="detail-section">
          <h4>동행 청년</h4>
          {companions.length > 0 ? (
            <div className="companion-chip-row">
              {companions.map((companion) => (
                <span className="companion-chip" key={companion.id}>
                  {companion.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted">확정된 동행 청년 정보가 아직 없습니다.</p>
          )}
        </section>

        <section className="detail-section guidance-box">
          <h4>방문 안내</h4>
          <ul>
            {personalGuidanceItems(requester?.personal_notes).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <div className="button-row">
          {requesterPhone ? (
            <a className="button-link secondary" href={`tel:${requesterPhone}`}>
              전화하기
            </a>
          ) : (
            <button type="button" className="secondary" disabled>
              연락처 없음
            </button>
          )}
        </div>

        {creditedAmount > 0 ? (
          <section className="detail-section">
            <h4>크레딧 적립</h4>
            <p>{formatCredits(creditedAmount)} 적립이 완료되었습니다.</p>
          </section>
        ) : null}

        {proof ? (
          <section className="detail-section">
            <h4>완료 인증</h4>
            <p>활동 후기와 인증 사진이 제출되었습니다.</p>
          </section>
        ) : null}

        {assignment.status === 'accepted' ? (
          <div className="completion-form">
            <p className="form-message">
              {hasStarted
                ? '오늘 도움, 잘 끝나셨나요? 사진으로 인증해주세요.'
                : '활동이 끝나면 인증해주세요. 방문 시간이 된 뒤 완료 인증을 제출할 수 있습니다.'}
            </p>
            <dl className="meta-grid">
              <div>
                <dt>적립 예상 크레딧</dt>
                <dd>{formatCredits(expectedCredits + reviewBonusCredits)}</dd>
              </div>
              <div>
                <dt>후기 보너스</dt>
                <dd>작성 시 1,000 크레딧</dd>
              </div>
            </dl>
            <label>
              완료 사진 <span className="required-marker">*필수</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) =>
                  onFileChange(event.target.files?.item(0) ?? null)
                }
              />
            </label>
            <label>
              한 줄 후기 <span className="muted">(선택 · 작성 시 보너스)</span>
              <input
                type="text"
                value={note}
                onChange={(event) => onNoteChange(event.target.value)}
                placeholder="오늘 활동은 어땠나요?"
              />
            </label>
            <div className="button-row">
              <button
                type="button"
                onClick={onSubmit}
                disabled={busy || !canSubmitCompletion}
              >
                완료 인증하기
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function CreditEarnedModal({
  celebration,
  onClose,
}: {
  celebration: CreditCelebration;
  onClose: () => void;
}) {
  return (
    <Modal title="크레딧 적립 완료" onClose={onClose}>
      <div className="credit-success">
        <span className="status-badge">적립 완료</span>
        <h3>크레딧이 적립되었어요!</h3>
        <p>
          {celebration.requesterName} 어르신의 {celebration.title} 활동을
          도와주셔서 감사합니다.
        </p>
        <dl className="meta-grid">
          <div>
            <dt>이번 적립</dt>
            <dd>{formatCredits(celebration.amount)}</dd>
          </div>
          <div>
            <dt>내 총 크레딧</dt>
            <dd>{formatCredits(celebration.totalCredits)}</dd>
          </div>
        </dl>
        <div className="button-row">
          <button type="button" onClick={onClose}>
            메인으로 돌아가기
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CompletionProofPreview({ imagePath }: { imagePath: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="proof-preview">
      <button
        type="button"
        className="secondary"
        onClick={() => setIsOpen((current) => !current)}
      >
        {isOpen ? '사진 숨기기' : '사진 보기'}
      </button>
      {isOpen ? (
        <div className="detail-stack">
          <ProofImage imagePath={imagePath} />
          <details className="proof-path-details">
            <summary>파일 경로</summary>
            <p className="hint">{imagePath}</p>
          </details>
        </div>
      ) : (
        <p className="hint">사진을 열 때만 이미지를 불러옵니다.</p>
      )}
    </div>
  );
}

function ProofImage({ imagePath }: { imagePath: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setSignedUrl(null);
    setError(null);

    supabase.storage
      .from('completion-proofs')
      .createSignedUrl(imagePath, 600)
      .then(({ data, error: signedUrlError }) => {
        if (!mounted) {
          return;
        }

        if (signedUrlError) {
          setError(signedUrlError.message);
        } else {
          setSignedUrl(data.signedUrl);
        }
      });

    return () => {
      mounted = false;
    };
  }, [imagePath]);

  if (error) {
    return <p className="error-message">{error}</p>;
  }

  if (!signedUrl) {
    return <p className="muted">완료 사진을 불러오는 중...</p>;
  }

  return <img className="proof-image" src={signedUrl} alt="완료 인증 사진" />;
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <button
        type="button"
        className="modal-close"
        onClick={onClose}
        aria-label="닫기"
      >
        X
      </button>
      <section
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="section-header">
          <h2>{title}</h2>
        </div>
        {children}
      </section>
    </div>
  );
}

function RequestCard({
  request,
  actions,
  compactPrivateFields = false,
}: {
  request: HelpRequestWithRequester;
  actions?: React.ReactNode;
  compactPrivateFields?: boolean;
}) {
  const requester = normalizeOne(request.requester);
  const appointment = useMemo(
    () => formatDateTime(request.appointment_time),
    [request.appointment_time],
  );
  const applicationStatus = request.current_helper_assignment_status;
  const primaryStatusLabel = applicationStatus
    ? assignmentStatusLabel(applicationStatus)
    : request.is_full
      ? '마감'
      : statusLabel(request.status);

  return (
    <article className="request-card">
      <div className="request-card-main">
        <div>
          <div className="badge-row">
            <span className={`category-badge category-${request.category}`}>
              {categoryLabel(request.category)}
            </span>
            <span className={request.is_full && !applicationStatus ? 'status-badge closed' : 'status-badge'}>
              {primaryStatusLabel}
            </span>
            {request.is_new ? <span className="new-badge">NEW</span> : null}
            {request.distance_meters !== undefined &&
            request.distance_meters !== null ? (
              <span className="distance-badge">
                {formatDistance(request.distance_meters)}
              </span>
            ) : null}
          </div>
          <h3>{request.title}</h3>
          {compactPrivateFields ? (
            <p>
              {requester?.name ?? '알 수 없음'} ·{' '}
              {request.location_public ?? requester?.address_public ?? '-'}
            </p>
          ) : (
            <p>{request.content}</p>
          )}
        </div>
        <dl className="meta-grid">
          <div>
            <dt>요청자</dt>
            <dd>{requester?.name ?? '알 수 없음'}</dd>
          </div>
          {!compactPrivateFields ? (
            <div>
              <dt>연락처</dt>
              <dd>{requester?.phone ?? '-'}</dd>
            </div>
          ) : null}
          <div>
            <dt>마을</dt>
            <dd>{requester?.village ?? '-'}</dd>
          </div>
          <div>
            <dt>요청 장소</dt>
            <dd>{request.location_public ?? requester?.address_public ?? '-'}</dd>
          </div>
          <div>
            <dt>확정 시간</dt>
            <dd>{appointment}</dd>
          </div>
          <div>
            <dt>크레딧</dt>
            <dd>{formatCredits(request.credit_reward)}</dd>
          </div>
          {!compactPrivateFields ? (
            <>
              <div>
                <dt>카테고리</dt>
                <dd>{categoryLabel(request.category)}</dd>
              </div>
              <div>
                <dt>접수 경로</dt>
                <dd>{request.source}</dd>
              </div>
            </>
          ) : null}
          {compactPrivateFields ? (
            <div>
              <dt>신청 현황</dt>
              <dd>
                {request.accepted_count ?? 0}/{request.required_helpers}명 확정 ·{' '}
                {request.applied_count ?? 0}명 신청
              </dd>
            </div>
          ) : null}
        </dl>
      </div>
      {actions ? <div className="button-row">{actions}</div> : null}
    </article>
  );
}

function HelperAssignmentCard({
  assignment,
  busy,
  onCancel,
  onMove,
  onViewDetails,
}: {
  assignment: AssignmentWithRequest;
  busy: boolean;
  onCancel: () => void;
  onMove: () => void;
  onViewDetails: () => void;
}) {
  const request = normalizeOne(assignment.help_request);
  const requester = normalizeOne(request?.requester);
  const proof = assignment.completion_proofs?.[0] ?? null;
  const creditedAmount = assignmentCreditAmount(assignment);
  const canViewPrivateLocation = assignment.status !== 'applied';
  const canOpenDetails = assignment.status !== 'applied';
  const timeOptions = request?.time_options ?? [];
  const selectedOption = timeOptions.find(
    (option) => option.id === assignment.time_option_id,
  );
  const lockedOption = timeOptions.find(
    (option) => option.id === request?.locked_time_option_id,
  );
  const applicationState = request?.application_state;

  return (
    <article className="request-card">
      <div>
        <span className="status-badge">
          {helperAssignmentDisplayStatus(assignment, applicationState)}
        </span>
        <h3>{request?.title ?? '제목 없는 요청'}</h3>
        <p>{request?.content ?? '요청 상세가 없습니다.'}</p>
        {assignment.status === 'applied' ? (
          <p className={applicationState === 'move_needed' ? 'error-message' : 'hint'}>
            {applicationState === 'move_needed' && lockedOption
              ? `다른 시간대가 먼저 확정됐어요. ${formatDateTime(lockedOption.starts_at)}로 옮기거나 무페널티로 취소하세요.`
              : applicationState === 'locked_my_time' && lockedOption
                ? `${formatDateTime(lockedOption.starts_at)} 시간대로 진행 준비 중입니다.`
                : '약속 확정을 위해 운영자 검토 중이에요. 약속 확정 전까지 무페널티로 취소할 수 있습니다.'}
          </p>
        ) : null}
      </div>
      <dl className="meta-grid">
        <div>
          <dt>요청자</dt>
          <dd>{requester?.name ?? '알 수 없음'}</dd>
        </div>
        <div>
          <dt>방문 시간</dt>
          <dd>
            {formatDateTime(
              selectedOption?.starts_at ??
                lockedOption?.starts_at ??
                request?.appointment_time ??
                null,
            )}
          </dd>
        </div>
        <div>
          <dt>방문 장소</dt>
          <dd>
            {canViewPrivateLocation
              ? request?.location_detail ?? request?.location_public ?? '-'
              : request?.location_public ?? '-'}
          </dd>
        </div>
        <div>
          <dt>크레딧</dt>
          <dd>
            {creditedAmount > 0
              ? `적립 완료 ${formatCredits(creditedAmount)}`
              : formatCredits(request?.credit_reward ?? 0)}
          </dd>
        </div>
        {proof ? (
          <div>
            <dt>인증 사진</dt>
            <dd>제출됨</dd>
          </div>
        ) : null}
      </dl>

      {assignment.status === 'applied' ? (
        <div className="button-row">
          {applicationState === 'move_needed' ? (
            <button type="button" onClick={onMove} disabled={busy}>
              확정 시간대로 옮기기
            </button>
          ) : null}
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
            신청 취소 · 무페널티
          </button>
        </div>
      ) : null}

      {canOpenDetails ? (
        <div className="button-row">
          <button type="button" onClick={onViewDetails}>
            {assignment.status === 'accepted' ? '방문 준비' : '활동 상세'}
          </button>
        </div>
      ) : null}
    </article>
  );
}

function ApplicationReviewCard({
  assignment,
  busy,
  onApprove,
  onReject,
}: {
  assignment: AssignmentWithRequest;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const request = normalizeOne(assignment.help_request);
  const requester = normalizeOne(request?.requester);
  const helper = normalizeOne(assignment.helper);
  const isPending = assignment.status === 'applied';

  return (
    <article className="request-card">
      <div>
        <span className="status-badge">{assignmentStatusLabel(assignment.status)}</span>
        <h3>{request?.title ?? '제목 없는 요청'}</h3>
        <p>
          {isPending
            ? `${helper?.name ?? '청년 도움자'}님의 도움 신청을 검토합니다.`
            : `${helper?.name ?? '청년 도움자'}님은 이미 매칭 승인됐습니다.`}
        </p>
      </div>
      <dl className="meta-grid">
        <div>
          <dt>신청자</dt>
          <dd>{helper?.name ?? '알 수 없음'}</dd>
        </div>
        <div>
          <dt>연락처</dt>
          <dd>{helper?.phone ?? '-'}</dd>
        </div>
        <div>
          <dt>요청자</dt>
          <dd>{requester?.name ?? '알 수 없음'}</dd>
        </div>
        <div>
          <dt>희망 시간</dt>
          <dd>{formatDateTime(request?.appointment_time ?? null)}</dd>
        </div>
        <div>
          <dt>필요 인원</dt>
          <dd>{request?.required_helpers ?? 3}명</dd>
        </div>
        <div>
          <dt>안전 등급</dt>
          <dd>{safetyTierLabel(request?.safety_tier ?? 'needs_review')}</dd>
        </div>
        <div>
          <dt>신청 시간</dt>
          <dd>{formatDateTime(assignment.applied_at)}</dd>
        </div>
        <div>
          <dt>개인 특이사항</dt>
          <dd>{requester?.personal_notes ?? '비공개 메모 없음'}</dd>
        </div>
      </dl>
      {isPending ? (
        <div className="button-row">
          <button type="button" className="secondary" onClick={onReject} disabled={busy}>
            반려
          </button>
          <button type="button" onClick={onApprove} disabled={busy}>
            매칭 승인
          </button>
        </div>
      ) : null}
    </article>
  );
}

function CompletionReviewCard({
  assignment,
  busy,
  onViewDetails,
  onConfirm,
}: {
  assignment: AssignmentWithRequest;
  busy: boolean;
  onViewDetails: () => void;
  onConfirm: () => void;
}) {
  const request = normalizeOne(assignment.help_request);
  const requester = normalizeOne(request?.requester);
  const helper = normalizeOne(assignment.helper);
  const proof = assignment.completion_proofs?.[0] ?? null;

  return (
    <article className="request-card">
      <div>
        <span className="status-badge">{assignmentStatusLabel(assignment.status)}</span>
        <h3>{request?.title ?? '제목 없는 요청'}</h3>
        <p>{request?.content ?? '요청 상세가 없습니다.'}</p>
      </div>
      <dl className="meta-grid">
        <div>
          <dt>도움자</dt>
          <dd>{helper?.name ?? '알 수 없음'}</dd>
        </div>
        <div>
          <dt>요청자</dt>
          <dd>{requester?.name ?? '알 수 없음'}</dd>
        </div>
        <div>
          <dt>방문 시간</dt>
          <dd>{formatDateTime(request?.appointment_time ?? null)}</dd>
        </div>
        <div>
          <dt>지급 크레딧</dt>
          <dd>{formatCredits(request?.credit_reward ?? 0)}</dd>
        </div>
        <div>
          <dt>인증 사진</dt>
          <dd>{proof ? '제출됨' : '-'}</dd>
        </div>
        <div>
          <dt>활동 후기</dt>
          <dd>{proof?.note ?? '-'}</dd>
        </div>
      </dl>
      <div className="button-row">
        <button type="button" className="secondary" onClick={onViewDetails}>
          인증 보기
        </button>
        <button type="button" onClick={onConfirm} disabled={busy}>
          승인하고 크레딧 지급
        </button>
      </div>
    </article>
  );
}

function normalizeOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function shortDisplayName(name: string) {
  const trimmed = name.trim();
  if (!trimmed.includes('@')) {
    return trimmed;
  }

  return trimmed.split('@')[0] || trimmed;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '미정';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value));
}

function formatDate(value: string | null) {
  if (!value) {
    return '미정';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value));
}

function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function categoryLabel(category: HelpRequestRow['category']) {
  const labels: Record<HelpRequestRow['category'], string> = {
    electronics: '전자제품',
    labor: '일손',
    daily_life: '생활편의',
    mobility_care: '이동/돌봄',
    household: '집안일',
    other: '기타',
  };

  return labels[category];
}

function safetyTierLabel(tier: SafetyTier) {
  const labels: Record<SafetyTier, string> = {
    tier_1: 'Tier 1 위험',
    tier_2: 'Tier 2 주의',
    tier_3: 'Tier 3 가능',
    needs_review: '확인 필요',
  };

  return labels[tier];
}

function statusLabel(status: HelpRequestStatus) {
  const labels: Record<HelpRequestStatus, string> = {
    draft: '작성 중',
    pending_review: '승인 대기',
    published: '신청 가능',
    accepted: '수락 완료',
    completed_submitted: '완료 승인 대기',
    confirmed: '완료 확인',
    credited: '크레딧 적립',
    closed: '완료',
    rejected: '반려',
    cancelled: '취소',
    disputed: '분쟁',
    expired: '만료',
  };

  return labels[status];
}

function assignmentStatusLabel(status: AssignmentRow['status']) {
  const labels: Record<AssignmentRow['status'], string> = {
    applied: '신청함',
    accepted: '수락 완료',
    completed_submitted: '완료 승인 대기',
    confirmed: '완료 확인',
    rejected: '신청 반려',
    cancelled: '취소',
    disputed: '분쟁',
    no_show: '노쇼',
  };

  return labels[status];
}

function helperAssignmentDisplayStatus(
  assignment: AssignmentWithRequest,
  applicationState?: string | null,
) {
  if (assignment.status !== 'applied') {
    return assignmentStatusLabel(assignment.status);
  }

  if (applicationState === 'locked_my_time') {
    return '내 시간대 확정 진행';
  }

  if (applicationState === 'move_needed') {
    return '이동 안내';
  }

  return '수락 대기';
}

function adminCallTaskStatusLabel(status: AdminCallTaskStatus) {
  const labels: Record<AdminCallTaskStatus, string> = {
    pending: '전화 대기',
    completed: '통화 완료',
  };

  return labels[status];
}

function helperRequestCta(request: HelpRequestWithRequester) {
  const assignmentStatus = request.current_helper_assignment_status;

  if (request.can_apply === false && request.apply_block_reason) {
    const blocked = helperApplyBlockReason(request.apply_block_reason);
    if (blocked) {
      return blocked;
    }
  }

  if (assignmentStatus) {
    if (assignmentStatus === 'applied' && request.application_state === 'locked_my_time') {
      return {
        label: '내 시간대 확정 진행',
        message: '내가 신청한 시간대가 먼저 모였어요. 운영자 최종 승인을 기다리고 있습니다.',
        canApply: false,
      };
    }

    if (assignmentStatus === 'applied' && request.application_state === 'move_needed') {
      return {
        label: '이동 안내',
        message: '다른 시간대가 먼저 확정됐어요. 내 약속에서 옮기거나 취소할 수 있습니다.',
        canApply: false,
      };
    }

    return {
      label: assignmentStatus === 'applied' ? '신청 완료 · 수락 대기 중' : assignmentStatusLabel(assignmentStatus),
      message:
        assignmentStatus === 'applied'
          ? '신청 완료! 운영자 확인 후 매칭이 확정돼요.'
          : '이 요청은 이미 내 활동 목록에 있습니다.',
      canApply: false,
    };
  }

  if (request.is_full) {
    return {
      label: '모집 마감',
      message: '이 요청은 모집이 마감됐어요.',
      canApply: false,
    };
  }

  if (request.applications_locked) {
    return {
      label: '신청 마감',
      message: '이 요청은 신청 가능한 시간이 지났어요.',
      canApply: false,
    };
  }

  return {
    label: '이 시간에 참여 신청하기',
    message: '활동 시간을 확인한 뒤 참여 신청할 수 있습니다.',
    canApply: true,
  };
}

function helperApplyBlockReason(reason: string) {
  const reasons: Record<
    string,
    { label: string; message: string; canApply: false }
  > = {
    already_applied: {
      label: '신청 완료 · 수락 대기 중',
      message: '신청 완료! 운영자 확인 후 매칭이 확정돼요.',
      canApply: false,
    },
    full: {
      label: '모집 마감',
      message: '정원이 충족되어 더 이상 신청할 수 없어요.',
      canApply: false,
    },
    deadline_passed: {
      label: '신청 마감',
      message: '이 요청은 신청 가능한 시간이 지났어요.',
      canApply: false,
    },
    not_helper: {
      label: '신청 불가',
      message: '청년 도움자 계정만 신청할 수 있어요.',
      canApply: false,
    },
  };

  return reasons[reason] ?? null;
}

function adminReviewErrorMessage(message: string) {
  if (
    message.includes(
      'Request is missing required publish fields or has unresolved safety risk',
    )
  ) {
    return '게시하려면 필수 항목을 모두 입력하고 안전 등급을 Tier 2 또는 Tier 3으로 확정해야 합니다.';
  }

  if (message.includes('Reject reason is required')) {
    return '반려하려면 반려 사유를 입력해야 합니다.';
  }

  if (message.includes('Title cannot be empty')) {
    return '제목을 입력해야 합니다.';
  }

  if (message.includes('Content cannot be empty')) {
    return '본문을 입력해야 합니다.';
  }

  if (message.includes('Only draft or pending_review requests can be edited')) {
    return '이미 검토가 끝난 공고는 이 화면에서 수정할 수 없습니다.';
  }

  return `처리 중 오류가 발생했습니다: ${message}`;
}

function adminMatchingErrorMessage(message: string) {
  if (message.includes('Underfilled match reason is required')) {
    return '부족 인원으로 확정하려면 사유를 입력해야 합니다.';
  }

  if (message.includes('one or fewer accepted helpers')) {
    return '확정된 청년이 1명 이하이면 무산 처리해야 합니다.';
  }

  if (message.includes('Failure reason is required')) {
    return '무산 처리하려면 사유를 입력해야 합니다.';
  }

  if (message.includes('Request already has the required number of helpers')) {
    return '이미 필요한 인원이 확정된 요청입니다.';
  }

  if (message.includes('Request is not open')) {
    return '현재 상태에서는 이 요청을 처리할 수 없습니다.';
  }

  return `처리 중 오류가 발생했습니다: ${message}`;
}

function adminCallTaskErrorMessage(message: string) {
  if (message.includes('Only mediators/admins can update admin call tasks')) {
    return '운영자만 전화 업무를 처리할 수 있습니다.';
  }

  if (message.includes('Admin call task not found')) {
    return '전화 업무를 찾을 수 없습니다.';
  }

  if (message.includes('Only pending call tasks can record no-answer attempts')) {
    return '이미 완료된 전화 업무에는 부재중을 기록할 수 없습니다.';
  }

  return `전화 업무 처리 중 오류가 발생했습니다: ${message}`;
}

function requesterDirectoryErrorMessage(message: string) {
  if (message.includes('Only mediators/admins can view requester profiles')) {
    return '운영자만 등록 어르신 명단을 확인할 수 있습니다.';
  }

  return `등록 명단을 불러오는 중 오류가 발생했습니다: ${message}`;
}

function formatCredits(value: number) {
  return `${new Intl.NumberFormat('ko-KR').format(value)} 크레딧`;
}

function calculateBaseCredit(category: HelpCategory, durationMinutes: number) {
  const duration = Math.max(Number.isFinite(durationMinutes) ? durationMinutes : 60, 15);
  const multiplier =
    category === 'labor'
      ? 1.5
      : category === 'daily_life' || category === 'household'
        ? 1.2
        : 1.0;

  return Math.round(15000 * (duration / 60) * multiplier);
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const nextValue = Number(trimmed);
  return Number.isFinite(nextValue) ? nextValue : null;
}

function formatCoordinate(value: number) {
  return value.toFixed(6);
}

function buildConsentDocumentPath(phone: string, fileName: string) {
  const requesterKey = phone.replace(/\D/g, '') || 'unknown-requester';
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14);
  const extension = (fileName.split('.').pop() ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const baseName =
    fileName
      .replace(/\.[^/.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'consent';

  return `requesters/${requesterKey}/${timestamp}-${baseName}${
    extension ? `.${extension}` : ''
  }`;
}

function requesterRegistrationErrorMessage(message: string) {
  if (message.includes('All required requester consents must be true')) {
    return '필수 동의 3가지를 모두 확인해야 등록할 수 있습니다.';
  }

  if (message.includes('Requester phone is required')) {
    return '전화번호를 입력해야 등록할 수 있습니다.';
  }

  if (message.includes('duplicate key')) {
    return '이미 등록된 전화번호입니다. 기존 어르신 정보를 확인하세요.';
  }

  if (message.includes('Only mediators/admins can register requesters')) {
    return '운영자만 어르신을 등록할 수 있습니다.';
  }

  return `등록 중 오류가 발생했습니다: ${message}`;
}

function formatDistance(value: number) {
  if (value < 1000) {
    return `${Math.round(value)}m`;
  }

  return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}km`;
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function creditReasonLabel(reason: CreditLedgerRow['reason']) {
  const labels: Record<CreditLedgerRow['reason'], string> = {
    task_completion: '활동 완료',
    review_bonus: '후기 보너스',
    manual_adjustment: '수동 조정',
    redemption: '사용',
  };

  return labels[reason];
}

function mapPublishedRequest(
  row: PublishedHelpRequestRow,
): HelpRequestWithRequester {
  return {
    id: row.id,
    requester_id: row.requester_id,
    approved_by: null,
    source: row.source,
    status: row.status,
    category: row.category,
    title: row.title,
    content: row.content,
    items_provided: row.items_provided,
    items_needed_details: row.items_needed_details,
    appointment_time: row.appointment_time,
    appointment_timezone: row.appointment_timezone,
    location_public: row.location_public,
    location_detail: null,
    location_latitude: row.location_latitude,
    location_longitude: row.location_longitude,
    credit_reward: row.credit_reward,
    required_helpers: row.required_helpers,
    safety_tier: row.safety_tier,
    reject_reason: null,
    rejected_at: null,
    estimated_duration_minutes: row.estimated_duration_minutes,
    ai_extracted_payload: null,
    admin_notes: null,
    created_at: row.created_at,
    updated_at: row.created_at,
    approved_at: null,
    published_at: row.published_at,
    requester: {
      id: row.requester_id,
      name: row.requester_name,
      phone: null,
      village: row.requester_village,
      address_public: row.requester_address_public,
      address_detail: null,
    },
    distance_meters: row.distance_meters,
    is_new: row.is_new,
    applied_count: row.applied_count,
    accepted_count: row.accepted_count,
    current_helper_assignment_id: row.current_helper_assignment_id,
    current_helper_assignment_status: row.current_helper_assignment_status,
    application_deadline: row.application_deadline,
    applications_locked: row.applications_locked,
    is_full: row.is_full,
  };
}

function mapHelpRequestDetail(row: HelpRequestDetailRow): HelpRequestWithRequester {
  return {
    id: row.id,
    requester_id: row.requester_id,
    approved_by: null,
    source: row.source,
    status: row.status,
    category: row.category,
    title: row.title,
    content: row.content,
    items_provided: row.items_provided,
    items_needed_details: row.items_needed_details,
    appointment_time: row.appointment_time,
    appointment_timezone: row.appointment_timezone,
    location_public: row.location_public,
    location_detail: row.location_detail,
    location_latitude: row.location_latitude,
    location_longitude: row.location_longitude,
    credit_reward: row.credit_reward,
    required_helpers: row.required_helpers,
    safety_tier: row.safety_tier,
    reject_reason: null,
    rejected_at: null,
    estimated_duration_minutes: row.estimated_duration_minutes,
    ai_extracted_payload: null,
    admin_notes: null,
    created_at: row.created_at,
    updated_at: row.created_at,
    approved_at: null,
    published_at: row.published_at,
    requester: {
      id: row.requester_id,
      name: row.requester_name,
      phone: row.requester_phone,
      village: row.requester_village,
      address_public: row.requester_address_public,
      address_detail: row.requester_address_detail,
      personal_notes: row.requester_personal_notes,
    },
    distance_meters: row.distance_meters,
    is_new: row.is_new,
    applied_count: row.applied_count,
    accepted_count: row.accepted_count,
    current_helper_assignment_id: row.current_helper_assignment_id,
    current_helper_assignment_status: row.current_helper_assignment_status,
    current_helper_time_option_id: row.current_helper_time_option_id,
    locked_time_option_id: row.locked_time_option_id,
    time_options: normalizeTimeOptions(row.time_options),
    application_deadline: row.application_deadline,
    applications_locked: row.applications_locked,
    is_full: row.is_full,
    can_apply: row.can_apply,
    apply_block_reason: row.apply_block_reason,
    application_state: row.application_state,
  };
}

function mapHelperAssignment(row: HelperAssignmentRpcRow): AssignmentWithRequest {
  const assignment = row.assignment as unknown as AssignmentRow;
  const helpRequest = row.help_request as unknown as HelpRequestRow;
  const requester = row.requester as unknown as RequesterSummary;
  const companionHelpers = Array.isArray(row.companion_helpers)
    ? (row.companion_helpers as unknown as CompanionSummary[])
    : [];
  const completionProofs = Array.isArray(row.completion_proofs)
    ? (row.completion_proofs as unknown as CompletionProofRow[])
    : [];
  const creditLedger = Array.isArray(row.credit_ledger)
    ? (row.credit_ledger as unknown as CreditLedgerRow[])
    : [];

  return {
    ...assignment,
    help_request: {
      ...helpRequest,
      requester,
      time_options: normalizeTimeOptions((helpRequest as HelpRequestWithRequester).time_options),
      locked_time_option_id: (helpRequest as HelpRequestWithRequester).locked_time_option_id,
      application_state: (helpRequest as HelpRequestWithRequester).application_state,
    },
    companion_helpers: companionHelpers,
    completion_proofs: completionProofs,
    credit_ledger: creditLedger,
  };
}

function normalizeTimeOptions(value: unknown): HelpRequestTimeOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const option = item as Record<string, unknown>;
      if (
        typeof option.id !== 'string' ||
        typeof option.label !== 'string' ||
        typeof option.starts_at !== 'string'
      ) {
        return null;
      }

      const normalized: HelpRequestTimeOption = {
        id: option.id,
        label: option.label,
        starts_at: option.starts_at,
        timezone:
          typeof option.timezone === 'string' ? option.timezone : 'Asia/Seoul',
        status:
          option.status === 'locked' || option.status === 'closed'
            ? option.status
            : 'open',
        locked_at: typeof option.locked_at === 'string' ? option.locked_at : null,
        applied_count:
          typeof option.applied_count === 'number' ? option.applied_count : 0,
        accepted_count:
          typeof option.accepted_count === 'number' ? option.accepted_count : 0,
        is_locked: option.is_locked === true,
        is_available: option.is_available !== false,
        current_helper_assignment_id:
          typeof option.current_helper_assignment_id === 'string'
            ? option.current_helper_assignment_id
            : null,
        current_helper_assignment_status:
          typeof option.current_helper_assignment_status === 'string'
            ? (option.current_helper_assignment_status as AssignmentRow['status'])
            : null,
      };

      return normalized;
    })
    .filter((option): option is HelpRequestTimeOption => option !== null);
}

function assignmentCreditAmount(assignment: AssignmentWithRequest) {
  return (
    assignment.credit_ledger?.reduce((sum, credit) => sum + credit.amount, 0) ??
    0
  );
}

function creditCelebrationStorageKey(
  profileId: string,
  assignmentId: string,
  amount: number,
) {
  return `doum-credit-celebrated:${profileId}:${assignmentId}:${amount}`;
}

function hasVisitStarted(appointmentTime: string | null | undefined) {
  if (!appointmentTime) {
    return false;
  }

  const appointmentDate = new Date(appointmentTime);
  if (Number.isNaN(appointmentDate.getTime())) {
    return false;
  }

  return appointmentDate.getTime() <= Date.now();
}

function personalGuidanceItems(notes: string | null | undefined) {
  const baseGuidance = [
    '도착 전 어르신께 전화로 방문을 알려주세요.',
    '작업 중에는 동행 청년들과 함께 이동하고 혼자 떨어지지 마세요.',
  ];

  const noteItems =
    notes
      ?.split(/[\n.。]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => `운영 메모: ${item}`) ?? [];

  return noteItems.length > 0 ? [...noteItems, ...baseGuidance] : baseGuidance;
}

function formatBoolean(value: boolean | null | undefined) {
  if (value === true) {
    return 'Yes';
  }

  if (value === false) {
    return 'No';
  }

  return '-';
}

type ConversationMessage = {
  speaker: 'ai' | 'user';
  text: string;
};

function ConversationTranscript({
  transcript,
}: {
  transcript: string | null | undefined;
}) {
  const messages = parseTranscript(transcript);

  if (!transcript) {
    return <p className="muted">저장된 통화 내용이 없습니다.</p>;
  }

  if (messages.length === 0) {
    return <p className="transcript">{transcript}</p>;
  }

  return (
    <div className="conversation-transcript" aria-label="어르신 발화 원문">
      {messages.map((message, index) => (
        <div
          key={`${message.speaker}-${index}`}
          className={`conversation-row ${message.speaker}`}
        >
          <span className="conversation-label">
            {message.speaker === 'ai' ? 'AI' : '어르신'}
          </span>
          <p className="conversation-bubble">{message.text}</p>
        </div>
      ))}
    </div>
  );
}

function parseTranscript(transcript: string | null | undefined): ConversationMessage[] {
  if (!transcript) {
    return [];
  }

  const turns = [...transcript.matchAll(/\b(AI|User)\s*:\s*/g)];
  if (turns.length === 0) {
    return [];
  }

  return turns
    .map((turn, index) => {
      const nextTurn = turns[index + 1];
      const text = transcript
        .slice(turn.index + turn[0].length, nextTurn?.index ?? transcript.length)
        .trim();

      return {
        speaker: turn[1] === 'AI' ? 'ai' : 'user',
        text,
      } satisfies ConversationMessage;
    })
    .filter((message) => message.text.length > 0);
}

function JsonBlock({
  label,
  value,
}: {
  label: string;
  value: Json | null | undefined;
}) {
  return (
    <div>
      <h5>{label}</h5>
      {value ? (
        <pre className="json-block">{JSON.stringify(value, null, 2)}</pre>
      ) : (
        <p className="muted">저장된 JSON 데이터가 없습니다.</p>
      )}
    </div>
  );
}

function readNotificationPayload(
  payload: NotificationRow['payload'],
): NotificationPayload {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {};
  }

  const record = payload as Record<string, unknown>;

  return {
    title: readString(record.title),
    requester_name: readString(record.requester_name),
    requester_phone: readString(record.requester_phone),
    helper_name: readString(record.helper_name),
    appointment_time: readString(record.appointment_time),
    credit_reward: readNumber(record.credit_reward),
    accepted_helper_count: readNumber(record.accepted_helper_count),
    active_count: readNumber(record.active_count),
    status: readString(record.status),
  };
}

function notificationPurposeLabel(purpose: string) {
  const labels: Record<string, string> = {
    voice_request_created: '전화 접수',
    voice_request_needs_manual_entry: '수기 입력 필요',
    voice_unregistered_caller: '미등록 전화',
    voice_consent_missing: '동의 확인 필요',
    request_published: '공고 게시',
    request_rejected: '반려',
    assignment_applied: '도움 신청',
    assignment_approved: '매칭 승인',
    assignment_rejected: '신청 반려',
    request_accepted: '신청 완료',
    match_finalized: '매칭 확정',
    admin_call_task_created: '전화 업무 생성',
    matching_capacity_full: '승인 가능',
    matching_deadline_ready: '마감 도달',
    matching_deadline_underfilled: '미달 판단',
    matching_deadline_must_fail: '무산 검토',
  };

  return labels[purpose] ?? purpose;
}

function notificationSummary(
  notification: NotificationRow,
  payload: NotificationPayload,
  audience: 'admin' | 'helper',
) {
  const title = payload.title ?? '제목 없는 요청';

  switch (notification.purpose) {
    case 'voice_request_created':
      return `새 전화 요청: ${title}`;
    case 'voice_request_needs_manual_entry':
      return `수기 입력 필요: ${title}`;
    case 'voice_unregistered_caller':
      return '등록 명단에 없는 전화가 들어왔습니다.';
    case 'voice_consent_missing':
      return '통화 녹음 동의가 없는 어르신 전화가 들어왔습니다.';
    case 'request_published':
      return audience === 'helper'
        ? `새 도움 요청: ${title}`
        : `공고 게시: ${title}`;
    case 'request_rejected':
      return `요청 반려: ${title}`;
    case 'request_accepted':
    case 'assignment_applied':
      return audience === 'helper'
        ? `도움 신청 완료: ${title}`
        : `${payload.helper_name ?? '청년 도움자'}님이 신청: ${title}`;
    case 'assignment_approved':
      return `매칭 승인: ${title}`;
    case 'assignment_rejected':
      return `신청 반려: ${title}`;
    case 'match_finalized':
      return `매칭 확정: ${title}`;
    case 'admin_call_task_created':
      return `${payload.requester_name ?? '어르신'}께 매칭 안내 전화를 걸어야 합니다: ${title}`;
    case 'matching_capacity_full':
      return `정원 6명이 충족되어 승인 판단이 필요합니다: ${title}`;
    case 'matching_deadline_ready':
      return `신청 마감에 도달했습니다. ${payload.active_count ?? 0}명 신청 상태를 확인하세요: ${title}`;
    case 'matching_deadline_underfilled':
      return `마감 후 최소 인원 미달입니다. 진행 또는 무산을 결정하세요: ${title}`;
    case 'matching_deadline_must_fail':
      return `마감 후 신청자가 1명 이하입니다. 무산 처리가 필요합니다: ${title}`;
    default:
      return title;
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}
