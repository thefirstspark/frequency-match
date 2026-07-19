/**
 * Whop → Frequency Pro
 * Events: membership.activated, membership.deactivated, payment.succeeded, etc.
 *
 * Set secrets:
 *   WHOP_WEBHOOK_SECRET  (from Whop Developer → Webhooks)
 * Optional signature verify when secret is present (Standard Webhooks).
 *
 * Grants is_pro on fm_profiles by matching buyer email to profile/auth email.
 */
import { withSupabase } from 'npm:@supabase/server'

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
  // Secret may be raw or whsec_ / base64
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

  // signature header: "v1,xxxx v1,yyyy"
  const parts = sig.split(' ')
  for (const part of parts) {
    const [, value] = part.split(',')
    if (value && value === digest) return true
  }
  return false
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 })
    }

    const bodyText = await req.text()
    const secret = Deno.env.get('WHOP_WEBHOOK_SECRET') || ''

    if (secret) {
      const ok = await verifyStandardWebhook(bodyText, req.headers, secret)
      if (!ok) {
        // Still accept if Whop uses a different header scheme in older versions —
        // log and continue only when secret empty; with secret set, reject bad sigs.
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
      const isPro = activateTypes.includes(type)
      if (!email) {
        console.warn('[whop-webhook] no email on event', type)
        return Response.json({ received: true, warning: 'no_email' })
      }

      // Match profile by email (case-insensitive)
      const { data: profiles, error } = await admin
        .from('fm_profiles')
        .select('id, email')
        .ilike('email', email)

      if (error) {
        console.error('[whop-webhook] profile lookup', error.message)
        return Response.json({ error: error.message }, { status: 500 })
      }

      let targets = profiles || []

      // Fallback: auth.users via admin list (if profile email not yet set)
      if (targets.length === 0) {
        const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 })
        const match = (list?.users || []).filter(
          (u) => (u.email || '').toLowerCase() === email,
        )
        for (const u of match) {
          await admin.from('fm_profiles').upsert({
            id: u.id,
            email: u.email,
            is_pro: isPro,
            whop_membership_id: membershipId,
            updated_at: new Date().toISOString(),
          })
        }
        return Response.json({
          received: true,
          type,
          matched: match.length,
          via: 'auth.users',
        })
      }

      for (const p of targets) {
        await admin
          .from('fm_profiles')
          .update({
            is_pro: isPro,
            whop_membership_id: membershipId,
            email: email,
            updated_at: new Date().toISOString(),
          })
          .eq('id', p.id)
      }

      return Response.json({
        received: true,
        type,
        is_pro: isPro,
        matched: targets.length,
      })
    }

    return Response.json({ received: true, ignored: type })
  }),
}
