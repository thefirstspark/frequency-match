/**
 * Frequency Match access client
 * Access = Frequency Pro ($4.99/month via Whop) OR verified player
 * Designed for Whop embedded app + standalone site.
 */
(function (global) {
  const LS_HISTORY = 'fm_local_history';
  const LS_MATCH_COUNT = 'fm_match_count';

  const cfg = () => global.FM_CONFIG || {};

  let supabase = null;
  let session = null;
  let profile = null;
  let ready = false;

  function isConfigured() {
    return Boolean(cfg().SUPABASE_URL && cfg().SUPABASE_PUBLISHABLE_KEY);
  }

  function functionsBase() {
    if (cfg().FUNCTIONS_BASE) return cfg().FUNCTIONS_BASE.replace(/\/$/, '');
    if (cfg().SUPABASE_URL) return cfg().SUPABASE_URL.replace(/\/$/, '') + '/functions/v1';
    return '';
  }

  /** Running inside Whop (or any parent iframe). */
  function isEmbedded() {
    try {
      if (cfg().FORCE_EMBED === true) return true;
      const params = new URLSearchParams(global.location.search);
      if (params.get('whop_embed') === '1' || params.get('embed') === 'whop') return true;
      if (global.self !== global.top) return true;
    } catch (_) {
      return true;
    }
    return false;
  }

  /**
   * members (default): must be Pro or player once backend is configured
   * open: legacy unrestricted core collide
   */
  function accessMode() {
    const mode = (cfg().ACCESS_MODE || 'members').toLowerCase();
    return mode === 'open' ? 'open' : 'members';
  }

  function isPro() {
    return Boolean(profile && profile.is_pro);
  }

  function isPlayer() {
    return Boolean(profile && profile.is_player);
  }

  /** Entitled to use the app (collide + results). */
  function hasAccess() {
    if (accessMode() === 'open') return true;
    if (!isConfigured()) return true;
    return isPro() || isPlayer();
  }

  function canRunMatch() {
    return hasAccess();
  }

  function matchCount() {
    const n = parseInt(localStorage.getItem(LS_MATCH_COUNT) || '0', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function bumpMatchCount() {
    localStorage.setItem(LS_MATCH_COUNT, String(matchCount() + 1));
  }

  async function init() {
    if (!isConfigured() || !global.supabase) {
      ready = true;
      emit('ready');
      emit('usage', getUsageSnapshot());
      return;
    }

    supabase = global.supabase.createClient(
      cfg().SUPABASE_URL,
      cfg().SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }
    );

    const { data } = await supabase.auth.getSession();
    session = data.session || null;
    if (session) await loadProfile();

    supabase.auth.onAuthStateChange(async (_event, s) => {
      session = s;
      if (session) {
        await loadProfile();
      } else {
        profile = null;
      }
      emit('auth', { session, profile });
      emit('usage', getUsageSnapshot());
    });

    ready = true;
    emit('ready');
    emit('auth', { session, profile });
    emit('usage', getUsageSnapshot());
  }

  async function loadProfile() {
    if (!supabase || !session) {
      profile = null;
      return null;
    }
    const { data, error } = await supabase
      .from('fm_profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) {
      console.warn('[FM] loadProfile', error.message);
    }

    if (!data) {
      const { data: inserted } = await supabase
        .from('fm_profiles')
        .insert({ id: session.user.id, email: session.user.email })
        .select()
        .single();
      profile = inserted || null;
    } else {
      profile = data;
      if (session.user.email && data.email !== session.user.email) {
        await supabase
          .from('fm_profiles')
          .update({ email: session.user.email })
          .eq('id', session.user.id);
        profile = { ...data, email: session.user.email };
      }
    }
    return profile;
  }

  function getUsageSnapshot() {
    const entitled = hasAccess();
    return {
      configured: isConfigured(),
      signedIn: Boolean(session),
      email: session?.user?.email || null,
      isPro: isPro(),
      isPlayer: isPlayer(),
      hasAccess: entitled,
      accessMode: accessMode(),
      embedded: isEmbedded(),
      freeUsed: matchCount(),
      remaining: entitled ? null : 0,
      limit: null,
      canRun: entitled,
      priceLabel: cfg().PRO_PRICE_LABEL || '$4.99/month',
      proName: cfg().PRO_NAME || 'Frequency Pro',
      playerCheckout: Boolean(cfg().WHOP_PLAYER_CHECKOUT_URL),
    };
  }

  async function authorizeMatch() {
    const usage = getUsageSnapshot();
    if (!usage.canRun) {
      return {
        ok: false,
        reason: usage.signedIn ? 'access_required' : 'sign_in_required',
        usage,
      };
    }
    return { ok: true, usage };
  }

  async function recordMatch() {
    bumpMatchCount();
    emit('usage', getUsageSnapshot());
    return { ok: true, usage: getUsageSnapshot() };
  }

  /** Pro-only features (cloud library, deep lens). Players get core access only. */
  function requirePro() {
    if (isPro()) return { ok: true, usage: getUsageSnapshot() };
    return { ok: false, reason: 'pro_required', usage: getUsageSnapshot() };
  }

  async function signInWithEmail(email) {
    if (!supabase) throw new Error('Supabase not configured');
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (error) throw error;
    return true;
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    profile = null;
    session = null;
    emit('auth', { session: null, profile: null });
    emit('usage', getUsageSnapshot());
  }

  async function saveMatch(matchPayload) {
    try {
      const list = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
      list.unshift({
        id: 'local_' + Date.now(),
        created_at: new Date().toISOString(),
        ...matchPayload,
      });
      localStorage.setItem(LS_HISTORY, JSON.stringify(list.slice(0, 20)));
    } catch (_) { /* ignore */ }

    if (!isPro()) {
      return { saved: false, reason: 'pro_required', local: true };
    }
    if (!supabase || !session) {
      return { saved: false, reason: 'sign_in_required', local: true };
    }

    const row = {
      user_id: session.user.id,
      p1_name: matchPayload.p1_name,
      p1_date: matchPayload.p1_date,
      p1_place: matchPayload.p1_place || null,
      p2_name: matchPayload.p2_name,
      p2_date: matchPayload.p2_date,
      p2_place: matchPayload.p2_place || null,
      relationship_mode: matchPayload.relationship_mode || 'general',
      overall_score: matchPayload.overall_score,
      scores: matchPayload.scores || {},
      profiles: matchPayload.profiles || {},
      narrative: matchPayload.narrative || {},
      is_pro_analysis: Boolean(matchPayload.is_pro_analysis),
    };

    const { data, error } = await supabase
      .from('fm_matches')
      .insert(row)
      .select()
      .single();

    if (error) {
      console.warn('[FM] saveMatch', error.message);
      return { saved: false, reason: error.message, local: true };
    }
    return { saved: true, match: data, local: true };
  }

  async function listMatches() {
    const local = (() => {
      try {
        return JSON.parse(localStorage.getItem(LS_HISTORY) || '[]');
      } catch {
        return [];
      }
    })();

    if (!isPro() || !supabase || !session) {
      return { matches: local, source: 'local' };
    }

    const { data, error } = await supabase
      .from('fm_matches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.warn('[FM] listMatches', error.message);
      return { matches: local, source: 'local' };
    }
    return { matches: data || [], source: 'cloud' };
  }

  function buildCheckoutDest(checkoutUrl) {
    const returnUrl =
      window.location.origin + window.location.pathname + '?whop=return';
    try {
      const u = new URL(checkoutUrl);
      if (!u.searchParams.has('redirect')) {
        u.searchParams.set('redirect', returnUrl);
      }
      return u.toString();
    } catch (_) {
      return checkoutUrl;
    }
  }

  async function startCheckout(kind) {
    const isPlayerPass = kind === 'player';
    const checkoutUrl = isPlayerPass
      ? cfg().WHOP_PLAYER_CHECKOUT_URL
      : cfg().WHOP_CHECKOUT_URL;
    if (!checkoutUrl) {
      throw new Error(
        isPlayerPass
          ? 'WHOP_PLAYER_CHECKOUT_URL missing in js/config.js'
          : 'WHOP_CHECKOUT_URL missing in js/config.js'
      );
    }
    if (!session) {
      throw new Error('Sign in with the same email you’ll use on Whop, then continue');
    }

    try {
      localStorage.setItem(
        'fm_whop_pending',
        JSON.stringify({
          userId: session.user.id,
          email: session.user.email || '',
          kind: isPlayerPass ? 'player' : 'pro',
          at: Date.now(),
        })
      );
    } catch (_) { /* ignore */ }

    const dest = buildCheckoutDest(checkoutUrl);

    try {
      if (global.top && global.top !== global.self) {
        global.top.location.href = dest;
        return;
      }
    } catch (_) {
      try {
        window.open(dest, '_blank', 'noopener,noreferrer');
        return;
      } catch (__) { /* ignore */ }
    }
    window.location.href = dest;
  }

  async function openBillingPortal() {
    const manage = cfg().WHOP_MANAGE_URL || 'https://whop.com/orders';
    try {
      if (global.top && global.top !== global.self) {
        try {
          global.top.open(manage, '_blank');
          return;
        } catch (_) {
          global.top.location.href = manage;
          return;
        }
      }
    } catch (_) { /* ignore */ }
    window.open(manage, '_blank', 'noopener,noreferrer');
  }

  async function refreshProStatus() {
    if (session) await loadProfile();
    emit('usage', getUsageSnapshot());
    emit('auth', { session, profile });
    return getUsageSnapshot();
  }

  const listeners = {};
  function on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
  }
  function emit(event, payload) {
    (listeners[event] || []).forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.error(e);
      }
    });
  }

  global.FM = {
    init,
    on,
    isConfigured,
    isPro,
    isPlayer,
    hasAccess,
    isEmbedded,
    canRunMatch,
    remaining: () => (hasAccess() ? null : 0),
    getUsageSnapshot,
    authorizeMatch,
    recordMatch,
    requirePro,
    signInWithEmail,
    signOut,
    saveMatch,
    listMatches,
    startCheckout,
    openBillingPortal,
    refreshProStatus,
    getSession: () => session,
    getProfile: () => profile,
    isReady: () => ready,
  };
})(window);
