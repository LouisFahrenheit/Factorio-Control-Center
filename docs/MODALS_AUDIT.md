# Аудит модальных окон Factorio Control Center

Полный перечень всех модальных окон клиентского приложения (`client/src`), их текущее состояние дизайна, используемые паттерны и рекомендации по обновлению.

---

## 1. Сводная статистика

| Показатель                                             | Количество | Доля |
| ------------------------------------------------------ | :--------: | :--: |
| **Всего проверено модальных окон и диалогов**          |   **55**   | 100% |
| **Новый дизайн** (актуальная дизайн-система проекта)   |   **39**   | ~71% |
| **Устаревший дизайн** (требуют унификации и редизайна) |   **16**   | ~29% |

---

## 2. Критерии классификации дизайна

### Признаки нового дизайна

- **Стандартизированная шапка**:
  - Фирменная плашка с иконкой (`mod-install-dialog__header-icon-wrap` / `InstanceOperationDialogHeader` / `.public-settings-modal__icon` / `.backup-modal-title`).
  - Четкая типографика (`<h2>`, акцентные цвета, статус-бейджи и унифицированная кнопка закрытия).
  - Либо модальные окна библиотеки Mantine (`.fcc-modal`, `.fcc-modal--confirm`, `.backup-modal`) с Tabler-иконками и callout-блоками.
- **Карточная компоновка содержимого**:
  - Секции контента оформлены в карточки (`--bg-card`, `--bg-card-header`, скругления 10px, тонкие внутренние рамки).
  - Использование современных интерактивных компонентов: переключатели `FccSwitch`, чипы, адаптивные сетки, выпадающие списки с цветными индикаторами статуса серверов.
- **Модульная изоляция стилей**:
  - Стили вынесены в файлы `client/src/styles/modals/*.css` или модули вкладок (`mods-tab.css`, `commands-tab.css`).
  - Кнопки футера стандартизированы: `.btn.btn--primary`, `.btn.btn--secondary`, `.btn.btn--danger` с обязательными иконками `AppIcon` или Tabler.

### Признаки устаревшего дизайна

- **Устаревший заголовок `.fu-modal__header`**:
  - Простой однострочный `div` без плашки иконки (голый текст или несгруппированная иконка сбоку).
- **Сырое содержимое**:
  - Плоская верстка без карточек секций, использование нативных браузерных чекбоксов/полей ввода.
  - Обилие хардкодных инлайн-стилей (`style={{ padding: '20px 24px', maxWidth: 520, ... }}`).
  - Использование старых компонентов вроде полосы прогресса `.fu-progress`, сырых блоков `<pre>` и устаревших текстовых классов `.hint`.
- **Футер**:
  - Простые текстовые кнопки без иконок или кастомные несистемные элементы управления.

---

## 3. Таблица всех модальных окон

| №   | Название / Компонент                              | Файл / Расположение                                                                                                     | Назначение                                   |     Дизайн     | Особенности реализации                                                                           |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | :------------: | ------------------------------------------------------------------------------------------------ |
| 1   | **BackupCreateModal**                             | [BackupCreateModal.tsx](file:///c:/FCC/client/src/components/modals/BackupCreateModal.tsx)                              | Создание резервной копии системы             |   **Новый**    | Mantine `fcc-modal`, иконка в шапке, Hero-карточки, переключатели `FccSwitch`.                   |
| 2   | **BackupAutoSettingsModal**                       | [BackupAutoSettingsModal.tsx](file:///c:/FCC/client/src/components/modals/BackupAutoSettingsModal.tsx)                  | Настройки расписания автобэкапов             |   **Новый**    | Mantine `fcc-modal`, Hero Card главного тумблера, карточки параметров.                           |
| 3   | **BackupRestoreModal**                            | [BackupRestoreModal.tsx](file:///c:/FCC/client/src/components/modals/BackupRestoreModal.tsx)                            | Восстановление из бэкапа                     |   **Новый**    | Mantine `fcc-modal`, иконка предупреждения, бейдж файла, выбор режимов.                          |
| 4   | **SectionHelpModal** (и `WebAccessHelpModal`)     | [SectionHelpModal.tsx](file:///c:/FCC/client/src/components/SectionHelpModal.tsx)                                       | Контекстная справка разделов                 |   **Новый**    | `section-help-modal.css`, интро-карточка с акцентной полосой, 2-колоночные карточки.             |
| 5   | **fccConfirmModal** (`openFccConfirmModal`)       | [fccConfirmModal.tsx](file:///c:/FCC/client/src/lib/fccConfirmModal.tsx)                                                | Универсальные диалоги подтверждения          |   **Новый**    | Редизайн Mantine `fcc-modal--confirm`, callout-карточки (danger/default), кнопки с иконками.     |
| 6   | **modDepsConfirm** (`ModDependenciesConfirmBody`) | [modDepsConfirm.tsx](file:///c:/FCC/lib/modDepsConfirm.tsx)                                                             | Подтверждение зависимостей и конфликтов      |   **Новый**    | Mantine `fcc-modal--mod-deps`, карточки зависимостей, выбор рекомендованных модов.               |
| 7   | **openModGameVersionConfirm**                     | [modGameVersionConfirm.tsx](file:///c:/FCC/client/src/lib/modGameVersionConfirm.tsx)                                    | Предупреждение о несовместимости версий игры |   **Новый**    | Mantine `fcc-modal--mod-game-version`, структурированный список несовместимостей.                |
| 8   | **UploadProgressModal**                           | [UploadProgressModal.tsx](file:///c:/FCC/client/src/components/upload/UploadProgressModal.tsx)                          | Прогресс загрузки/выгрузки файлов            |   **Новый**    | Режимы плавающего виджета и модального окна, расчет скоростей/ETA, Tabler-иконки.                |
| 9   | **InstanceEditorModal**                           | [InstanceEditorModal.tsx](file:///c:/FCC/client/src/components/instances/InstanceEditorModal.tsx)                       | Создание и редактирование сервера            |   **Новый**    | `instance-editor-modal.css`, карточки секций `.instance-editor-card`, вкладки, бейджи.           |
| 10  | **InstancePeekModal**                             | [InstancePeekModal.tsx](file:///c:/FCC/client/src/components/instances/InstancePeekModal.tsx)                           | Быстрый просмотр инстанса (Peek)             |   **Новый**    | Цветные плашки-бейджи иконки, быстрый поиск, карточки игроков/модов/сервера.                     |
| 11  | **InstanceCloneModal**                            | [InstanceCloneModal.tsx](file:///c:/FCC/client/src/components/instances/InstanceCloneModal.tsx)                         | Клонирование инстанса                        |   **Новый**    | `InstanceOperationDialogHeader` (согласован с `mod-install-dialog`), прогресс-бар.               |
| 12  | **InstanceDeleteModal**                           | [InstanceDeleteModal.tsx](file:///c:/FCC/client/src/components/instances/InstanceDeleteModal.tsx)                       | Удаление инстанса                            |   **Новый**    | `InstanceOperationDialogHeader` (danger tone), карточка сервера, опции с `FccSwitch`.            |
| 13  | **InstanceDeleteProgressModal**                   | [InstanceDeleteProgressModal.tsx](file:///c:/FCC/client/src/components/instances/InstanceDeleteProgressModal.tsx)       | Прогресс удаления инстанса                   |   **Новый**    | `InstanceOperationDialogHeader`, пошаговый лог удаления и прогресс.                              |
| 14  | **InstanceBootstrapProgressModal**                | [InstanceBootstrapProgressModal.tsx](file:///c:/FCC/client/src/components/instances/InstanceBootstrapProgressModal.tsx) | Инициализация нового сервера                 |   **Новый**    | `InstanceOperationDialogHeader`, карточки этапов развертывания.                                  |
| 15  | **MaintenanceTaskEditorModal**                    | [MaintenanceTaskEditorModal.tsx](file:///c:/FCC/client/src/components/instances/MaintenanceTaskEditorModal.tsx)         | Редактор задач автообслуживания              |   **Новый**    | Карточки `.maintenance-editor-card`, кастомный селектор дней/времени, `FccSwitch`.               |
| 16  | **MaintenanceInstancePickerModal**                | [MaintenanceInstancePickerModal.tsx](file:///c:/FCC/client/src/components/instances/MaintenanceInstancePickerModal.tsx) | Выбор серверов для обслуживания              |   **Новый**    | Стилизованный список с hover-эффектами, бейджами блокировки обновлений.                          |
| 17  | **PublicServerEditModal**                         | [PublicServerEditModal.tsx](file:///c:/FCC/client/src/components/instances/PublicServerEditModal.tsx)                   | Настройка публичной карточки сервера         |   **Новый**    | `public-server-edit-modal.css`, плашка иконки, карточка видимости с `FccSwitch`.                 |
| 18  | **PublicAppearanceModal**                         | [PublicAppearanceModal.tsx](file:///c:/FCC/client/src/components/instances/PublicAppearanceModal.tsx)                   | Оформление публичной страницы                |   **Новый**    | `public-settings-modals.css`, плашка `IconPalette`, карточки настроек, `FccSwitch`.              |
| 19  | **PublicNetworkModal**                            | [PublicNetworkModal.tsx](file:///c:/FCC/client/src/components/instances/PublicNetworkModal.tsx)                         | Сеть и домен публичной страницы              |   **Новый**    | `public-settings-modals.css`, плашка `IconNetwork`, карточки параметров.                         |
| 20  | **WebUserEditorModal**                            | [WebUserEditorModal.tsx](file:///c:/FCC/client/src/components/instances/WebUserEditorModal.tsx)                         | Создание/редактирование веб-пользователя     |   **Новый**    | `web-user-modal.css`, карточка учетных данных `.web-user-modal-hero`, группы прав с `FccSwitch`. |
| 21  | **FactorioUpdateModal**                           | [FactorioUpdateModal.tsx](file:///c:/FCC/client/src/components/panel/FactorioUpdateModal.tsx)                           | Обновление движка Factorio                   |   **Новый**    | Шапка обновлена до `mod-install-dialog__header-icon-wrap`, двухфазное обновление.                |
| 22  | **ModsInstallModal**                              | [ModsInstallModal.tsx](file:///c:/FCC/client/src/components/panel/ModsInstallModal.tsx)                                 | Портал модов (поиск и установка)             |   **Новый**    | Эталонный дизайн `.mod-install-dialog`, табы, фильтры, панель предпросмотра.                     |
| 23  | **ModPortalVersionsModal**                        | [ModPortalVersionsModal.tsx](file:///c:/FCC/client/src/components/panel/ModPortalVersionsModal.tsx)                     | Релизы и версии мода с портала               |   **Новый**    | Шапка `mod-install-dialog__header-icon-wrap`, ссылки на портал, карточки версий.                 |
| 24  | **ModsFromSaveModal**                             | [ModsFromSaveModal.tsx](file:///c:/FCC/client/src/components/panel/ModsFromSaveModal.tsx)                               | Установка недостающих модов из сейва         |   **Новый**    | Шапка `mod-update-all-flow__header`, карточки статистики сейва, бейджи наличия.                  |
| 25  | **ModsDownloadAllModal**                          | [ModsDownloadAllModal.tsx](file:///c:/FCC/client/src/components/panel/ModsDownloadAllModal.tsx)                         | Скачивание всех модов архивом                |   **Новый**    | Стиль `.modpack-form-dialog`, карточки статистики архива, переключатели `FccSwitch`.             |
| 26  | **ModpackSaveModal**                              | [ModpackSaveModal.tsx](file:///c:/FCC/client/src/components/panel/ModpackSaveModal.tsx)                                 | Сохранение текущих модов в модпак            |   **Новый**    | Стиль `.modpack-form-dialog`, иконка в шапке, карточки параметров.                               |
| 27  | **ModpackActivateModal**                          | [ModpackActivateModal.tsx](file:///c:/FCC/client/src/components/panel/ModpackActivateModal.tsx)                         | Активация модпака                            |   **Новый**    | Стиль `.modpack-form-dialog`, карточка сводки модов, селектор режима.                            |
| 28  | **ModpackExportModal**                            | [ModpackExportModal.tsx](file:///c:/FCC/client/src/components/panel/ModpackExportModal.tsx)                             | Экспорт архива модпака                       |   **Новый**    | Стиль `.modpack-form-dialog`, статистика архива, кнопки действий.                                |
| 29  | **ModpackImportModal**                            | [ModpackImportModal.tsx](file:///c:/FCC/client/src/components/panel/ModpackImportModal.tsx)                             | Импорт архива модпака                        |   **Новый**    | Стиль `.modpack-form-dialog`, предпросмотр содержимого, валидация.                               |
| 30  | **ModpackRenameModal**                            | [ModpackRenameModal.tsx](file:///c:/FCC/client/src/components/panel/ModpackRenameModal.tsx)                             | Переименование модпака                       |   **Новый**    | Стиль `.modpack-form-dialog`, карточка текущего имени, иконка редактирования.                    |
| 31  | **CommandEditorModal**                            | [CommandEditorModal.tsx](file:///c:/FCC/client/src/components/panel/CommandEditorModal.tsx)                             | Редактор консольных команд                   |   **Новый**    | Редизайн в `command-editor-modal.css`, компактные строки полей, бейджи категорий.                |
| 32  | **CommandCategoryModal**                          | [CommandCategoryModal.tsx](file:///c:/FCC/client/src/components/panel/CommandCategoryModal.tsx)                         | Создание категории команд                    |   **Новый**    | Заменил `prompt`, оформлен в едином стиле командных диалогов.                                    |
| 33  | **CommandItemsEditorModal**                       | [CommandItemsEditorModal.tsx](file:///c:/FCC/client/src/components/panel/CommandItemsEditorModal.tsx)                   | Быстрый редактор предметов                   |   **Новый**    | Карточки предметов, чипы количества, поиск, ластик сброса.                                       |
| 34  | **PlayerReasonModal**                             | [PlayerReasonModal.tsx](file:///c:/FCC/client/src/components/panel/PlayerReasonModal.tsx)                               | Указание причины кика / бана                 |   **Новый**    | Плашка с `IconAlertTriangle`, карточка игрока, кнопки с Tabler-иконками.                         |
| 35  | **AnnouncementsModal**                            | [AnnouncementsModal.tsx](file:///c:/FCC/client/src/components/panel/AnnouncementsModal.tsx)                             | Автоматические анонсы в чат                  |   **Новый**    | Master-detail макет, бейджи расписания, выбор цвета чипами, `FccSwitch`.                         |
| 36  | **MonitoringSettingsModal**                       | [MonitoringSettingsModal.tsx](file:///c:/FCC/client/src/components/panel/MonitoringSettingsModal.tsx)                   | Настройка графиков мониторинга               |   **Новый**    | Карточки метрик с framer-motion анимацией, reorder-кнопки, `FccSwitch`.                          |
| 37  | **SaveRenameModal**                               | [SaveRenameModal.tsx](file:///c:/FCC/client/src/components/panel/SaveRenameModal.tsx)                                   | Переименование файла сохранения              |   **Новый**    | Стиль `.modpack-form-dialog`, плашка текущего имени, кнопки с иконками.                          |
| 38  | **SaveTransferModal**                             | [SaveTransferModal.tsx](file:///c:/FCC/client/src/components/panel/SaveTransferModal.tsx)                               | Перенос сохранения на другой инстанс         |   **Новый**    | Стиль `.modpack-form-dialog`, выпадающий список инстансов со статусами.                          |
| 39  | **ServerSettingsResetModal**                      | [ServerSettingsResetModal.tsx](file:///c:/FCC/client/src/components/panel/ServerSettingsResetModal.tsx)                 | Сброс настроек сервера                       |   **Новый**    | Иконка сброса, карточка предупреждения `fcc-confirm-modal__callout--danger`.                     |
| 40  | **CreateSaveModal**                               | [CreateSaveModal.tsx](file:///c:/FCC/client/src/components/panel/CreateSaveModal.tsx)                                   | Генератор мира / Новая игра                  |   **Новый**    | Интерактивное полотно генерации Factorio (превью, планеты, ползунки).                            |
| 41  | **ModPortalPreviewPane Lightbox**                 | [ModPortalPreviewPane.tsx](file:///c:/FCC/client/src/components/panel/ModPortalPreviewPane.tsx)                         | Просмотр скриншотов модов                    |   **Новый**    | Полноэкранный темный lightbox с плавающим контролом закрытия.                                    |
| 42  | **AboutModal**                                    | [AboutModal.tsx](file:///c:/FCC/client/src/components/modals/AboutModal.tsx)                                            | О программе Factorio Control Center          |   **Новый**    | `about-modal.css`, современная шапка с иконкой, Hero-блок, сетка карточек статистики и лицензий. |
| 43  | **UserSettingsModal**                             | [UserSettingsModal.tsx](file:///c:/FCC/client/src/components/modals/UserSettingsModal.tsx)                              | Персональные настройки пользователя          | **Устаревший** | Старая шапка, обилие inline styles (`style={{ padding: ..., background: ... }}`).                |
| 44  | **TwoFactorSetupModal**                           | [TwoFactorSetupModal.tsx](file:///c:/FCC/client/src/components/modals/TwoFactorSetupModal.tsx)                          | Подключение двухфакторной защиты             | **Устаревший** | Сплошные inline styles, старая шапка без плашки, плоский макет.                                  |
| 45  | **TwoFactorDisableModal**                         | [TwoFactorDisableModal.tsx](file:///c:/FCC/client/src/components/modals/TwoFactorDisableModal.tsx)                      | Отключение двухфакторной защиты              | **Устаревший** | Старая шапка, жесткие размеры инпутов через inline styles.                                       |
| 46  | **InstancePathBrowserModal**                      | [InstancePathBrowserModal.tsx](file:///c:/FCC/client/src/components/instances/InstancePathBrowserModal.tsx)             | Обзор дисков и папок сервера                 | **Устаревший** | Старый `fu-modal__header` без иконки, плоский список каталогов.                                  |
| 47  | **ModJobModal**                                   | [ModJobModal.tsx](file:///c:/FCC/client/src/components/panel/ModJobModal.tsx)                                           | Фоновый прогресс операций с модами           | **Устаревший** | Шапка старого образца `server-update-dialog__header` (не переведена на `header-icon-wrap`).      |
| 48  | **CreateSaveNameModal**                           | [CreateSaveNameModal.tsx](file:///c:/FCC/client/src/components/panel/CreateSaveNameModal.tsx)                           | Ввод имени создаваемого сохранения           | **Устаревший** | Простой текст в шапке, старый прогресс `.fu-progress`, инпут без карточки.                       |
| 49  | **QuickSaveNameModal**                            | [QuickSaveNameModal.tsx](file:///c:/FCC/client/src/components/panel/QuickSaveNameModal.tsx)                             | Имя быстрого сохранения                      | **Устаревший** | Полный аналог CreateSaveNameModal со старой шапкой и `.fu-progress`.                             |
| 50  | **ServerLogHistoryModal**                         | [ServerLogHistoryModal.tsx](file:///c:/FCC/client/src/components/panel/ServerLogHistoryModal.tsx)                       | Полная история логов сервера                 | **Устаревший** | Старый `fu-modal__header` без иконки, сырой контейнер лога, старый `.hint`.                      |
| 51  | **HistoryDetailModal**                            | [HistoryDetailView.tsx](file:///c:/FCC/client/src/components/panel/HistoryDetailView.tsx)                               | Детализация события в истории                | **Устаревший** | Старая шапка без иконки, сырые текстовые пары ключ-значение, сырой `<pre>`.                      |
| 52  | **MapExchangeModal**                              | [MapExchangeModal.tsx](file:///c:/FCC/client/src/components/panel/MapExchangeModal.tsx)                                 | Импорт/экспорт строки обмена картой          | **Устаревший** | Голый `fu-modal__header`, простая область `<textarea>` без карточки.                             |
| 53  | **serverSettingsUploadBackdrop**                  | [ServerSettingsTab.tsx](file:///c:/FCC/client/src/components/panel/ServerSettingsTab.tsx#L184)                          | Подтверждение перезаписи настроек            | **Устаревший** | Встроенный диалог на голом `fu-modal` (кандидат на замену `openFccConfirmModal`).                |
| 54  | **mapGenSavePresetBackdrop**                      | [MapGenCustomPanel.tsx](file:///c:/FCC/client/src/components/panel/MapGenCustomPanel.tsx#L1244)                         | Сохранение пользовательского пресета         | **Устаревший** | Голый заголовок без иконки, одиночный инпут без карточки.                                        |
| 55  | **mapGenPresetTransfer** (Import / Export)        | [MapGenCustomPanel.tsx](file:///c:/FCC/client/src/components/panel/MapGenCustomPanel.tsx#L1290)                         | Импорт и экспорт пресетов карты              | **Устаревший** | Голый заголовок без иконки, нативные чекбоксы в нестилизованном списке.                          |

---

## 4. Рекомендуемый план редизайна (по приоритету)

1. **Группа 1: Пользовательские настройки и аутентификация**
   - `UserSettingsModal`
   - `TwoFactorSetupModal`
   - `TwoFactorDisableModal`
   - _Задача_: перенести инлайн-стили в `user-settings-modal.css`, перевести шапки на стандарт `mod-install-dialog__header` с `header-icon-wrap`, оформить блоки 2FA и опций в карточки `--bg-card`.

2. **Группа 2: Фоновые операции и логирование**
   - `ModJobModal`
   - `ServerLogHistoryModal`
   - `HistoryDetailModal`
   - _Задача_: в `ModJobModal` заменить шапку на `mod-install-dialog__header` (как сделано в `FactorioUpdateModal`); в окнах истории и логов добавить иконки и карточки метаданных.

3. **Группа 3: Диалоги сохранений и ввода имен**
   - `CreateSaveNameModal`
   - `QuickSaveNameModal`
   - _Задача_: унифицировать с `.modpack-form-dialog`, убрать старый класс `.fu-progress`, заменить на современные спиннеры или индикаторы.

4. **Группа 4: Вспомогательные окна генерации карты и настроек**
   - Встроенный оверлей в `ServerSettingsTab.tsx` (заменить на вызов `openFccConfirmModal`)
   - `MapExchangeModal`
   - Встроенные модалки пресетов генерации карты в `MapGenCustomPanel.tsx`
   - `InstancePathBrowserModal`
