import { ColumnSelector } from '../ColumnSelector';
import { useSaveSettings, useSettings } from '../../hooks/useSettings';
import { useActiveWorkspace } from '../../hooks/useWorkspaces';
import {
  resolveWorkspaceVisibleColumns,
  saveWorkspaceVisibleColumns,
  type CrmConfigurableTable,
} from '../../lib/tablePreferences';
import { CRM_COLUMN_OPTIONS, type CrmColumnOption } from '../../lib/crm/tableColumns';

export function useCrmColumns(
  table: CrmConfigurableTable,
  options: CrmColumnOption[] = CRM_COLUMN_OPTIONS[table],
  sourceId?: string | null,
) {
  const settings = useSettings();
  const workspace = useActiveWorkspace();
  return resolveWorkspaceVisibleColumns(
    table,
    workspace.id,
    settings.data?.table_column_preferences,
    options.map((option) => option.id),
    sourceId,
  );
}

export function CrmColumnPicker({
  table,
  options,
  sourceId,
}: {
  table: CrmConfigurableTable;
  options: CrmColumnOption[];
  sourceId?: string | null;
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
    sourceId,
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
          sourceId,
        ),
      })}
      onRestore={() => saveSettings.mutate({
        table_column_preferences: saveWorkspaceVisibleColumns(
          settings.data?.table_column_preferences,
          table,
          workspace.id,
          null,
          allowedIds,
          sourceId,
        ),
      })}
    />
  );
}
