[English](Docker-Setup) | [Русский](Docker-Setup-RU)

---

# Установка в Docker

<p align="center">
  <img src="https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/docs/images/docker_banner.svg" alt="FCC Docker Setup">
</p>

Установка и запуск Factorio Control Center (FCC) в контейнере через Docker Compose.

---

## Предварительные требования

- **Docker:** Docker Engine 20.10+ и Docker Compose v2+.
- Среда Node.js включена в состав образа контейнера и не требует установки на хост-систему.

---

## Варианты установки

### Вариант 1: Автоматический скрипт установки

Чтобы установить Docker (при отсутствии), загрузить `docker-compose.yml`, скачать контейнерный образ и запустить службу одной командой:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/install-docker.sh)"
```

После завершения выполнения откройте в браузере `http://127.0.0.1:8080/` (или `http://<IP_сервера>:8080/` при удаленном доступе).

### Вариант 2: Ручная настройка

1. Создайте каталог (например, `/opt/factorio-control-center`) и сохраните файл `docker-compose.yml`:

```yaml
services:
  factorio-control-center:
    image: ghcr.io/louisfahrenheit/factorio-control-center:latest
    container_name: factorio-control-center
    restart: unless-stopped
    ports:
      - "8080:8080"
      - "34197-34207:34197-34207/udp"
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
    environment:
      - NODE_ENV=production
      # Необязательное автоматическое создание учетной записи администратора:
      # - FCC_ADMIN_USER=admin
      # - FCC_ADMIN_PASSWORD=your_password
```

2. Запустите контейнер:
```bash
docker compose up -d
```

3. Откройте в браузере `http://127.0.0.1:8080/` (или `http://<IP_сервера>:8080/` при удаленном доступе).

---

## Настройка для Docker

### 1. Настройка автозапуска
Автозапуск контейнера регулируется директивой `restart: unless-stopped` в `docker-compose.yml`. Демон Docker автоматически запускает контейнер при старте операционной системы хоста.

### 2. Тома и сохранение данных
По умолчанию в файле конфигурации примонтированы два каталога:
- `./data` -> `/app/data` (базы данных, настройки и файлы серверов Factorio)
- `./logs` -> `/app/logs` (логи приложения)

> [!CAUTION]
> **Правило путей к серверам:**  
> При создании или добавлении сервера Factorio в веб-панели путь к нему обязательно должен находиться внутри структуры `/app/data` (например, `/app/data/servers/my_server`).  
> Если указать путь за пределами `/app/data` (например, `/opt/factorio` или `/home`), эти файлы останутся только во временном слое контейнера и будут удалены при его пересоздании или обновлении.

Если серверы хранятся на отдельном диске (например, `/mnt/ssd/servers`), добавьте соответствующий том в `docker-compose.yml`:
```yaml
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
      - /mnt/ssd/servers:/servers
```

### 3. Проброс портов
- **Веб-интерфейс:** порт `8080` (TCP).
- **Игровой трафик:** UDP-порты `34197-34207` обеспечивают запуск до 11 серверов одновременно. Для большего количества серверов расширьте диапазон в `docker-compose.yml`.
- На Linux также можно использовать прямой доступ к сетевому интерфейсу через `network_mode: host`.

### 4. Автоматическое создание администратора
Для автоматической инициализации без использования веб-мастера в браузере раскомментируйте переменные в `docker-compose.yml`:
```yaml
    environment:
      - FCC_ADMIN_USER=admin
      - FCC_ADMIN_PASSWORD=your_secure_password
```

---

## Обновление панели в Docker

Для обновления образа до актуальной версии с сохранением данных:

```bash
cd /opt/factorio-control-center
docker compose pull
docker compose up -d
```

---

## Следующие шаги

Для настройки сетевых параметров, токенов безопасности и авторизации на портале Factorio перейдите к разделу **[Общие настройки](General-Configuration-RU)**.
