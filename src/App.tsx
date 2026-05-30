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
type HelpRequestStatus = Database['public']['Enums']['help_request_status'];
type HelpCategory = Database['public']['Enums']['help_category'];
type SafetyTier = Database['public']['Enums']['safety_tier'];
type PublishedHelpRequestRow =
  Database['public']['Functions']['list_published_help_requests']['Returns'][number];

type RequesterSummary = Pick<
  Profile,
  'id' | 'name' | 'phone' | 'village' | 'address_public' | 'address_detail'
> & {
  personal_notes?: string | null;
};
type HelperSummary = Pick<Profile, 'id' | 'name' | 'phone'>;

type HelpRequestWithRequester = HelpRequestRow & {
  requester?: RequesterSummary | RequesterSummary[] | null;
  distance_meters?: number | null;
  is_new?: boolean;
  applied_count?: number;
  accepted_count?: number;
  current_helper_assignment_id?: string | null;
  current_helper_assignment_status?: AssignmentRow['status'] | null;
  is_full?: boolean;
};

type AssignmentWithRequest = AssignmentRow & {
  help_request?:
    | (HelpRequestWithRequester & {
        requester?: RequesterSummary | RequesterSummary[] | null;
      })
    | HelpRequestWithRequester[]
    | null;
  helper?: HelperSummary | HelperSummary[] | null;
  completion_proofs?: CompletionProofRow[] | null;
  credit_ledger?: CreditLedgerRow[] | null;
};

type NotificationPayload = {
  title?: string;
  requester_name?: string;
  helper_name?: string;
  appointment_time?: string;
  credit_reward?: number;
  status?: string;
};

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
};

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

export function App() {
  const [auth, setAuth] = useState<AuthState>({
    session: null,
    profile: null,
    loading: true,
    error: null,
  });

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
    return <MissingConfig />;
  }

  if (auth.loading) {
    return <ScreenMessage title="로딩 중" body="로그인 상태를 확인하고 있습니다." />;
  }

  if (!auth.session) {
    return <LoginPage />;
  }

  if (auth.error || !auth.profile) {
    return (
      <ScreenMessage
        title="Profile not ready"
        body={
          auth.error ??
          'You are signed in, but no matching profile row was found.'
        }
      />
    );
  }

  return (
    <AppShell profile={auth.profile}>
      {adminRoles.has(auth.profile.role) ? (
        <AdminDashboard profile={auth.profile} />
      ) : (
        <HelperDashboard profile={auth.profile} />
      )}
    </AppShell>
  );
}

function MissingConfig() {
  return (
    <ScreenMessage
      title="Supabase environment missing"
      body="Create porori-web/.env.local from .env.example and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    />
  );
}

function ScreenMessage({ title, body }: { title: string; body: string }) {
  return (
    <main className="screen-message">
      <section className="panel">
        <img className="brand-mark compact" src={wordmarkImage} alt="DOUM" />
        <h1>{title}</h1>
        <p>{body}</p>
      </section>
    </main>
  );
}

function LoginPage() {
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
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <img className="brand-mark" src={wordmarkImage} alt="DOUM" />
          <p className="eyebrow">
            {adminRoles.has(profile.role) ? '운영자 콘솔' : '청년 도움 앱'}
          </p>
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

  return (
    <div className="dashboard-grid">
      <section className="hero-panel admin-hero">
        <p className="eyebrow">오늘의 운영</p>
        <h1>포로리가 접수한 요청을 확인하세요</h1>
        <p>공고 초안을 검토하고, 완료 인증을 승인해 크레딧을 지급합니다.</p>
      </section>
      <AdminPendingRequests
        onReviewed={() => setActivityRefreshKey((current) => current + 1)}
      />
      <AdminApplicationQueue
        onReviewed={() => setActivityRefreshKey((current) => current + 1)}
      />
      <AdminCompletionQueue />
      <ActivityPanel
        audience="admin"
        profile={profile}
        refreshKey={activityRefreshKey}
      />
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
      .eq('status', 'applied')
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
        {assignments.map((assignment) => (
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
  );
}

function AdminCompletionQueue() {
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
        p_review_text: 'Admin confirmed completion for MVP test.',
        p_source: 'admin_manual',
      },
    );

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setAssignments((current) =>
        current.filter((assignment) => assignment.id !== assignmentId),
      );
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
    </section>
  );
}

function HelperDashboard({ profile }: { profile: Profile }) {
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const displayName = shortDisplayName(profile.name);

  return (
    <div className="dashboard-grid">
      <section className="hero-panel helper-hero">
        <p className="eyebrow">다로리 도움</p>
        <h1>{displayName}님, 오늘 도울 이웃을 찾아보세요</h1>
        <p>어르신의 작은 요청을 확인하고, 가능한 일손을 신청하세요.</p>
      </section>
      <HelperFeed
        profile={profile}
        onAccepted={() => setActivityRefreshKey((current) => current + 1)}
      />
      <HelperAssignments profile={profile} />
      <CreditSummaryPanel profile={profile} refreshKey={activityRefreshKey} />
      <ActivityPanel
        audience="helper"
        profile={profile}
        refreshKey={activityRefreshKey}
      />
    </div>
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

  async function acceptRequest(id: string) {
    setWorkingId(id);
    setError(null);

    const { error: rpcError } = await supabase.rpc('apply_help_request', {
      p_help_request_id: id,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      await loadPublishedRequests(false);
      onAccepted();
    }

    setWorkingId(null);
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

      <div className="filter-row" aria-label="도움 요청 필터">
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
        >
          NEW
        </button>
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
                  className="secondary"
                  onClick={() => setSelectedRequest(request)}
                >
                  상세
                </button>
	                <button
	                  type="button"
	                  onClick={() => void acceptRequest(request.id)}
	                  disabled={
	                    workingId === request.id ||
	                    Boolean(request.current_helper_assignment_status) ||
	                    request.is_full === true
	                  }
	                >
	                  {request.current_helper_assignment_status
	                    ? '신청 완료'
	                    : request.is_full
	                      ? '마감'
	                      : '도움 신청'}
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
          onClose={() => setSelectedRequest(null)}
        />
      ) : null}
    </section>
  );
}

function HelperAssignments({ profile }: { profile: Profile }) {
  const [assignments, setAssignments] = useState<AssignmentWithRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: assignmentError } = await supabase
      .from('assignments')
      .select(
        `
        *,
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
      .eq('helper_id', profile.id)
      .order('accepted_at', { ascending: false });

    if (assignmentError) {
      setError(assignmentError.message);
      setAssignments([]);
    } else {
      setAssignments((data ?? []) as AssignmentWithRequest[]);
    }

    setLoading(false);
  }, [profile.id]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  async function submitCompletion(assignment: AssignmentWithRequest) {
    const file = files[assignment.id];
    if (!file) {
      setError('완료 사진을 선택한 뒤 제출하세요.');
      return;
    }

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
      p_note: notes[assignment.id] || null,
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
            file={files[assignment.id] ?? null}
            note={notes[assignment.id] ?? ''}
            busy={workingId === assignment.id}
            onFileChange={(file) =>
              setFiles((current) => ({ ...current, [assignment.id]: file }))
            }
            onNoteChange={(note) =>
              setNotes((current) => ({ ...current, [assignment.id]: note }))
            }
            onSubmit={() => void submitCompletion(assignment)}
          />
        ))}
      </div>
    </section>
  );
}

function CreditSummaryPanel({
  profile,
  refreshKey,
}: {
  profile: Profile;
  refreshKey: number;
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

  return (
    <section className="panel credit-panel">
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
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      credit_reward: Number(form.credit_reward),
      required_helpers: Number(form.required_helpers),
      safety_tier: form.safety_tier,
      estimated_duration_minutes: Number(form.estimated_duration_minutes),
      admin_notes: form.admin_notes || null,
    } satisfies Json;
  }

  async function saveEdits() {
    setBusy(true);
    setError(null);
    setMessage(null);

    const { error: rpcError } = await supabase.rpc('admin_update_help_request', {
      p_help_request_id: request.id,
      p_patch: buildPatch(),
    });

    if (rpcError) {
      setError(rpcError.message);
      setBusy(false);
      return false;
    }

    setMessage('수정 내용을 저장했습니다. 게시나 반려 없이 닫아도 됩니다.');
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
    setError(null);

    const { error: rpcError } = await supabase.rpc('review_help_request', {
      p_help_request_id: request.id,
      p_status: status,
      p_reject_reason:
        status === 'rejected' ? form.reject_reason || '운영자 검토 반려' : null,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      onReviewed(request.id);
    }

    setBusy(false);
  }

  const latestVoiceCall = voiceCalls[0] ?? null;

  return (
    <Modal title="공고 검토" onClose={onClose}>
      <div className="detail-stack">
        <section className="review-grid">
          <label>
            제목
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
            본문
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
            희망 일시
            <input
              type="datetime-local"
              value={form.appointment_time}
              onChange={(event) =>
                updateField('appointment_time', event.target.value)
              }
            />
          </label>
          <label>
            필요 인원
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
            <input
              type="number"
              min={0}
              value={form.credit_reward}
              onChange={(event) =>
                updateField('credit_reward', event.target.value)
              }
            />
          </label>
          <label>
            안전 등급
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
          </label>
          <label>
            공개 장소
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
          <label>
            위도
            <input
              inputMode="decimal"
              value={form.location_latitude}
              onChange={(event) =>
                updateField('location_latitude', event.target.value)
              }
            />
          </label>
          <label>
            경도
            <input
              inputMode="decimal"
              value={form.location_longitude}
              onChange={(event) =>
                updateField('location_longitude', event.target.value)
              }
            />
          </label>
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
              <p className="transcript">
                {latestVoiceCall.transcript ?? '저장된 통화 내용이 없습니다.'}
              </p>
              <JsonBlock
                label="AI 추출 원본"
                value={latestVoiceCall.extracted_payload ?? request.ai_extracted_payload}
              />
            </div>
          ) : null}
        </section>

        {message ? <p className="form-message">{message}</p> : null}
        {error ? <p className="error-message">{error}</p> : null}
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
  onClose,
}: {
  audience: 'admin' | 'helper';
  request: HelpRequestWithRequester;
  onClose: () => void;
}) {
  const requester = normalizeOne(request.requester);
  const [voiceCalls, setVoiceCalls] = useState<VoiceCallRow[]>([]);
  const [loadingVoice, setLoadingVoice] = useState(audience === 'admin');
  const [voiceError, setVoiceError] = useState<string | null>(null);

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
      .eq('help_request_id', request.id)
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
  }, [audience, request.id]);

  const latestVoiceCall = voiceCalls[0] ?? null;

  return (
    <Modal
      title={audience === 'admin' ? '요청 상세' : '도움 요청 상세'}
      onClose={onClose}
    >
      <div className="detail-stack">
        <div>
          <span className="status-badge">{statusLabel(request.status)}</span>
          <h3>{request.title}</h3>
          <p>{request.content}</p>
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
            <dt>방문 시간</dt>
            <dd>{formatDateTime(request.appointment_time)}</dd>
          </div>
          <div>
            <dt>요청 장소</dt>
            <dd>{request.location_public ?? requester?.address_public ?? '-'}</dd>
          </div>
          {audience === 'admin' ? (
            <div>
              <dt>상세 주소</dt>
              <dd>
                {request.location_detail ?? requester?.address_detail ?? '-'}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>카테고리</dt>
            <dd>{categoryLabel(request.category)}</dd>
          </div>
          <div>
            <dt>지급 예정 크레딧</dt>
            <dd>{formatCredits(request.credit_reward)}</dd>
          </div>
          <div>
            <dt>필요 인원</dt>
            <dd>
              {request.accepted_count ?? 0}/{request.required_helpers}명 확정
            </dd>
          </div>
          <div>
            <dt>안전 등급</dt>
            <dd>{safetyTierLabel(request.safety_tier)}</dd>
          </div>
          <div>
            <dt>준비물 구비</dt>
            <dd>{formatBoolean(request.items_provided)}</dd>
          </div>
          <div>
            <dt>준비물 메모</dt>
            <dd>{request.items_needed_details ?? '-'}</dd>
          </div>
        </dl>

        {audience === 'helper' ? (
          <p className="hint">
            상세 주소와 연락처는 도움 신청 후 표시됩니다.
          </p>
        ) : null}

        {audience === 'admin' ? (
          <>
            {request.admin_notes ? (
              <section className="detail-section">
                <h4>운영자 메모</h4>
                <p>{request.admin_notes}</p>
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
                    <p className="transcript">
                      {latestVoiceCall.transcript ?? '저장된 통화 내용이 없습니다.'}
                    </p>
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
            <ProofImage imagePath={proof.image_path} />
            <p className="hint">{proof.image_path}</p>
          </section>
        ) : (
          <p className="muted">이 활동에 등록된 완료 사진이 없습니다.</p>
        )}
      </div>
    </Modal>
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
      <section
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="닫기"
        >
          X
        </button>
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

  return (
    <article className="request-card">
      <div className="request-card-main">
        <div>
          <div className="badge-row">
            <span className={`category-badge category-${request.category}`}>
              {categoryLabel(request.category)}
            </span>
            <span className="status-badge">{statusLabel(request.status)}</span>
            {request.is_new ? <span className="new-badge">NEW</span> : null}
            {request.distance_meters !== undefined &&
            request.distance_meters !== null ? (
              <span className="distance-badge">
                {formatDistance(request.distance_meters)}
              </span>
            ) : null}
            {applicationStatus ? (
              <span className="status-badge">{assignmentStatusLabel(applicationStatus)}</span>
            ) : null}
            {request.is_full ? <span className="status-badge closed">마감</span> : null}
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
            <dt>희망 시간</dt>
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
  file,
  note,
  busy,
  onFileChange,
  onNoteChange,
  onSubmit,
}: {
  assignment: AssignmentWithRequest;
  file: File | null;
  note: string;
  busy: boolean;
  onFileChange: (file: File | null) => void;
  onNoteChange: (note: string) => void;
  onSubmit: () => void;
}) {
  const request = normalizeOne(assignment.help_request);
  const requester = normalizeOne(request?.requester);
  const proof = assignment.completion_proofs?.[0] ?? null;
  const creditedAmount =
    assignment.credit_ledger?.reduce((sum, credit) => sum + credit.amount, 0) ?? 0;
  const canViewPrivateLocation = assignment.status !== 'applied';

  return (
    <article className="request-card">
      <div>
        <span className="status-badge">{assignmentStatusLabel(assignment.status)}</span>
        <h3>{request?.title ?? '제목 없는 요청'}</h3>
        <p>{request?.content ?? '요청 상세가 없습니다.'}</p>
      </div>
      <dl className="meta-grid">
        <div>
          <dt>요청자</dt>
          <dd>{requester?.name ?? '알 수 없음'}</dd>
        </div>
        <div>
          <dt>방문 시간</dt>
          <dd>{formatDateTime(request?.appointment_time ?? null)}</dd>
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
            <dd>{proof.image_path}</dd>
          </div>
        ) : null}
      </dl>

      {assignment.status === 'accepted' ? (
        <div className="completion-form">
          <label>
            완료 사진
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                onFileChange(event.target.files?.item(0) ?? null)
              }
            />
          </label>
          <label>
            활동 후기
            <input
              type="text"
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="어르신과의 활동 후기를 남겨주세요"
            />
          </label>
          <div className="button-row">
            <button type="button" onClick={onSubmit} disabled={busy || !file}>
              완료 인증하기
            </button>
          </div>
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

  return (
    <article className="request-card">
      <div>
        <span className="status-badge">{assignmentStatusLabel(assignment.status)}</span>
        <h3>{request?.title ?? '제목 없는 요청'}</h3>
        <p>{helper?.name ?? '청년 도움자'}님의 도움 신청을 검토합니다.</p>
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
      <div className="button-row">
        <button type="button" className="secondary" onClick={onReject} disabled={busy}>
          반려
        </button>
        <button type="button" onClick={onApprove} disabled={busy}>
          매칭 승인
        </button>
      </div>
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
          <dd>{proof?.image_path ?? '-'}</dd>
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
  };

  return labels[status];
}

function formatCredits(value: number) {
  return `${new Intl.NumberFormat('ko-KR').format(value)} 크레딧`;
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
    is_full: row.is_full,
  };
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
    helper_name: readString(record.helper_name),
    appointment_time: readString(record.appointment_time),
    credit_reward: readNumber(record.credit_reward),
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
