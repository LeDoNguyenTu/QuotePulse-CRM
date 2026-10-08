export type RestoreTable = 'companies' | 'deals' | 'contacts';
export type RestoreItem = { table: RestoreTable; row: Record<string, unknown> };

export async function buildRestoreSet(
  table: RestoreTable,
  row: Record<string, unknown>,
  ownerId: string,
  findArchived: (table: 'companies', id: string) => Promise<Record<string, unknown> | null>,
): Promise<RestoreItem[]> {
  if (row.owner_id !== ownerId) throw new Error('Archived record owner mismatch.');
  if (!['companies', 'deals', 'contacts'].includes(table)) throw new Error('Archived record table is not restore allow-listed.');
  if (table === 'companies' || !row.company_id) return [{ table, row }];
  const company = await findArchived('companies', String(row.company_id));
  if (!company) throw new Error('Archived record dependency was not found.');
  if (company.owner_id !== ownerId) throw new Error('Archived dependency owner mismatch.');
  return [{ table: 'companies', row: company }, { table, row }];
}
