[English](General-Configuration) | [Русский](General-Configuration-RU)

---

# Общие настройки

<p align="center">
  <img src="https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/docs/images/configuration_banner.svg" alt="FCC Configuration">
</p>

Справочник настроек Factorio Control Center (FCC): переменные окружения, сетевые порты, фаервол и токены безопасности.

---

## Приоритет применения настроек

1. **Переменные окружения (`.env` или переменные контейнера):**
   - Имеют высший приоритет, переопределяют значения из базы данных и блокируют их редактирование через веб-интерфейс.
   - Для применения изменений требуется перезапуск приложения.
2. **Настройки в базе данных (веб-интерфейс):**
   - Настраиваются непосредственно через раздел **Настройки** в веб-панели без перезапуска сервера.

---

## Справочник переменных `.env`

| Переменная | По умолчанию | Описание |
| :--- | :--- | :--- |
| `HOST` | `0.0.0.0` | Сетевой интерфейс для прослушивания веб-сервером. |
| `PORT` | `8080` | Порт веб-интерфейса. |
| `PUBLIC_HOST` | _Пусто_ | Внешний домен или IP для ссылок при работе за прокси. |
| `PUBLIC_PORT` | _Пусто_ | Внешний порт, если он отличается от `PORT`. |
| `API_TOKEN` | _Случайный_ | Токен доступа к REST API через `Authorization: Bearer <API_TOKEN>`. |
| `APP_SECRET` | _Авто_ | 64-символьный ключ шифрования для защиты данных в базе. |
| `FCC_ADMIN_USER` | _Пусто_ | Логин администратора для создания при первом запуске. |
| `FCC_ADMIN_PASSWORD` | _Пусто_ | Пароль администратора для создания при первом запуске. |
| `TLS_ENABLED` | `false` | Включение встроенного HTTPS-сервера (`true`/`false`). |
| `TLS_CERTFILE` | _Пусто_ | Путь к файлу сертификата SSL (`.crt` или `.pem`). |
| `TLS_KEYFILE` | _Пусто_ | Путь к файлу закрытого ключа SSL (`.key`). |
| `TLS_KEY_PASSWORD` | _Пусто_ | Пароль закрытого ключа (при наличии). |
| `TELEGRAM_BOT_TOKEN` | _Пусто_ | Токен Telegram-бота от `@BotFather` для оповещений. |
| `TELEGRAM_CHAT_ID` | _Пусто_ | ID чата Telegram для отправки уведомлений. |
| `DEBUG_LOGS` | `false` | Включение подробных логов приложения. |
| `SWAGGER_ENABLED` | `false` | Включение интерактивного Swagger UI по адресу `/api/docs`. |

---

## Учетная запись Factorio

Для автоматической загрузки бинарных файлов сервера и модов с `mods.factorio.com`:

1. Войдите в профиль на [factorio.com/profile](https://factorio.com/profile).
2. Скопируйте **Username** и **Token**.
3. В веб-панели откройте **Настройки -> Глобальные настройки**.
4. Заполните поля **Глобальный логин Factorio** и **Глобальный токен Factorio**, затем нажмите **Сохранить**.

Указанный токен действует для всех серверов, управляемых панелью.

---

## Сеть и брандмауэр

### Сводка портов
| Порт | Протокол | Назначение |
| :--- | :--- | :--- |
| `8080` | TCP | Веб-интерфейс панели (HTTP) |
| `8443` | TCP | Веб-интерфейс панели (HTTPS при включенном TLS) |
| `34197` | UDP | Порт по умолчанию для первого инстанса Factorio |
| `34198-34207` | UDP | Порты по умолчанию для дополнительных инстансов |

### Правила брандмауэра
- **Linux (UFW):**
  ```bash
  sudo ufw allow 8080/tcp
  sudo ufw allow 34197:34207/udp
  ```
- **Windows (PowerShell):**
  ```powershell
  New-NetFirewallRule -DisplayName "Factorio Dedicated Servers" -Direction Inbound -LocalPort 34197-34207 -Protocol UDP -Action Allow
  New-NetFirewallRule -DisplayName "Factorio Control Center Panel" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow
  ```

---

## Безопасность и ограничение попыток входа

Параметры защиты от перебора паролей:

| Переменная | По умолчанию | Описание |
| :--- | :--- | :--- |
| `AUTH_MAX_FAILED_ATTEMPTS` | `5` | Допустимое число неудачных попыток до блокировки. |
| `AUTH_LOCKOUT_MINUTES` | `10` | Длительность блокировки в минутах. |
| `AUTH_ATTEMPT_WINDOW_MINUTES` | `10` | Окно накопления попыток в минутах. |

---

## Фиксация интерфейса

Язык и тему можно зафиксировать для всех пользователей через `.env`:

```env
# Значения: 'en', 'ru'
PANEL_LANGUAGE=ru

# Значения: 'fcc_classic', 'dark_space', 'vulcanus', 'ion_storm', 'cryogenics'
PANEL_THEME=fcc_classic
```
