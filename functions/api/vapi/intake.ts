import { createClient } from '@supabase/supabase-js';
import type { Database, Json } from '../../../src/lib/database.types';

type Env = {
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  VAPI_WEBHOOK_SECRET?: string;
};

type PagesContext = {
  request: Request;
  env: Env;
};

type UnknownRecord = Record<string, unknown>;

type ExtractedRequest = {
  category?: unknown;
  title?: unknown;
  content?: unknown;
  items_provided?: unknown;
  items_needed_details?: unknown;
  appointment_time?: unknown;
  appointment_time_local?: unknown;
  appointment_time_utc?: unknown;
  location_public?: unknown;
  location_detail?: unknown;
  credit_reward?: unknown;
  requester_phone?: unknown;
  requester_name?: unknown;
  confirmed_by_requester?: unknown;
  confidence?: unknown;
};

type RequesterProfile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'name' | 'phone' | 'address_public'
>;

type RequesterLookup = {
  profile: RequesterProfile;
  created: boolean;
};

const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
};

export async function onRequestGet() {
  return jsonResponse({
    ok: true,
    endpoint: '/api/vapi/intake',
    accepts: ['POST end-of-call-report'],
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      ...jsonHeaders,
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type, x-vapi-secret',
    },
  });
}

export async function onRequestPost({ request, env }: PagesContext) {
  const authResult = verifyWebhookSecret(request, env.VAPI_WEBHOOK_SECRET);
  if (!authResult.ok) {
    return jsonResponse({ ok: false, error: authResult.error }, 401);
  }

  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      {
        ok: false,
        error:
          'Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.',
      },
      500,
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const message = getRecord(payload, 'message') ?? asRecord(payload);
  const messageType = getString(message, 'type');

  if (messageType && messageType !== 'end-of-call-report') {
    return jsonResponse({
      ok: true,
      ignored: true,
      message_type: messageType,
    });
  }

  const supabase = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const callId = extractCallId(payload);
  if (callId) {
    const { data: existingCall, error: existingError } = await supabase
      .from('voice_calls')
      .select('id, help_request_id')
      .eq('provider_call_id', callId)
      .maybeSingle();

    if (!existingError && existingCall) {
      return jsonResponse({
        ok: true,
        duplicate: true,
        voice_call_id: existingCall.id,
        help_request_id: existingCall.help_request_id,
      });
    }
  }

  const extracted = extractStructuredRequest(payload);
  const phone = extractPhone(payload, extracted);
  let requesterLookup: RequesterLookup;
  try {
    requesterLookup = await findOrCreateRequester(supabase, phone, extracted);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to find or create requester profile.',
      },
      500,
    );
  }
  const requester = requesterLookup.profile;
  const transcript = extractTranscript(payload);
  const now = new Date().toISOString();

  const { data: voiceCall, error: voiceCallError } = await supabase
    .from('voice_calls')
    .insert({
      provider: 'vapi',
      provider_call_id: callId,
      direction: 'inbound',
      phone: phone ?? 'unknown',
      requester_id: requester?.id ?? null,
      purpose: 'intake',
      status:
        extractNestedString(payload, ['message', 'endedReason']) ??
        extractNestedString(payload, ['message', 'call', 'status']) ??
        'received',
      transcript,
      raw_payload: payload as Json,
      extracted_payload: (extracted ?? null) as Json | null,
      confidence: toConfidence(extracted?.confidence),
      confirmed_by_requester:
        typeof extracted?.confirmed_by_requester === 'boolean'
          ? extracted.confirmed_by_requester
          : null,
      started_at:
        extractNestedString(payload, ['message', 'startedAt']) ??
        extractNestedString(payload, ['message', 'call', 'startedAt']) ??
        null,
      ended_at:
        extractNestedString(payload, ['message', 'endedAt']) ??
        extractNestedString(payload, ['message', 'call', 'endedAt']) ??
        now,
    })
    .select('id')
    .single();

  if (voiceCallError) {
    return jsonResponse(
      { ok: false, error: voiceCallError.message },
      500,
    );
  }

  const normalizedRequest = normalizeExtractedRequest(extracted);
  if (!normalizedRequest.ok) {
    return jsonResponse(
      {
        ok: false,
        voice_call_id: voiceCall.id,
        error: normalizedRequest.error,
      },
      422,
    );
  }

  const { data: helpRequest, error: helpRequestError } = await supabase
    .from('help_requests')
    .insert({
      requester_id: requester.id,
      source: 'voice',
      status: 'pending_review',
      category: normalizedRequest.value.category,
      title: normalizedRequest.value.title,
      content: normalizedRequest.value.content,
      items_provided: normalizedRequest.value.items_provided,
      items_needed_details: normalizedRequest.value.items_needed_details,
      appointment_time: normalizedRequest.value.appointment_time,
      appointment_timezone: 'Asia/Seoul',
      location_public:
        normalizedRequest.value.location_public ??
        requester.address_public ??
        null,
      location_detail: normalizedRequest.value.location_detail,
      credit_reward: normalizedRequest.value.credit_reward,
      ai_extracted_payload: (extracted ?? {}) as Json,
      admin_notes: requesterLookup.created
        ? 'Created from Vapi intake webhook. Requester profile was created during intake; verify caller details before approving.'
        : 'Created from Vapi intake webhook.',
    })
    .select('id')
    .single();

  if (helpRequestError) {
    return jsonResponse(
      {
        ok: false,
        voice_call_id: voiceCall.id,
        error: helpRequestError.message,
      },
      500,
    );
  }

  await supabase
    .from('voice_calls')
    .update({ help_request_id: helpRequest.id })
    .eq('id', voiceCall.id);

  return jsonResponse(
    {
      ok: true,
      voice_call_id: voiceCall.id,
      help_request_id: helpRequest.id,
      status: 'pending_review',
    },
    201,
  );
}

function verifyWebhookSecret(
  request: Request,
  configuredSecret: string | undefined,
) {
  if (!configuredSecret) {
    return { ok: true as const };
  }

  const authorization = request.headers.get('authorization');
  const bearerToken = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null;
  const vapiSecret = request.headers.get('x-vapi-secret');

  if (bearerToken === configuredSecret || vapiSecret === configuredSecret) {
    return { ok: true as const };
  }

  return { ok: false as const, error: 'Unauthorized webhook request.' };
}

function extractStructuredRequest(payload: unknown): ExtractedRequest | null {
  const candidates = [
    getPath(payload, ['message', 'analysis', 'structuredData']),
    getPath(payload, ['message', 'call', 'analysis', 'structuredData']),
    getPath(payload, ['message', 'artifact', 'structuredData']),
    getPath(payload, ['analysis', 'structuredData']),
    getPath(payload, ['structuredData']),
    getPath(payload, ['extracted_payload']),
    getPath(payload, ['request']),
  ];

  for (const candidate of candidates) {
    const record = asRecord(candidate);
    if (record) {
      return record as ExtractedRequest;
    }
  }

  return null;
}

function normalizeExtractedRequest(extracted: ExtractedRequest | null):
  | {
      ok: true;
      value: {
        category: Database['public']['Enums']['help_category'];
        title: string;
        content: string;
        items_provided: boolean | null;
        items_needed_details: string | null;
        appointment_time: string | null;
        location_public: string | null;
        location_detail: string | null;
        credit_reward: number;
      };
    }
  | { ok: false; error: string } {
  if (!extracted) {
    return {
      ok: false,
      error:
        'No structured request data found. Expected message.analysis.structuredData or request.',
    };
  }

  const title = toTrimmedString(extracted.title);
  const content = toTrimmedString(extracted.content);

  if (!title || !content) {
    return {
      ok: false,
      error: 'Structured request must include non-empty title and content.',
    };
  }

  return {
    ok: true,
    value: {
      category: mapCategory(toTrimmedString(extracted.category)),
      title,
      content,
      items_provided: toNullableBoolean(extracted.items_provided),
      items_needed_details: toTrimmedString(extracted.items_needed_details),
      appointment_time: normalizeAppointmentTime(extracted),
      location_public: toTrimmedString(extracted.location_public),
      location_detail: toTrimmedString(extracted.location_detail),
      credit_reward: toCreditReward(extracted.credit_reward),
    },
  };
}

async function findOrCreateRequester(
  supabase: ReturnType<typeof createClient<Database>>,
  phone: string | null,
  extracted: ExtractedRequest | null,
): Promise<RequesterLookup> {
  const normalizedPhone = normalizePhone(phone);

  if (normalizedPhone) {
    const { data: requesters } = await supabase
      .from('profiles')
      .select('id, name, phone, address_public')
      .eq('role', 'requester');

    const matched = (requesters ?? []).find(
      (profile) => normalizePhone(profile.phone) === normalizedPhone,
    );

    if (matched) {
      return { profile: matched, created: false };
    }
  }

  const requesterName =
    toTrimmedString(extracted?.requester_name) ?? 'Unknown requester';
  const requesterPhone = phone ?? `unknown-${crypto.randomUUID()}`;

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      role: 'requester',
      name: requesterName,
      phone: requesterPhone,
      village: '다로리',
      address_public: toTrimmedString(extracted?.location_public),
      address_detail: toTrimmedString(extracted?.location_detail),
    })
    .select('id, name, phone, address_public')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return { profile: data, created: true };
}

function extractCallId(payload: unknown) {
  return (
    extractNestedString(payload, ['message', 'call', 'id']) ??
    extractNestedString(payload, ['call', 'id']) ??
    extractNestedString(payload, ['message', 'callId']) ??
    extractNestedString(payload, ['callId'])
  );
}

function extractPhone(payload: unknown, extracted: ExtractedRequest | null) {
  return (
    toTrimmedString(extracted?.requester_phone) ??
    extractNestedString(payload, ['message', 'customer', 'number']) ??
    extractNestedString(payload, ['message', 'customer', 'phoneNumber']) ??
    extractNestedString(payload, ['message', 'call', 'customer', 'number']) ??
    extractNestedString(payload, [
      'message',
      'call',
      'customer',
      'phoneNumber',
    ]) ??
    extractNestedString(payload, ['message', 'phoneNumber', 'number']) ??
    extractNestedString(payload, ['customer', 'number']) ??
    extractNestedString(payload, ['phone'])
  );
}

function extractTranscript(payload: unknown) {
  return (
    extractNestedString(payload, ['message', 'artifact', 'transcript']) ??
    extractNestedString(payload, ['message', 'transcript']) ??
    extractNestedString(payload, ['artifact', 'transcript']) ??
    null
  );
}

function normalizeAppointmentTime(extracted: ExtractedRequest) {
  const raw =
    toTrimmedString(extracted.appointment_time_utc) ??
    toTrimmedString(extracted.appointment_time) ??
    toTrimmedString(extracted.appointment_time_local);

  if (!raw) {
    return null;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapCategory(
  value: string | null,
): Database['public']['Enums']['help_category'] {
  const normalized = value?.trim().toLowerCase();

  switch (normalized) {
    case 'electronics':
    case '전자제품':
      return 'electronics';
    case 'labor':
    case '일손':
      return 'labor';
    case 'daily_life':
    case '생활편의':
      return 'daily_life';
    case 'mobility_care':
    case '이동/돌봄':
    case '이동돌봄':
      return 'mobility_care';
    case 'household':
    case '집안일':
      return 'household';
    default:
      return 'other';
  }
}

function toCreditReward(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.round(parsed));
    }
  }

  return 10;
}

function toConfidence(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.min(1, value));
}

function toNullableBoolean(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'yes', 'y', '네', '예', '있음'].includes(normalized)) {
      return true;
    }
    if (['false', 'no', 'n', '아니오', '없음'].includes(normalized)) {
      return false;
    }
  }

  return null;
}

function toTrimmedString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizePhone(phone: string | null | undefined) {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  if (digits.startsWith('82')) {
    return `0${digits.slice(2)}`;
  }

  return digits;
}

function extractNestedString(payload: unknown, path: string[]) {
  return toTrimmedString(getPath(payload, path));
}

function getRecord(payload: unknown, key: string) {
  return asRecord(asRecord(payload)?.[key]);
}

function getString(payload: UnknownRecord | null, key: string) {
  return toTrimmedString(payload?.[key]);
}

function getPath(payload: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    const record = asRecord(current);
    return record ? record[key] : undefined;
  }, payload);
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  });
}
