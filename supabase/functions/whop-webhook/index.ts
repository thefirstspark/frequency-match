/**
 * Whop ΓåÆ Frequency Match entitlements
 * Events: membership.activated, membership.deactivated, payment.succeeded, etc.
 *
 * Secrets:
 *   WHOP_WEBHOOK_SECRET     (Whop Developer ΓåÆ Webhooks)
 *   WHOP_PRO_PLAN_IDS       comma-separated plan ids that grant is_pro (optional)
 *   WHOP_PLAYER_PLAN_IDS    comma-separated plan ids that grant is_player (optional)
 *
 * If plan id lists are empty, any activating membership grants is_pro (legacy).
 * Player plan ids never grant is_pro; pro plan ids never grant is_player.
 */
import { withSupabase } from 'npm:@supabase/server'

function parseIdList(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function extractEmail(data: Record<string, unknown>): string | null {
  const walk = (obj: unknown, depth = 0): string | null => {
    if (!obj || depth > 4) return null
    if (typeof obj === 'string' && obj.includes('@') && obj.includes('.')) {
      return obj.toLowerCase().trim()
    }
    if (typeof obj !== 'object') return null
    const rec = obj as Record<string, unknown>
    for (const key of [
      'email',
      'user_email',
      'customer_email',
      'buyer_email',
    ]) {
      const v = rec[key]
      if (typeof v === 'string' && v.includes('@')) return v.toLowerCase().trim()
    }
    for (const nest of ['user', 'member', 'membership', 'data', 'product_user', 'customer']) {
      if (rec[nest]) {
        const found = walk(rec[nest], depth + 1)
        if (found) return found
      }
    }
    return null
  }
  return walk(data)
}

function extractMembershipId(data: Record<string, unknown>): string | null {
  const id =
    (data.id as string) ||
    ((data.membership as Record<string, unknown>)?.id as string) ||
    ((data.data as Record<string, unknown>)?.id as string) ||
    null
  return id || null
}

function extractPlanId(data: Record<string, unknown>): string | null {
  const direct =
    (data.plan_id as string) ||
    (data.planId as string) ||
    ((data.plan as Record<string, unknown>)?.id as string) ||
    null
  if (direct) return String(direct)

  const membership = data.membership as Record<string, unknown> | undefined
  if (membership) {
    const fromMem =
      (membership.plan_id as string) ||
      ((membership.plan as Record<string, unknown>)?.id as string) ||
      null
    if (fromMem) return String(fromMem)
  }

  const nested = data.data as Record<string, unknown> | undefined
  if (nested) {
    const fromData =
      (nested.plan_id as string) ||
      ((nested.plan as Record<string, unknown>)?.id as string) ||
      null
    if (fromData) return String(fromData)
  }
  return null
}

/** Best-effort Standard Webhooks verify (optional if secret missing). */
async function verifyStandardWebhook(
  body: string,
  headers: Headers,
  secret: string,
): Promise<boolean> {
  const id = headers.get('webhook-id') || headers.get('Webhook-Id')
  const ts = headers.get('webhook-timestamp') || headers.get('Webhook-Timestamp')
  const sig = headers.get('webhook-signature') || headers.get('Webhook-Signature')
  if (!id || !ts || !sig) return false

  const signedContent = `${id}.${ts}.${body}`
  let keyBytes: Uint8Array
  try {
    const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret
    keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
  } catch {
    keyBytes = new TextEncoder().encode(secret)
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(signedContent),
  )
  const digest = btoa(String.fromCharCode(...new Uint8Array(mac)))

  const parts = sig.split(' ')
  for (const part of parts) {
    const [, value] = part.split(',')
    if (value && value === digest) return true
  }
  return false
}

type Entitlement = 'pro' | 'player' | 'unknown'

function classifyPlan(planId: string | null): Entitlement {
  const proIds = parseIdList(Deno.env.get('WHOP_PRO_PLAN_IDS'))
  const playerIds = parseIdList(Deno.env.get('WHOP_PLAYER_PLAN_IDS'))

  if (planId && playerIds.includes(planId)) return 'player'
  if (planId && proIds.includes(planId)) return 'pro'

  // Legacy: no lists configured ΓåÆ treat as Pro
  if (proIds.length === 0 && playerIds.length === 0) return 'pro'

  if (planId && proIds.length > 0 && !proIds.includes(planId) && !playerIds.includes(planId)) {
    return 'unknown'
  }
  if (!planId) {
    if (proIds.length > 0 && playerIds.length === 0) return 'pro'
    if (playerIds.length > 0 && proIds.length === 0) return 'player'
    return 'pro'
  }
  return 'unknown'
}

async function applyEntitlement(
  admin: any,
  email: string,
  active: boolean,
  kind: Entitlement,
  membershipId: string | null,
  planId: string | null,
) {
  if (kind === 'unknown') {
    return { matched: 0, via: 'skipped_unknown_plan' as const }
  }

  const patch: Record<string, unknown> = {
    email,
    whop_membership_id: membershipId,
    whop_plan_id: planId,
    updated_at: new Date().toISOString(),
  }
  if (kind === 'pro') patch.is_pro = active
  if (kind === 'player') patch.is_player = active

  const { data: profiles, error } = await admin
    .from('fm_profiles')
    .select('id, email')
    .ilike('email', email)

  if (error) {
    throw new Error(error.message)
  }

  let targets = profiles || []

  if (targets.length === 0) {
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 })
    const match = (list?.users || []).filter(
      (u: { email?: string }) => (u.email || '').toLowerCase() === email,
    )
    for (const u of match) {
      await admin.from('fm_profiles').upsert({
        id: u.id,
        email: u.email,
        is_pro: kind === 'pro' ? active : false,
        is_player: kind === 'player' ? active : false,
        whop_membership_id: membershipId,
        whop_plan_id: planId,
        updated_at: new Date().toISOString(),
      })
    }
    return { matched: match.length, via: 'auth.users' as const }
  }

  for (const p of targets) {
    await admin.from('fm_profiles').update(patch).eq('id', p.id)
  }
  return { matched: targets.length, via: 'fm_profiles' as const }
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      return Response.json({
        ok: true,
        service: 'frequency-match-whop-webhook',
        accept: 'POST',
      })
    }
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204 })
    }
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 })
    }

    const bodyText = await req.text()
    const secret = Deno.env.get('WHOP_WEBHOOK_SECRET') || ''

    if (secret) {
      const ok = await verifyStandardWebhook(bodyText, req.headers, secret)
      if (!ok) {
        console.warn('[whop-webhook] signature check failed')
        return Response.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    let event: { type?: string; data?: Record<string, unknown> }
    try {
      event = JSON.parse(bodyText)
    } catch {
      return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const type = event.type || ''
    const data = (event.data || event) as Record<string, unknown>
    const email = extractEmail(data)
    const membershipId = extractMembershipId(data)
    const planId = extractPlanId(data)
    const kind = classifyPlan(planId)
    const admin = ctx.supabaseAdmin

    const activateTypes = [
      'membership.activated',
      'membership.went_valid',
      'membership.created',
      'payment.succeeded',
      'payment_succeeded',
    ]
    const deactivateTypes = [
      'membership.deactivated',
      'membership.went_invalid',
      'membership.cancel_at_period_end',
      'membership.expired',
    ]

    if (activateTypes.includes(type) || deactivateTypes.includes(type)) {
      const active = activateTypes.includes(type)
      if (!email) {
        console.warn('[whop-webhook] no email on event', type)
        return Response.json({ received: true, warning: 'no_email' })
      }

      try {
        const result = await applyEntitlement(
          admin,
          email,
          active,
          kind,
          membershipId,
          planId,
        )
        return Response.json({
          received: true,
          type,
          active,
          kind,
          plan_id: planId,
          ...result,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[whop-webhook]', msg)
        return Response.json({ error: msg }, { status: 500 })
      }
    }

    return Response.json({ received: true, ignored: type })
  }),
}
