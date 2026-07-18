import { useMemo } from 'react';
import { AppIcon } from '../AppIcon';
import {
  buildSectionGroups,
  groupSortKey,
  groupTitle,
  matchesSettingsFilter,
} from '../../lib/modSettingsUtils';
import type { ModSettingsDocument, ModSettingsSection, ModSettingSchemaEntry } from '../../types/modSettings';
import { SettingField } from './SettingField';

interface ModSettingsSectionPanelProps {
  section: ModSettingsSection;
  doc: ModSettingsDocument;
  settingsMeta: Record<string, ModSettingSchemaEntry>;
  groupTitles: Record<string, string>;
  filter: string;
  readOnly: boolean;
  t: (key: string, ...args: (string | number)[]) => string;
  onChange: (section: ModSettingsSection, key: string, entry: unknown) => void;
}

export function ModSettingsSectionPanel({
  section,
  doc,
  settingsMeta,
  groupTitles,
  filter,
  readOnly,
  t,
  onChange,
}: ModSettingsSectionPanelProps) {
  const sectionData = doc.data[section] || {};
  const groups = useMemo(() => buildSectionGroups(sectionData, settingsMeta), [sectionData, settingsMeta]);

  const visibleGroups = useMemo(() => {
    const sorted = [...groups.entries()].sort(([a], [b]) =>
      groupSortKey(a, groupTitles, t).localeCompare(groupSortKey(b, groupTitles, t), undefined, {
        sensitivity: 'base',
      }),
    );
    return sorted
      .map(([groupId, keys]) => {
        const visibleKeys = keys.filter((key) =>
          matchesSettingsFilter(key, settingsMeta[key], groupTitles, filter, t),
        );
        return { groupId, visibleKeys };
      })
      .filter((group) => group.visibleKeys.length > 0);
  }, [filter, groupTitles, groups, settingsMeta, t]);

  if (!visibleGroups.length) {
    const filtered = filter.trim().length > 0;
    return (
      <div className="mod-settings-page__empty">
        <AppIcon name={filtered ? 'search' : 'edit_document'} size={30} className="mod-settings-page__empty-icon" />
        <span>{t(filtered ? 'mod_settings_no_results' : 'mod_settings_empty')}</span>
      </div>
    );
  }

  return (
    <div className="mod-settings-groups">
      {visibleGroups.map(({ groupId, visibleKeys }) => (
        <section key={groupId} className="mod-settings-group">
          <header className="mod-settings-group__header">
            <h3 className="mod-settings-group__title">{groupTitle(groupId, groupTitles, t)}</h3>
            <span className="mod-settings-group__count">{visibleKeys.length}</span>
          </header>
          <div className="mod-settings-group__body">
            <div className="mod-settings-list">
              {visibleKeys.map((key) => (
                <SettingField
                  key={key}
                  section={section}
                  settingKey={key}
                  entry={sectionData[key]}
                  meta={settingsMeta[key]}
                  readOnly={readOnly}
                  t={t}
                  onChange={onChange}
                />
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
