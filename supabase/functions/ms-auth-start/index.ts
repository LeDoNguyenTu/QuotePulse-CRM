// Edge Function: ms-auth-start
// Returns the Microsoft OAuth authorization URL for the current user to consent
// to delegated Mail.Send. The SPA redirects the browser to this URL.
import { handleOptions, json, errorResponse } from '../_shared/cors.ts';
import { getUserId } from '../_shared/supabaseAdmin.ts';
import { buildAuthUrl } from '../_shared/ms.ts';

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  try {
    const userId = await getUserId(req);
    const body = (await safeJson(req)) ?? {};
    const redirectUri = body.redirect_uri ?? Deno.env.get('AZURE_REDIRECT_URI');
    if (!redirectUri) {
      return errorResponse('AZURE_REDIRECT_URI not configured', 500);
    }
    // Encode the user id in `state` so the callback can attribute the tokens.
    const url = buildAuthUrl(redirectUri, userId);
    return json({ url });
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : String(e), 500);
  }
});

async function safeJson(req: Request): Promise<{ redirect_uri?: string } | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
