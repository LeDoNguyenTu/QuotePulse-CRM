// Edge Function: ms-auth-callback
// Exchanges the OAuth `code` for tokens (confidential client) and stores the
// refresh token in the caller's user_settings row.
import { handleOptions, json, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import { exchangeCode, emailFromIdToken, verifyState } from '../_shared/ms.ts';

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  try {
    const { code, redirect_uri, state } = (await req.json()) as {
      code?: string;
      redirect_uri?: string;
      state?: string;
    };
    if (!code) return errorResponse('code is required', 400);

    // Identify the user. Prefer the verified session JWT; if the browser session
    // isn't available on the callback origin (e.g. the OAuth redirect landed on a
    // different Vercel domain than where the user logged in), fall back to the
    // HMAC-signed user id that ms-auth-start stamped into the OAuth `state`.
    // verifyState rejects any tampered/forged/expired state, so a client cannot
    // bind Microsoft tokens onto another user's settings row.
    let userId: string | null = null;
    try {
      userId = await getUserId(req);
    } catch {
      // no usable session on this origin — fall back to the signed state below
    }
    if (!userId) userId = await verifyState(state);
    if (!userId) {
      return errorResponse(
        'Could not identify the signed-in user (no session and no valid state).',
        401
      );
    }

    const redirectUri = redirect_uri ?? Deno.env.get('AZURE_REDIRECT_URI');
    if (!redirectUri) return errorResponse('AZURE_REDIRECT_URI not configured', 500);

    const tokens = await exchangeCode(code, redirectUri);
    if (!tokens.refresh_token) {
      return errorResponse(
        'No refresh token returned — ensure the offline_access scope is granted.',
        400
      );
    }
    const email = emailFromIdToken(tokens.id_token);

    const admin = getAdminClient();
    const { error } = await admin.from('user_settings').upsert(
      {
        user_id: userId,
        ms_refresh_token: tokens.refresh_token,
        ms_account_email: email,
      },
      { onConflict: 'user_id' }
    );
    if (error) throw error;

    return json({ ok: true, email });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : String(e), 500);
  }
});
