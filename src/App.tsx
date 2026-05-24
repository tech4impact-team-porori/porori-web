import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import type { Database } from './lib/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];
type HelpRequestRow = Database['public']['Tables']['help_requests']['Row'];
type AssignmentRow = Database['public']['Tables']['assignments']['Row'];
type CompletionProofRow =
  Database['public']['Tables']['completion_proofs']['Row'];
type CreditLedgerRow = Database['public']['Tables']['credit_ledger']['Row'];
type HelpRequestStatus = Database['public']['Enums']['help_request_status'];

type RequesterSummary = Pick<
  Profile,
  'id' | 'name' | 'phone' | 'village' | 'address_public'
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
  return (
    <div className="dashboard-grid">
      <AdminPendingRequests profile={profile} />
      <AdminCompletionQueue />
    </div>
  );
}

function AdminPendingRequests({ profile }: { profile: Profile }) {
  const [requests, setRequests] = useState<HelpRequestWithRequester[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

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
          address_public
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

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('help_requests')
      .update({
        status,
        approved_by: profile.id,
        approved_at: now,
        published_at: status === 'published' ? now : null,
      })
      .eq('id', id)
      .eq('status', 'pending_review');

    if (updateError) {
      setError(updateError.message);
    } else {
      setRequests((current) => current.filter((request) => request.id !== id));
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
    </section>
  );
}

function AdminCompletionQueue() {
  const [assignments, setAssignments] = useState<AssignmentWithRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

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
            address_public
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
            onConfirm={() => void confirmAndCredit(assignment.id)}
          />
        ))}
      </div>
    </section>
  );
}

function HelperDashboard({ profile }: { profile: Profile }) {
  return (
    <div className="dashboard-grid">
      <HelperFeed />
      <HelperAssignments profile={profile} />
    </div>
  );
}

function HelperFeed() {
  const [requests, setRequests] = useState<HelpRequestWithRequester[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);

  const loadPublishedRequests = useCallback(async () => {
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
          address_public
        )
      `,
      )
      .eq('status', 'published')
      .order('published_at', { ascending: false });

    if (requestError) {
      setError(requestError.message);
      setRequests([]);
    } else {
      setRequests((data ?? []) as HelpRequestWithRequester[]);
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
              <button
                type="button"
                onClick={() => void acceptRequest(request.id)}
                disabled={workingId === request.id}
              >
                Accept
              </button>
            }
          />
        ))}
      </div>
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
            address_public
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
  onConfirm,
}: {
  assignment: AssignmentWithRequest;
  busy: boolean;
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
