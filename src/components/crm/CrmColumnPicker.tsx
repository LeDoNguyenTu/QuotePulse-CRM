import { ColumnSelector } from '../ColumnSelector';
import { useSaveSettings, useSettings } from '../../hooks/useSettings';
import {
  resolveVisibleColumns,
  saveVisibleColumns,
  type CrmConfigurableTable,
} from '../../lib/tablePreferences';
import type { CrmColumnOption } from '../../lib/crm/tableColumns';

export function useCrmColumns(table: CrmConfigurableTable) {
  const settings = useSettings();
  return resolveVisibleColumns(table, settings.data?.table_column_preferences);
}

export function CrmColumnPicker({
  table,
  options,
}: {
  table: CrmConfigurableTable;
  options: CrmColumnOption[];
}) {
  const settings = useSettings();
  const saveSettings = useSaveSettings();
  const visible = resolveVisibleColumns(table, settings.data?.table_column_preferences);

  return (
    <ColumnSelector
      options={options}
      visible={visible}
      onChange={(next) => saveSettings.mutate({
        table_column_preferences: saveVisibleColumns(
          settings.data?.table_column_preferences,
          table,
          next,
        ),
      })}
      onRestore={() => saveSettings.mutate({
        table_column_preferences: saveVisibleColumns(
          settings.data?.table_column_preferences,
          table,
          null,
        ),
      })}
    />
  );
}
