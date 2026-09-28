export type CrmDetailKind = 'company' | 'contact' | 'deal';

export interface CrmDetailQuery {
  table: string;
  select: string;
  workspaceId: string;
  foreignKey: string;
  recordId: string;
  order?: { column: string; ascending: boolean };
  limit?: number;
}

export interface CrmDetailSpec {
  primary: Omit<CrmDetailQuery, 'foreignKey'>;
  associations: CrmDetailQuery[];
  lineage: CrmDetailQuery;
}

export interface CrmSourceLineage {
  source_row_number: number;
  source_import: {
    database_id: string;
    original_filename: string;
    sheet_name: string | null;
    created_at: string;
  } | null;
}

export interface CrmDetailData<TRecord = unknown> {
  record: TRecord | null;
  associations: unknown[][];
  associationCounts: number[];
  lineage: CrmSourceLineage[];
  lineageCount: number;
}

const primarySelect: Record<CrmDetailKind, string> = {
  company: '*',
  contact: '*,company:crm_companies(id,name)',
  deal: '*,company:crm_companies(id,name)',
};

const tableName: Record<CrmDetailKind, string> = {
  company: 'crm_companies',
  contact: 'crm_contacts',
  deal: 'crm_deals',
};

const lineageKey: Record<CrmDetailKind, string> = {
  company: 'company_id',
  contact: 'contact_id',
  deal: 'deal_id',
};

export function crmDetailSpec(
  kind: CrmDetailKind,
  workspaceId: string,
  recordId: string,
): CrmDetailSpec {
  if (!workspaceId.trim()) throw new Error('A workspace identifier is required.');
  if (!recordId.trim()) throw new Error('A record identifier is required.');

  const associations: Record<CrmDetailKind, CrmDetailQuery[]> = {
    company: [
      {
        table: 'crm_contacts', select: '*', workspaceId, foreignKey: 'company_id', recordId,
        order: { column: 'full_name', ascending: true }, limit: 100,
      },
      {
        table: 'crm_deals', select: '*', workspaceId, foreignKey: 'company_id', recordId,
        order: { column: 'created_at', ascending: false }, limit: 100,
      },
    ],
    contact: [{
      table: 'crm_deal_contacts',
      select: 'role,deal:crm_deals(*,company:crm_companies(id,name))',
      workspaceId,
      foreignKey: 'contact_id',
      recordId,
      order: { column: 'created_at', ascending: false },
      limit: 100,
    }],
    deal: [{
      table: 'crm_deal_contacts',
      select: 'role,contact:crm_contacts(*)',
      workspaceId,
      foreignKey: 'deal_id',
      recordId,
      order: { column: 'created_at', ascending: false },
      limit: 100,
    }],
  };

  return {
    primary: {
      table: tableName[kind],
      select: primarySelect[kind],
      workspaceId,
      recordId,
    },
    associations: associations[kind],
    lineage: {
      table: 'crm_source_references',
      select: 'source_row_number,source_import:crm_source_imports(database_id,original_filename,sheet_name,created_at)',
      workspaceId,
      foreignKey: lineageKey[kind],
      recordId,
      order: { column: 'created_at', ascending: false },
      limit: 100,
    },
  };
}
