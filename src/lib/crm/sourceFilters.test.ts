import { describe, expect, it } from 'vitest';
import {
  clearSourceFilter,
  sourceColumnId,
  sourceHeaderFromColumnId,
  toggleSourceFilter,
  type CrmSourceFilter,
} from './sourceFilters';

const source: CrmSourceFilter = {
  id: 'source-1',
  databaseId: 'CRM-ABC123DEF456',
  filename: 'accounts.xlsx',
  type: 'workbook',
};

describe('CRM source filters', () => {
  it('selects and clears a source explicitly', () => {
    expect(toggleSourceFilter(null, source)).toEqual(source);
    expect(clearSourceFilter(source)).toBeNull();
  });

  it('toggles the same source off and replaces a different source', () => {
    expect(toggleSourceFilter(source, source)).toBeNull();
    expect(toggleSourceFilter(source, { ...source, id: 'source-2' })).toMatchObject({ id: 'source-2' });
  });

  it('round-trips arbitrary workbook headers through safe column identifiers', () => {
    const id = sourceColumnId('Client / Sales Notes');
    expect(id).not.toContain(' ');
    expect(sourceHeaderFromColumnId(id)).toBe('Client / Sales Notes');
    expect(sourceHeaderFromColumnId('name')).toBeNull();
  });
});
