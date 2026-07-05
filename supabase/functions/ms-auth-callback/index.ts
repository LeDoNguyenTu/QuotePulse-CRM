// Edge Function: ms-auth-callback
// Exchanges the OAuth `code` for tokens (confidential client) and stores the
// refresh token in the caller's user_settings row.
import { handleOptions, json, errorResponse } from '../_shared/cors.ts';
import { getAdminClient, getUserId } from '../_shared/supabaseAdmin.ts';
import { exchangeCode, emailFromIdToken } from '../_shared/ms.ts';

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  try {
    const userId = await getUserId(req);
    const { code, redirect_uri } = (await req.json()) as {
      code?: string;
      redirect_uri?: string;
    };
    if (!code) return errorResponse('code is required', 400);

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
