# Porori Web

Minimal functional web app for the DOUM MVP. This repo currently contains:

- Supabase email/password auth
- role-aware app shell
- requester whitelist and consent-backed Vapi intake
- admin/mediator editable request review with publish/reject audit events
- helper exploration feed with category/NEW/distance filters and application badges
- helper application, admin matching approval, completion upload, and credit confirmation
- Cloudflare Pages Function for Vapi intake at `/api/vapi/intake`

## Local Setup

1. Copy environment variables:

```sh
cp .env.example .env.local
```

2. Fill in:

```txt
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

For Cloudflare Pages, also set server-only variables:

```txt
SUPABASE_SERVICE_ROLE_KEY=
VAPI_WEBHOOK_SECRET=
```

3. Install and run:

```sh
npm install
npm run dev
```

New signups become `helper` profiles by default. Promote the first admin/mediator in Supabase by updating `profiles.role`.

## Vapi Intake Webhook

Set the assistant server URL to:

```txt
https://<your-cloudflare-pages-domain>/api/vapi/intake
```

Configure a Vapi bearer-token credential with the same value as `VAPI_WEBHOOK_SECRET`.

The endpoint accepts Vapi `end-of-call-report` payloads and looks for structured request data in `message.analysis.structuredData`. It only creates a help request when the caller matches a registered `requester` profile with `consent_voice = true`; unregistered or non-consenting calls are preserved as `voice_calls` plus admin notifications.

For valid registered callers it creates:

- one `voice_calls` row
- one `help_requests` row with `status = pending_review`

Useful local/mock payload:

```json
{
  "message": {
    "type": "end-of-call-report",
    "endedReason": "assistant-ended-call",
    "call": { "id": "mock-call-001", "status": "ended" },
    "customer": { "number": "010-0000-0001" },
    "artifact": {
      "transcript": "어르신께서 토요일 오전 10시에 화분 5개를 옮겨달라고 요청함."
    },
    "analysis": {
      "structuredData": {
        "category": "일손",
        "title": "마당 화분 옮기기",
        "content": "어르신께서 마당에 있는 큰 화분 5개를 하우스로 옮기는 일손을 요청하셨습니다.",
        "items_provided": true,
        "items_needed_details": "장갑과 손수레는 어르신 댁에 있습니다.",
        "appointment_time_local": "2026-05-30T10:00:00+09:00",
        "location_public": "다로리 동쪽",
        "location_detail": "다로리 12번지",
        "required_helpers": 3,
        "safety_tier": "tier_3",
        "estimated_duration_minutes": 120,
        "confirmed_by_requester": true,
        "confidence": 0.92
      }
    }
  }
}
```
