[English](Development) | [Русский](Development-RU)

---

# Разработка

<p align="center">
  <img src="https://raw.githubusercontent.com/LouisFahrenheit/Factorio-Control-Center/main/docs/images/development_banner.svg" alt="FCC Development">
</p>

Инструкции по запуску проекта для разработки, тестированию и сборке релизов.

---

## Требования

- [Node.js 24](https://nodejs.org/)
- Git
- Инструменты сборки C++ (нужны для компиляции `better-sqlite3`):
  - **Windows:** Visual Studio Build Tools (с рабочей нагрузкой «Разработка классических приложений на C++») или Visual Studio Community
  - **Linux:** `build-essential` (`gcc`, `g++`, `make`) и `python3`


---

## Структура проекта

- `src/` — бэкенд (NestJS, TypeORM, SQLite, WebSockets)
- `client/` — фронтенд (React, Vite)
- `locale/` — файлы локализации (`server_lang_*.json`, `server_commands_*.json`)
- `scripts/` — скрипты сборки релизов и установки служб
- `wiki/` — исходники документации для GitHub Wiki

---

## Запуск для разработки

Самый простой способ — интерактивное меню разработки:

- **Windows:** запустите **`StartDEV.bat`**
- **Linux:** запустите **`./StartDEV.sh`**

Меню умеет само устанавливать зависимости, запускать серверы, тесты и собирать релизы.

### Запуск вручную через консоль

1. Клонируйте репозиторий и установите зависимости:
   ```bash
   git clone https://github.com/LouisFahrenheit/Factorio-Control-Center.git
   cd Factorio-Control-Center
   npm install && npm install --prefix client
   ```

2. Запустите бэкенд и фронтенд в двух терминалах:
   ```bash
   # Терминал 1: API (порт 8080, автоперезапуск при изменении кода)
   npm run start:dev

   # Терминал 2: UI (Vite dev-сервер на http://127.0.0.1:5173 с HMR)
   npm run client:dev
   ```

3. Откройте `http://127.0.0.1:5173` в браузере. Все запросы к API и WebSocket Vite автоматически проксирует на порт 8080.

---

## Документация API (Swagger)

У панели есть встроенный интерактивный Swagger UI.

1. В файле `.env` укажите:
   ```env
   SWAGGER_ENABLED=true
   ```
2. Откройте `http://127.0.0.1:8080/api/docs`.
3. Для отправки защищённых запросов авторизуйтесь через форму логина в панели или передайте `API_TOKEN` из `.env`.

---

## Тесты и проверка кода

```bash
# Запуск тестов
npm test            # тесты бэкенда
npm run client:test # тесты фронтенда
npm run test:all    # запуск всех тестов сразу

# Линтер и форматирование
npm run lint:check  # проверка бэкенда через ESLint
npm run client:lint # проверка фронтенда
npm run lint        # автоисправление ошибок линтера
npm run format      # форматирование кода через Prettier

# Проверка файлов переводов
npm run locale:check
```

---

## Сборка

### Сборка проекта

```bash
# Сборка бэкенда и фронтенда
npm run build:all

# Запуск собранной версии
npm run start:prod
```

### Сборка релизных архивов

Скрипт собирает готовый архив с панелью в папку `release/`:

```bash
npm run pack:release
```

- На Windows: `release/factorio-control-center-win.zip`
- На Linux: `release/factorio-control-center-linux.tar.gz`

*(Примечание: для сборки Linux-архива с нативными модулями из Windows запустите команду внутри WSL или Docker-контейнера).*

### Сборка своего Docker-образа

Если вы изменили код и хотите собрать свой образ:

1. В `docker-compose.yml` укажите `build: .` вместо `image:`
2. Запустите сборку:
   ```bash
   docker compose up -d --build
   ```
