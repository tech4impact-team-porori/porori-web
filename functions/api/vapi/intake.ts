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
  estimated_duration_minutes?: unknown;
  duration_minutes?: unknown;
  estimated_hours?: unknown;
  duration_hours?: unknown;
  location_public?: unknown;
  location_detail?: unknown;
  location_latitude?: unknown;
  location_longitude?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  credit_reward?: unknown;
  required_helpers?: unknown;
  safety_tier?: unknown;
  needs_safety_review?: unknown;
  duplicate_suspected?: unknown;
  requester_phone?: unknown;
  requester_name?: unknown;
  confirmed_by_requester?: unknown;
  confidence?: unknown;
};

type RequesterProfile = Pick<
  Database['public']['Tables']['profiles']['Row'],
  | 'id'
  | 'name'
  | 'phone'
  | 'address_public'
  | 'address_detail'
  | 'latitude'
  | 'longitude'
  | 'consent_voice'
>;

const doumStructuredOutputName = 'doum_help_request';

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
  const transcript = extractTranscript(payload);
  const now = new Date().toISOString();
  let requester: RequesterProfile | null;
  try {
    requester = await findRegisteredRequester(supabase, phone);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to find registered requester profile.',
      },
      500,
    );
  }

  if (!requester) {
    const intakeOnly = await recordIntakeWithoutRequest(supabase, {
      payload,
      callId,
      phone,
      requesterId: null,
      transcript,
      extracted,
      now,
      status: phone ? 'unregistered_caller' : 'missing_caller_phone',
      notificationPurpose: 'voice_unregistered_caller',
      notificationPayload: {
        requester_phone: phone,
        reason: phone ? 'unregistered_caller' : 'missing_caller_phone',
        source: 'voice',
      },
    });

    return jsonResponse(
      {
        ok: intakeOnly.statusCode < 400,
        ignored: true,
        reason: phone ? 'unregistered_caller' : 'missing_caller_phone',
        voice_call_id: intakeOnly.voiceCallId,
        notification_created: intakeOnly.notificationCreated,
        notification_error: intakeOnly.notificationError,
      },
      intakeOnly.statusCode,
    );
  }

  if (requester.consent_voice !== true) {
    const intakeOnly = await recordIntakeWithoutRequest(supabase, {
      payload,
      callId,
      phone,
      requesterId: requester.id,
      transcript,
      extracted,
      now,
      status: 'voice_consent_missing',
      notificationPurpose: 'voice_consent_missing',
      notificationPayload: {
        requester_name: requester.name,
        requester_phone: requester.phone,
        reason: 'voice_consent_missing',
        source: 'voice',
      },
    });

    return jsonResponse(
      {
        ok: intakeOnly.statusCode < 400,
        ignored: true,
        reason: 'voice_consent_missing',
        voice_call_id: intakeOnly.voiceCallId,
        notification_created: intakeOnly.notificationCreated,
        notification_error: intakeOnly.notificationError,
      },
      intakeOnly.statusCode,
    );
  }

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
    const { error: notificationError } = await supabase
      .from('notifications')
      .insert({
        recipient_profile_id: null,
        help_request_id: null,
        assignment_id: null,
        channel: 'in_app',
        purpose: 'voice_request_needs_manual_entry',
        status: 'pending',
        payload: {
          requester_name: requester.name,
          requester_phone: requester.phone,
          voice_call_id: voiceCall.id,
          reason: normalizedRequest.error,
          source: 'voice',
        } satisfies Json,
      });

    return jsonResponse(
      {
        ok: true,
        needs_manual_entry: true,
        voice_call_id: voiceCall.id,
        error: normalizedRequest.error,
        notification_created: !notificationError,
        notification_error: notificationError?.message,
      },
      202,
    );
  }

  const requestLocationLatitude =
    normalizedRequest.value.location_latitude ?? requester.latitude ?? null;
  const requestLocationLongitude =
    normalizedRequest.value.location_longitude ?? requester.longitude ?? null;

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
      location_detail:
        normalizedRequest.value.location_detail ?? requester.address_detail ?? null,
      location_latitude: requestLocationLatitude,
      location_longitude: requestLocationLongitude,
      credit_reward: normalizedRequest.value.credit_reward,
      required_helpers: normalizedRequest.value.required_helpers,
      safety_tier: normalizedRequest.value.safety_tier,
      estimated_duration_minutes:
        normalizedRequest.value.estimated_duration_minutes,
      ai_extracted_payload: (extracted ?? {}) as Json,
      admin_notes: buildAdminNotes(extracted, normalizedRequest.value),
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

  const { error: notificationError } = await supabase
    .from('notifications')
    .insert({
      recipient_profile_id: null,
      help_request_id: helpRequest.id,
      assignment_id: null,
      channel: 'in_app',
      purpose: 'voice_request_created',
      status: 'pending',
      payload: {
        title: normalizedRequest.value.title,
        requester_name: requester.name,
        requester_phone: requester.phone,
        appointment_time: normalizedRequest.value.appointment_time,
        credit_reward: normalizedRequest.value.credit_reward,
        source: 'voice',
        confidence: toConfidence(extracted?.confidence),
      } satisfies Json,
    });

  return jsonResponse(
    {
      ok: true,
      voice_call_id: voiceCall.id,
      help_request_id: helpRequest.id,
      status: 'pending_review',
      notification_created: !notificationError,
      notification_error: notificationError?.message,
    },
    201,
  );
}

async function recordIntakeWithoutRequest(
  supabase: ReturnType<typeof createClient<Database>>,
  {
    payload,
    callId,
    phone,
    requesterId,
    transcript,
    extracted,
    now,
    status,
    notificationPurpose,
    notificationPayload,
  }: {
    payload: unknown;
    callId: string | null;
    phone: string | null;
    requesterId: string | null;
    transcript: string | null;
    extracted: ExtractedRequest | null;
    now: string;
    status: string;
    notificationPurpose: string;
    notificationPayload: Json;
  },
) {
  const { data: voiceCall, error: voiceCallError } = await supabase
    .from('voice_calls')
    .insert({
      provider: 'vapi',
      provider_call_id: callId,
      direction: 'inbound',
      phone: phone ?? 'unknown',
      requester_id: requesterId,
      purpose: 'intake',
      status,
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
    return {
      statusCode: 500,
      voiceCallId: null,
      notificationCreated: false,
      notificationError: voiceCallError.message,
    };
  }

  const notificationRecord = asRecord(notificationPayload) ?? {};
  const { error: notificationError } = await supabase
    .from('notifications')
    .insert({
      recipient_profile_id: null,
      help_request_id: null,
      assignment_id: null,
      channel: 'in_app',
      purpose: notificationPurpose,
      status: 'pending',
      payload: {
        ...notificationRecord,
        voice_call_id: voiceCall.id,
      } satisfies Json,
    });

  return {
    statusCode: 202,
    voiceCallId: voiceCall.id,
    notificationCreated: !notificationError,
    notificationError: notificationError?.message,
  };
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
  const structuredOutputResult = extractStructuredOutputResult(payload);
  if (structuredOutputResult) {
    return structuredOutputResult;
  }

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

function extractStructuredOutputResult(
  payload: unknown,
): ExtractedRequest | null {
  const candidates = [
    getPath(payload, ['message', 'artifact', 'structuredOutputs']),
    getPath(payload, ['message', 'analysis', 'structuredOutputs']),
    getPath(payload, ['message', 'structuredOutputs']),
    getPath(payload, ['artifact', 'structuredOutputs']),
    getPath(payload, ['analysis', 'structuredOutputs']),
    getPath(payload, ['structuredOutputs']),
  ];

  for (const candidate of candidates) {
    const result = selectStructuredOutputResult(candidate);
    if (result) {
      return result;
    }
  }

  return selectStructuredOutputResult(payload);
}

function selectStructuredOutputResult(value: unknown): ExtractedRequest | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const directResult = asStructuredRequest(record);
  if (directResult) {
    return directResult;
  }

  const outputEntries = Object.values(record).map(asRecord).filter(Boolean);
  const namedOutput = outputEntries.find(
    (entry) => getString(entry, 'name') === doumStructuredOutputName,
  );
  const namedResult = asStructuredRequest(namedOutput?.result);
  if (namedResult) {
    return namedResult;
  }

  for (const entry of outputEntries) {
    const result = asStructuredRequest(entry?.result);
    if (result) {
      return result;
    }
  }

  return null;
}

function asStructuredRequest(value: unknown): ExtractedRequest | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  if (toTrimmedString(record.title) && toTrimmedString(record.content)) {
    return record as ExtractedRequest;
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
	        location_latitude: number | null;
	        location_longitude: number | null;
	        credit_reward: number;
	        required_helpers: number;
	        safety_tier: Database['public']['Enums']['safety_tier'];
	        estimated_duration_minutes: number;
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

  const category = mapCategory(toTrimmedString(extracted.category));
  const estimatedDurationMinutes = toDurationMinutes(extracted);
  const creditReward =
    toCreditReward(extracted.credit_reward) ??
    calculateCreditReward(category, estimatedDurationMinutes);

  return {
    ok: true,
    value: {
      category,
      title,
      content,
      items_provided: toNullableBoolean(extracted.items_provided),
      items_needed_details: toTrimmedString(extracted.items_needed_details),
      appointment_time: normalizeAppointmentTime(extracted),
      location_public: toTrimmedString(extracted.location_public),
      location_detail: toTrimmedString(extracted.location_detail),
      location_latitude: toNullableNumber(
        extracted.location_latitude ?? extracted.latitude,
      ),
      location_longitude: toNullableNumber(
        extracted.location_longitude ?? extracted.longitude,
      ),
      credit_reward: creditReward,
      required_helpers: toRequiredHelpers(extracted.required_helpers),
      safety_tier: mapSafetyTier(
        extracted.safety_tier,
        extracted.needs_safety_review,
      ),
      estimated_duration_minutes: estimatedDurationMinutes,
    },
  };
}

async function findRegisteredRequester(
  supabase: ReturnType<typeof createClient<Database>>,
  phone: string | null,
): Promise<RequesterProfile | null> {
  const normalizedPhone = normalizePhone(phone);

  if (normalizedPhone) {
    const { data: requesters, error } = await supabase
      .from('profiles')
      .select(
        'id, name, phone, address_public, address_detail, latitude, longitude, consent_voice',
      )
      .eq('role', 'requester');

    if (error) {
      throw new Error(error.message);
    }

    const matched = (requesters ?? []).find(
      (profile) => normalizePhone(profile.phone) === normalizedPhone,
    );

    if (matched) {
      return matched;
    }
  }

  return null;
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

function mapSafetyTier(
  value: unknown,
  needsSafetyReview: unknown,
): Database['public']['Enums']['safety_tier'] {
  if (toNullableBoolean(needsSafetyReview) === true) {
    return 'needs_review';
  }

  const normalized = toTrimmedString(value)?.toLowerCase();

  switch (normalized) {
    case 'tier_1':
    case 'tier 1':
    case '1':
    case '위험':
      return 'tier_1';
    case 'tier_2':
    case 'tier 2':
    case '2':
      return 'tier_2';
    case 'tier_3':
    case 'tier 3':
    case '3':
    case '안전':
      return 'tier_3';
    case 'needs_review':
    case 'review':
    case '확인필요':
      return 'needs_review';
    default:
      return 'needs_review';
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

  return null;
}

function toDurationMinutes(extracted: ExtractedRequest) {
  const directMinutes = toNullableNumber(
    extracted.estimated_duration_minutes ?? extracted.duration_minutes,
  );
  if (directMinutes !== null) {
    return Math.max(15, Math.round(directMinutes));
  }

  const hours = toNullableNumber(
    extracted.estimated_hours ?? extracted.duration_hours,
  );
  if (hours !== null) {
    return Math.max(15, Math.round(hours * 60));
  }

  return 60;
}

function calculateCreditReward(
  category: Database['public']['Enums']['help_category'],
  durationMinutes: number,
) {
  const multiplier =
    category === 'labor'
      ? 1.5
      : category === 'daily_life' || category === 'household'
        ? 1.2
        : 1.0;

  return Math.round(15480 * (durationMinutes / 60) * multiplier);
}

function toRequiredHelpers(value: unknown) {
  const parsed = toNullableNumber(value);
  if (parsed === null) {
    return 3;
  }

  return Math.min(6, Math.max(3, Math.round(parsed)));
}

function toNullableNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function buildAdminNotes(
  extracted: ExtractedRequest | null,
  normalized: {
    safety_tier: Database['public']['Enums']['safety_tier'];
    appointment_time: string | null;
    location_public: string | null;
    required_helpers: number;
  },
) {
  const notes = ['Created from Vapi intake webhook.'];

  if (!normalized.appointment_time) {
    notes.push('Missing appointment time; operator must confirm.');
  }

  if (!normalized.location_public) {
    notes.push('Missing public location; operator must confirm.');
  }

  if (normalized.safety_tier === 'needs_review') {
    notes.push('Safety tier needs operator review.');
  }

  if (toNullableBoolean(extracted?.duplicate_suspected) === true) {
    notes.push('Possible duplicate flagged by intake.');
  }

  if (normalized.required_helpers === 3) {
    const rawRequiredHelpers = toNullableNumber(extracted?.required_helpers);
    if (rawRequiredHelpers !== null && rawRequiredHelpers < 3) {
      notes.push('Requested helper count below 3 was raised to MVP minimum.');
    }
  }

  return notes.join(' ');
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
