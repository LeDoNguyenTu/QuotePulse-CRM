import { getAdminClient } from '../_shared/supabaseAdmin.ts';

const headers = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };

Deno.serve(async (request) => {
  const token = new URL(request.url).searchParams.get('token');
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
    return new Response('<h1>Invalid unsubscribe link</h1>', { status: 400, headers });
  }
  const { data, error } = await getAdminClient().rpc('record_unsubscribe', { raw_token: token });
  if (error) return new Response('<h1>Unable to process this request</h1>', { status: 500, headers });
  return new Response(data ? '<h1>You have been unsubscribed.</h1>' : '<h1>This unsubscribe link is invalid or expired.</h1>', { status: 200, headers });
});
