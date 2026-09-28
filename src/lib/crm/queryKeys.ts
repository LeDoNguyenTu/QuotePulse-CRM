type ListParams = { page: number; search: string };
type DealListParams = ListParams & { status: string };

export const crmKeys = {
  root: (workspaceId: string) => ['crm', workspaceId] as const,
  companyRoot: (workspaceId: string) => ['crm', workspaceId, 'companies'] as const,
  companies: (workspaceId: string, params: ListParams) => [
    'crm', workspaceId, 'companies', params,
  ] as const,
  contactRoot: (workspaceId: string) => ['crm', workspaceId, 'contacts'] as const,
  contacts: (workspaceId: string, params: ListParams) => [
    'crm', workspaceId, 'contacts', params,
  ] as const,
  dealRoot: (workspaceId: string) => ['crm', workspaceId, 'deals'] as const,
  deals: (workspaceId: string, params: DealListParams) => [
    'crm', workspaceId, 'deals', params,
  ] as const,
};
