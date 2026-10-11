[English](Standalone-Setup) | [Русский](Standalone-Setup-RU)

---

# Обычная установка (Standalone)

<p align="center">
  <img src="https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/docs/images/install_banner.svg" alt="FCC Standalone Setup">
</p>

Установка и запуск Factorio Control Center (FCC) напрямую на Windows и Linux (без Docker).

<p align="center">
  <a href="https://github.com/LouisFahrenheit/Factorio-Control-Center/releases/latest/download/factorio-control-center-win.zip"><img src="https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/docs/images/download_windows.svg" height="60" alt="Скачать для Windows"></a>
  &nbsp;&nbsp;
  <a href="https://github.com/LouisFahrenheit/Factorio-Control-Center/releases/latest/download/factorio-control-center-linux.tar.gz"><img src="https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/docs/images/download_linux.svg" height="60" alt="Скачать для Linux"></a>
</p>

---

## Предварительные требования

- **Операционная система:**
  - Windows 10, 11 или Windows Server 2016+
  - Linux с поддержкой `systemd` (Ubuntu 20.04+, Debian 11+, CentOS/RHEL 8+)
- **Среда выполнения:**
  - [Node.js 24](https://nodejs.org/)

---

## Установка на Windows

1. Откройте страницу [Releases](https://github.com/LouisFahrenheit/Factorio-Control-Center/releases) или нажмите кнопку выше для загрузки `factorio-control-center-win.zip`.
2. Распакуйте архив в постоянный каталог (например, `C:\FactorioControlCenter`).
3. Запустите файл **`Start.bat`**.
4. В текстовом меню:
   - Выберите пункт **`1. Start panel`**.
5. Откройте браузер по адресу `http://127.0.0.1:8080/` (или `http://<IP_сервера>:8080/` при удаленном доступе).
6. Завершите шаги мастера настройки для создания учетной записи администратора.

---

## Установка на Linux

### Вариант 1: Автоматический скрипт установки

Выполните команду в терминале:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/install.sh)"
```

Скрипт проверяет зависимости, скачивает актуальный релиз, распаковывает файлы в `/opt/factorio-control-center` и открывает стартовое меню.

### Вариант 2: Ручная установка

1. Скачайте архив релиза кнопкой выше или через wget:
   ```bash
   cd /opt
   sudo wget https://github.com/LouisFahrenheit/Factorio-Control-Center/releases/latest/download/factorio-control-center-linux.tar.gz
   ```
2. Распакуйте архив:
   ```bash
   sudo tar -xzf factorio-control-center-linux.tar.gz
   cd /opt/factorio-control-center
   ```
3. Сделайте скрипт исполняемым и запустите его:
   ```bash
   sudo chmod +x Start.sh
   sudo ./Start.sh
   ```
4. Выберите пункт **`1. Start panel`**.
5. Откройте браузер по адресу `http://127.0.0.1:8080/` (или `http://<IP_сервера>:8080/` при удаленном доступе).

---

## Настройка автозапуска (Системные службы)

Для работы панели в фоновом режиме и автоматического старта при загрузке системы:

### Служба Windows
1. Запустите **`Start.bat`** от имени администратора.
2. Выберите пункт меню **`3. Install service`**.
3. Управление службой выполняется прямо в меню **`Start.bat`**:
   - **`5. Start service`** — запуск службы;
   - **`6. Stop service`** — остановка службы;
   - **`4. Remove service`** — удаление службы.

### Служба Linux systemd
1. Запустите `./Start.sh` и выберите **`3. Install service`**.
   - При запуске от `root`: служба регистрируется как общесистемная в `/etc/systemd/system/factorio-control-center.service`.
   - При запуске от обычного пользователя: служба регистрируется как пользовательская в `~/.config/systemd/user/factorio-control-center.service`.
2. Управление службой доступно через меню **`Start.sh`**:
   - **`5. Start service`** — запуск службы;
   - **`6. Stop service`** — остановка службы;
   - **`4. Remove service`** — удаление службы.
   Либо стандартными командами `systemctl`:
   - Для системной службы: `sudo systemctl [start|stop|restart|status] factorio-control-center`
   - Для пользовательской службы: `systemctl --user [start|stop|restart|status] factorio-control-center`
3. **Включение lingering для пользователя:** если служба установлена от обычного пользователя, включите lingering, чтобы процессы не останавливались после закрытия SSH-сессии:
   ```bash
   sudo loginctl enable-linger $USER
   ```

---

## Обновление панели

> [!NOTE]
> Все пользовательские настройки, база данных и файлы серверов в `data/` и `logs/` сохраняются при обновлении.

### Способ 1: Стартовое меню (Windows и Linux)
Запустите **`Start.bat`** или **`./Start.sh`** и выберите пункт:
- **`7. Update panel`**

### Способ 2: Терминал (Linux)
```bash
cd /opt/factorio-control-center
sudo ./scripts/update-panel.sh
```

---

## Следующие шаги

Для настройки портов, брандмауэра и токенов безопасности перейдите к разделу **[Общие настройки](General-Configuration-RU)**.
