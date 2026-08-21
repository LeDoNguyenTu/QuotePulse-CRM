type GetUserId = (request: Request) => Promise<string>;

export async function resolveArchiveOwner(
  request: Request,
  requestedOwnerId: string | undefined,
  serverSecret: string,
  getUserId: GetUserId,
): Promise<string> {
  const suppliedSecret = request.headers.get('x-archive-secret') ?? '';
  if (serverSecret && suppliedSecret === serverSecret) {
    if (!requestedOwnerId) throw new Error('owner_id is required for a server migration');
    return requestedOwnerId;
  }
  return getUserId(request);
}
