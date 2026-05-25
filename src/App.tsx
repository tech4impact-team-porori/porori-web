import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import type { Database, Json } from './lib/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];
type HelpRequestRow = Database['public']['Tables']['help_requests']['Row'];
type AssignmentRow = Database['public']['Tables']['assignments']['Row'];
type CompletionProofRow =
  Database['public']['Tables']['completion_proofs']['Row'];
type CreditLedgerRow = Database['public']['Tables']['credit_ledger']['Row'];
type NotificationRow = Database['public']['Tables']['notifications']['Row'];
type VoiceCallRow = Database['public']['Tables']['voice_calls']['Row'];
type HelpRequestStatus = Database['public']['Enums']['help_request_status'];
type PublishedHelpRequestRow =
  Database['public']['Functions']['list_published_help_requests']['Returns'][number];

type RequesterSummary = Pick<
  Profile,
  'id' | 'name' | 'phone' | 'village' | 'address_public' | 'address_detail'
>;
type HelperSummary = Pick<Profile, 'id' | 'name' | 'phone'>;

type HelpRequestWithRequester = HelpRequestRow & {
  requester?: RequesterSummary | RequesterSummary[] | null;
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
    return <ScreenMessage title="Loading" body="Checking your session..." />;
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
        <p className="eyebrow">DOUM operations</p>
        <h1>{mode === 'sign-in' ? 'Sign in' : 'Create helper account'}</h1>
        <form onSubmit={handleSubmit} className="stack">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
              ? 'Working...'
              : mode === 'sign-in'
                ? 'Sign in'
                : 'Create account'}
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
            ? 'Need a helper account? Sign up'
            : 'Already have an account? Sign in'}
        </button>
        <p className="hint">
          New accounts become helpers by default. Promote the first
          mediator/admin in Supabase by updating their profile role.
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
          <p className="eyebrow">DOUM MVP</p>
          <h1>
            {adminRoles.has(profile.role) ? 'Admin dashboard' : 'Helper app'}
          </h1>
        </div>
        <div className="user-block">
          <span>{profile.name}</span>
          <span className="role-badge">{profile.role}</span>
          <button type="button" onClick={() => void supabase.auth.signOut()}>
            Sign out
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
      <AdminPendingRequests
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
  const [workingId, setWorkingId] = useState<string | null>(null);
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
          address_detail
        )
      `,
      )
      .eq('status', 'pending_review')
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

  async function transitionRequest(
    id: string,
    status: Extract<HelpRequestStatus, 'published' | 'rejected'>,
  ) {
    setWorkingId(id);
    setError(null);

    const { error: updateError } = await supabase.rpc('review_help_request', {
      p_help_request_id: id,
      p_status: status,
    });

    if (updateError) {
      setError(updateError.message);
    } else {
      setRequests((current) => current.filter((request) => request.id !== id));
      onReviewed();
    }

    setWorkingId(null);
  }

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Mediator review</p>
          <h2>Pending requests</h2>
        </div>
        <button
          type="button"
          onClick={() => void loadPendingRequests()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error ? <p className="error-message">{error}</p> : null}
      {loading ? <p className="muted">Loading pending requests...</p> : null}
      {!loading && requests.length === 0 ? (
        <p className="muted">
          No pending requests. Vapi/manual intake rows will appear here.
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
                  className="secondary"
                  onClick={() => setSelectedRequest(request)}
                >
                  Details
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void transitionRequest(request.id, 'rejected')}
                  disabled={workingId === request.id}
                >
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => void transitionRequest(request.id, 'published')}
                  disabled={workingId === request.id}
                >
                  Approve
                </button>
              </>
            }
          />
        ))}
      </div>

      {selectedRequest ? (
        <RequestDetailModal
          audience="admin"
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
        />
      ) : null}
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
          <p className="eyebrow">Completion review</p>
          <h2>Submitted completions</h2>
        </div>
        <button type="button" onClick={() => void loadAssignments()} disabled={loading}>
          Refresh
        </button>
      </div>

      {error ? <p className="error-message">{error}</p> : null}
      {loading ? <p className="muted">Loading submitted completions...</p> : null}
      {!loading && assignments.length === 0 ? (
        <p className="muted">No submitted completions waiting for review.</p>
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

  return (
    <div className="dashboard-grid">
      <HelperFeed
        onAccepted={() => setActivityRefreshKey((current) => current + 1)}
      />
      <HelperAssignments profile={profile} />
      <ActivityPanel
        audience="helper"
        profile={profile}
        refreshKey={activityRefreshKey}
      />
    </div>
  );
}

function HelperFeed({ onAccepted }: { onAccepted: () => void }) {
  const [requests, setRequests] = useState<HelpRequestWithRequester[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] =
    useState<HelpRequestWithRequester | null>(null);

  const loadPublishedRequests = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: requestError } = await supabase.rpc(
      'list_published_help_requests',
    );

    if (requestError) {
      setError(requestError.message);
      setRequests([]);
    } else {
      setRequests(((data ?? []) as PublishedHelpRequestRow[]).map(mapPublishedRequest));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPublishedRequests();
  }, [loadPublishedRequests]);

  async function acceptRequest(id: string) {
    setWorkingId(id);
    setError(null);

    const { error: rpcError } = await supabase.rpc('accept_help_request', {
      p_help_request_id: id,
    });

    if (rpcError) {
      setError(rpcError.message);
    } else {
      setRequests((current) => current.filter((request) => request.id !== id));
      onAccepted();
    }

    setWorkingId(null);
  }

  return (
    <section className="panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Available work</p>
          <h2>Published requests</h2>
        </div>
        <button
          type="button"
          onClick={() => void loadPublishedRequests()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error ? <p className="error-message">{error}</p> : null}
      {loading ? <p className="muted">Loading published requests...</p> : null}
      {!loading && requests.length === 0 ? (
        <p className="muted">No published requests are available right now.</p>
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
                  Details
                </button>
                <button
                  type="button"
                  onClick={() => void acceptRequest(request.id)}
                  disabled={workingId === request.id}
                >
                  Accept
                </button>
              </>
            }
          />
        ))}
      </div>

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
      setError('Choose a completion image before submitting.');
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
          <p className="eyebrow">My work</p>
          <h2>Accepted requests</h2>
        </div>
        <button type="button" onClick={() => void loadAssignments()} disabled={loading}>
          Refresh
        </button>
      </div>

      {error ? <p className="error-message">{error}</p> : null}
      {loading ? <p className="muted">Loading accepted requests...</p> : null}
      {!loading && assignments.length === 0 ? (
        <p className="muted">Accepted requests will appear here.</p>
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
            {audience === 'admin' ? 'Operations' : 'My updates'}
          </p>
          <h2>Recent activity</h2>
        </div>
        <button
          type="button"
          onClick={() => void loadNotifications()}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error ? <p className="error-message">{error}</p> : null}
      {loading ? <p className="muted">Loading recent activity...</p> : null}
      {!loading && notifications.length === 0 ? (
        <p className="muted">No activity yet.</p>
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
      title={audience === 'admin' ? 'Request details' : 'Request preview'}
      onClose={onClose}
    >
      <div className="detail-stack">
        <div>
          <span className="status-badge">{request.status}</span>
          <h3>{request.title}</h3>
          <p>{request.content}</p>
        </div>

        <dl className="meta-grid">
          <div>
            <dt>Requester</dt>
            <dd>{requester?.name ?? 'Unknown'}</dd>
          </div>
          {audience === 'admin' ? (
            <div>
              <dt>Phone</dt>
              <dd>{requester?.phone ?? '-'}</dd>
            </div>
          ) : null}
          <div>
            <dt>Visit time</dt>
            <dd>{formatDateTime(request.appointment_time)}</dd>
          </div>
          <div>
            <dt>Public location</dt>
            <dd>{request.location_public ?? requester?.address_public ?? '-'}</dd>
          </div>
          {audience === 'admin' ? (
            <div>
              <dt>Private location</dt>
              <dd>
                {request.location_detail ?? requester?.address_detail ?? '-'}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Category</dt>
            <dd>{categoryLabel(request.category)}</dd>
          </div>
          <div>
            <dt>Credit</dt>
            <dd>{request.credit_reward}</dd>
          </div>
          <div>
            <dt>Items ready</dt>
            <dd>{formatBoolean(request.items_provided)}</dd>
          </div>
          <div>
            <dt>Needed items</dt>
            <dd>{request.items_needed_details ?? '-'}</dd>
          </div>
        </dl>

        {audience === 'helper' ? (
          <p className="hint">
            Detailed address and requester phone are shown after accepting.
          </p>
        ) : null}

        {audience === 'admin' ? (
          <>
            {request.admin_notes ? (
              <section className="detail-section">
                <h4>Admin notes</h4>
                <p>{request.admin_notes}</p>
              </section>
            ) : null}

            <section className="detail-section">
              <h4>Voice intake</h4>
              {loadingVoice ? (
                <p className="muted">Loading voice call details...</p>
              ) : null}
              {voiceError ? <p className="error-message">{voiceError}</p> : null}
              {!loadingVoice && !voiceError && !latestVoiceCall ? (
                <p className="muted">No voice call linked to this request.</p>
              ) : null}
              {latestVoiceCall ? (
                <div className="detail-stack">
                  <dl className="meta-grid">
                    <div>
                      <dt>Call status</dt>
                      <dd>{latestVoiceCall.status ?? '-'}</dd>
                    </div>
                    <div>
                      <dt>Caller</dt>
                      <dd>{latestVoiceCall.phone}</dd>
                    </div>
                    <div>
                      <dt>Confidence</dt>
                      <dd>{latestVoiceCall.confidence ?? '-'}</dd>
                    </div>
                    <div>
                      <dt>Confirmed</dt>
                      <dd>{formatBoolean(latestVoiceCall.confirmed_by_requester)}</dd>
                    </div>
                  </dl>
                  <div>
                    <h5>Transcript</h5>
                    <p className="transcript">
                      {latestVoiceCall.transcript ?? 'No transcript saved.'}
                    </p>
                  </div>
                  <JsonBlock
                    label="Extracted payload"
                    value={
                      latestVoiceCall.extracted_payload ??
                      request.ai_extracted_payload
                    }
                  />
                </div>
              ) : null}
              {!latestVoiceCall ? (
                <JsonBlock label="AI payload" value={request.ai_extracted_payload} />
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
    <Modal title="Completion proof" onClose={onClose}>
      <div className="detail-stack">
        <div>
          <span className="status-badge">{assignment.status}</span>
          <h3>{request?.title ?? 'Untitled request'}</h3>
          <p>{request?.content ?? 'No request details available.'}</p>
        </div>

        <dl className="meta-grid">
          <div>
            <dt>Helper</dt>
            <dd>{helper?.name ?? 'Unknown'}</dd>
          </div>
          <div>
            <dt>Requester</dt>
            <dd>{requester?.name ?? 'Unknown'}</dd>
          </div>
          <div>
            <dt>Visit time</dt>
            <dd>{formatDateTime(request?.appointment_time ?? null)}</dd>
          </div>
          <div>
            <dt>Private location</dt>
            <dd>{request?.location_detail ?? requester?.address_detail ?? '-'}</dd>
          </div>
          <div>
            <dt>Submitted at</dt>
            <dd>{formatDateTime(proof?.submitted_at ?? null)}</dd>
          </div>
          <div>
            <dt>Proof status</dt>
            <dd>{proof?.status ?? '-'}</dd>
          </div>
        </dl>

        <section className="detail-section">
          <h4>Helper note</h4>
          <p>{proof?.note ?? 'No note submitted.'}</p>
        </section>

        {proof ? (
          <section className="detail-section">
            <h4>Photo</h4>
            <ProofImage imagePath={proof.image_path} />
            <p className="hint">{proof.image_path}</p>
          </section>
        ) : (
          <p className="muted">No proof image found for this assignment.</p>
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
    return <p className="muted">Loading proof image...</p>;
  }

  return <img className="proof-image" src={signedUrl} alt="Completion proof" />;
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
        <div className="section-header">
          <h2>{title}</h2>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
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

  return (
    <article className="request-card">
      <div className="request-card-main">
        <div>
          <span className="status-badge">{request.status}</span>
          <h3>{request.title}</h3>
          <p>{request.content}</p>
        </div>
        <dl className="meta-grid">
          <div>
            <dt>Requester</dt>
            <dd>{requester?.name ?? 'Unknown'}</dd>
          </div>
          {!compactPrivateFields ? (
            <div>
              <dt>Phone</dt>
              <dd>{requester?.phone ?? '-'}</dd>
            </div>
          ) : null}
          <div>
            <dt>Village</dt>
            <dd>{requester?.village ?? '-'}</dd>
          </div>
          <div>
            <dt>Public location</dt>
            <dd>{request.location_public ?? requester?.address_public ?? '-'}</dd>
          </div>
          <div>
            <dt>Visit time</dt>
            <dd>{appointment}</dd>
          </div>
          <div>
            <dt>Credit</dt>
            <dd>{request.credit_reward}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{categoryLabel(request.category)}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{request.source}</dd>
          </div>
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
  const credit = assignment.credit_ledger?.[0] ?? null;

  return (
    <article className="request-card">
      <div>
        <span className="status-badge">{assignment.status}</span>
        <h3>{request?.title ?? 'Untitled request'}</h3>
        <p>{request?.content ?? 'No request details available.'}</p>
      </div>
      <dl className="meta-grid">
        <div>
          <dt>Requester</dt>
          <dd>{requester?.name ?? 'Unknown'}</dd>
        </div>
        <div>
          <dt>Visit time</dt>
          <dd>{formatDateTime(request?.appointment_time ?? null)}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{request?.location_detail ?? request?.location_public ?? '-'}</dd>
        </div>
        <div>
          <dt>Credit</dt>
          <dd>{credit ? `Granted ${credit.amount}` : request?.credit_reward ?? 0}</dd>
        </div>
        {proof ? (
          <div>
            <dt>Proof</dt>
            <dd>{proof.image_path}</dd>
          </div>
        ) : null}
      </dl>

      {assignment.status === 'accepted' ? (
        <div className="completion-form">
          <label>
            Completion photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                onFileChange(event.target.files?.item(0) ?? null)
              }
            />
          </label>
          <label>
            Note
            <input
              type="text"
              value={note}
              onChange={(event) => onNoteChange(event.target.value)}
              placeholder="Optional completion note"
            />
          </label>
          <div className="button-row">
            <button type="button" onClick={onSubmit} disabled={busy || !file}>
              Submit completion
            </button>
          </div>
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
        <span className="status-badge">{assignment.status}</span>
        <h3>{request?.title ?? 'Untitled request'}</h3>
        <p>{request?.content ?? 'No request details available.'}</p>
      </div>
      <dl className="meta-grid">
        <div>
          <dt>Helper</dt>
          <dd>{helper?.name ?? 'Unknown'}</dd>
        </div>
        <div>
          <dt>Requester</dt>
          <dd>{requester?.name ?? 'Unknown'}</dd>
        </div>
        <div>
          <dt>Visit time</dt>
          <dd>{formatDateTime(request?.appointment_time ?? null)}</dd>
        </div>
        <div>
          <dt>Credit reward</dt>
          <dd>{request?.credit_reward ?? 0}</dd>
        </div>
        <div>
          <dt>Proof image path</dt>
          <dd>{proof?.image_path ?? '-'}</dd>
        </div>
        <div>
          <dt>Proof note</dt>
          <dd>{proof?.note ?? '-'}</dd>
        </div>
      </dl>
      <div className="button-row">
        <button type="button" className="secondary" onClick={onViewDetails}>
          View proof
        </button>
        <button type="button" onClick={onConfirm} disabled={busy}>
          Confirm + grant credit
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

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value));
}

function categoryLabel(category: HelpRequestRow['category']) {
  const labels: Record<HelpRequestRow['category'], string> = {
    electronics: 'Electronics',
    labor: 'Labor',
    daily_life: 'Daily life',
    mobility_care: 'Mobility / care',
    household: 'Household',
    other: 'Other',
  };

  return labels[category];
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
    credit_reward: row.credit_reward,
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
        <p className="muted">No JSON payload saved.</p>
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
    voice_request_created: 'Voice intake',
    request_published: 'Published',
    request_rejected: 'Rejected',
    request_accepted: 'Accepted',
  };

  return labels[purpose] ?? purpose;
}

function notificationSummary(
  notification: NotificationRow,
  payload: NotificationPayload,
  audience: 'admin' | 'helper',
) {
  const title = payload.title ?? 'Untitled request';

  switch (notification.purpose) {
    case 'voice_request_created':
      return `New voice request: ${title}`;
    case 'request_published':
      return audience === 'helper'
        ? `New request available: ${title}`
        : `Published request: ${title}`;
    case 'request_rejected':
      return `Rejected request: ${title}`;
    case 'request_accepted':
      return audience === 'helper'
        ? `You accepted: ${title}`
        : `${payload.helper_name ?? 'A helper'} accepted: ${title}`;
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
