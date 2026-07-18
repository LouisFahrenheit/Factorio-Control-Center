import { AppIcon } from '../AppIcon';
import { FccSwitch } from '../FccSwitch';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { AnnouncementsApi } from '../../hooks/useAnnouncements';
import type { AnnouncementItem } from '../../types/announcements';

interface AnnouncementsModalProps {
  announcements: AnnouncementsApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

function AnnounceListItem({
  item,
  label,
  selected,
  onSelect,
  t,
}: {
  item: AnnouncementItem;
  label: string;
  selected: boolean;
  onSelect: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}) {
  return (
    <li
      className={'announce-dialog__list-item' + (selected ? ' announce-dialog__list-item--selected' : '')}
      onClick={onSelect}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      aria-current={selected ? 'true' : undefined}
    >
      <span className="announce-dialog__list-item-label">{label}</span>
      {item.autoRepeat || item.forAllServers ? (
        <span className="announce-dialog__list-item-badges">
          {item.autoRepeat ? (
            <span className="announce-dialog__list-badge announce-dialog__list-badge--repeat" title={t('announce_badge_auto_repeat_title')}>
              <AppIcon name="autostart" size={12} />
            </span>
          ) : null}
          {item.forAllServers ? (
            <span className="announce-dialog__list-badge announce-dialog__list-badge--global" title={t('announce_for_all_servers')}>
              <AppIcon name="users" size={12} />
            </span>
          ) : null}
        </span>
      ) : null}
    </li>
  );
}

export function AnnouncementsModal({ announcements, t }: AnnouncementsModalProps) {
  const item = announcements.selectedItem;
  const editorDisabled = !item;
  const itemCount = announcements.state.items.length;

  return (
    <ModalBackdrop open={announcements.open} id="announceBackdrop" onClose={announcements.closeDialog}>
      <div className="fu-modal announce-dialog" role="dialog" aria-modal="true" aria-labelledby="announceDlgHeading">
        <div className="fu-modal__header announce-dialog__header" id="announceDlgHeading">
          <AppIcon name="supervisor" size={20} className="announce-dialog__header-icon" />
          <div className="announce-dialog__header-text">
            <span className="announce-dialog__header-title">{t('announce_dialog_title')}</span>
            {itemCount > 0 ? (
              <span className="announce-dialog__header-badge">{itemCount}</span>
            ) : null}
          </div>
        </div>
        <div className="fu-modal__body">
          <div className="announce-dialog__layout">
            <aside className="announce-dialog__list-card">
              <div className="announce-dialog__card-header">
                <span className="announce-dialog__card-title">{t('announce_list_title')}</span>
              </div>
              <div className="announce-dialog__list-toolbar">
                <button type="button" className="btn btn--with-icon" id="btnAnnounceAdd" onClick={announcements.addItem}>
                  <AppIcon name="add" size={16} />
                  {t('announce_add')}
                </button>
                <button
                  type="button"
                  className="btn btn--with-icon btn--danger"
                  id="btnAnnounceDelete"
                  onClick={announcements.deleteItem}
                >
                  <AppIcon name="delete" size={16} />
                  {t('announce_delete')}
                </button>
              </div>
              {itemCount > 0 ? (
                <ul id="announceList" className="announce-dialog__list">
                  {announcements.state.items.map((it) => (
                    <AnnounceListItem
                      key={it.id}
                      item={it}
                      label={announcements.listLabel(it)}
                      selected={it.id === announcements.state.selectedId}
                      onSelect={() => announcements.selectItem(it.id)}
                      t={t}
                    />
                  ))}
                </ul>
              ) : (
                <div className="announce-dialog__list-empty">
                  <AppIcon name="supervisor" size={28} className="announce-dialog__list-empty-icon" />
                  <span>{t('announce_list_empty')}</span>
                </div>
              )}
            </aside>
            <div className="announce-dialog__editor-card">
              <div className="announce-dialog__card-header">
                <span className="announce-dialog__card-title">{t('announce_editor_title')}</span>
              </div>
              <div className="announce-dialog__editor">
                <label className="announce-dialog__field">
                  <span className="announce-dialog__field-label">{t('announce_title_label')}</span>
                  <input
                    type="text"
                    id="announceEditTitle"
                    className="input announce-dialog__input"
                    maxLength={200}
                    autoComplete="off"
                    spellCheck
                    disabled={editorDisabled}
                    value={item?.title || ''}
                    onChange={(e) => announcements.updateSelected({ title: e.target.value })}
                  />
                </label>
                <label className="announce-dialog__field announce-dialog__field--grow">
                  <span className="announce-dialog__field-label">{t('announce_body_label')}</span>
                  <textarea
                    id="announceEditBody"
                    className="input announce-dialog__textarea"
                    rows={14}
                    maxLength={4000}
                    spellCheck
                    disabled={editorDisabled}
                    value={item?.body || ''}
                    onChange={(e) => announcements.updateSelected({ body: e.target.value })}
                  />
                </label>
                <FccSwitch
                  id="announceForAllServers"
                  className="announce-dialog__switch"
                  labelClassName="announce-dialog__switch-label"
                  disabled={editorDisabled}
                  checked={!!item?.forAllServers}
                  onChange={(checked) => announcements.updateSelected({ forAllServers: checked })}
                  label={t('announce_for_all_servers')}
                />
              </div>
            </div>
          </div>
          <section className="announce-dialog__schedule-card">
            <div className="announce-dialog__card-header">
              <span className="announce-dialog__card-title">{t('announce_schedule_title')}</span>
            </div>
            <div className="announce-dialog__schedule">
              <div className="announce-dialog__schedule-row">
                <FccSwitch
                  id="announceAutoRepeat"
                  className="announce-dialog__switch"
                  labelClassName="announce-dialog__switch-label"
                  disabled={editorDisabled}
                  checked={!!item?.autoRepeat}
                  onChange={(checked) =>
                    announcements.updateSelected({ autoRepeat: checked, lastAutoSentAt: Date.now() })
                  }
                  label={t('announce_auto_repeat')}
                />
                <div className="announce-dialog__interval-wrap">
                  <input
                    type="number"
                    id="announceIntervalHours"
                    className="input announce-dialog__interval"
                    min={1}
                    max={99}
                    step={1}
                    disabled={editorDisabled || !item?.autoRepeat}
                    value={item?.intervalHours ?? 6}
                    onChange={(e) => {
                      let n = parseInt(e.target.value, 10);
                      if (!Number.isFinite(n)) n = 6;
                      announcements.updateSelected({
                        intervalHours: Math.min(99, Math.max(1, n)),
                        lastAutoSentAt: Date.now(),
                      });
                    }}
                  />
                  <span className="announce-dialog__interval-suffix">{t('announce_hours_suffix')}</span>
                </div>
              </div>
              <FccSwitch
                id="announceSkipWhenNoPlayers"
                className="announce-dialog__switch"
                labelClassName="announce-dialog__switch-label"
                disabled={editorDisabled}
                checked={item?.skipWhenNoPlayers !== false}
                onChange={(checked) => announcements.updateSelected({ skipWhenNoPlayers: checked })}
                label={t('announce_skip_when_no_players')}
              />
            </div>
          </section>
        </div>
        <div className="fu-modal__footer announce-dialog__footer">
          <button type="button" className="btn btn--with-icon" id="announceDlgClose" onClick={announcements.closeDialog}>
            <AppIcon name="close" size={16} />
            {t('close')}
          </button>
          <button
            type="button"
            className="btn btn--with-icon btn--primary"
            id="btnAnnounceSendNow"
            disabled={editorDisabled}
            onClick={() => void announcements.sendNow()}
          >
            <AppIcon name="start" size={16} />
            {t('announce_send_now')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
