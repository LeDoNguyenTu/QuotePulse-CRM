import { ColumnSelector } from '../ColumnSelector';
import { useSaveSettings, useSettings } from '../../hooks/useSettings';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import {
  resolveWorkspaceVisibleColumns,
  saveWorkspaceVisibleColumns,
  type CrmConfigurableTable,
} from '../../lib/tablePreferences';
import { CRM_COLUMN_OPTIONS, type CrmColumnOption } from '../../lib/crm/tableColumns';

export function useCrmColumns(table: CrmConfigurableTable) {
  const settings = useSettings();
  const workspace = useActiveWorkspace();
  const options = CRM_COLUMN_OPTIONS[table];
  return resolveWorkspaceVisibleColumns(
    table,
    workspace.id,
    settings.data?.table_column_preferences,
    options.map((option) => option.id),
  );
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
  const workspace = useActiveWorkspace();
  const allowedIds = options.map((option) => option.id);
  const visible = resolveWorkspaceVisibleColumns(
    table,
    workspace.id,
    settings.data?.table_column_preferences,
    allowedIds,
  );

  return (
    <ColumnSelector
      options={options}
      visible={visible}
      onChange={(next) => saveSettings.mutate({
        table_column_preferences: saveWorkspaceVisibleColumns(
          settings.data?.table_column_preferences,
          table,
          workspace.id,
          next,
          allowedIds,
        ),
      })}
      onRestore={() => saveSettings.mutate({
        table_column_preferences: saveWorkspaceVisibleColumns(
          settings.data?.table_column_preferences,
          table,
          workspace.id,
          null,
          allowedIds,
        ),
      })}
    />
  );
}
