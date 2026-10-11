[English](Translating-App) | [Русский](Translating-App-RU)

---

# Translating Factorio Control Center (App UI)

If you would like to help translate the panel interface, command presets, or fix existing translations, this guide explains how the locale system works. Thank you for your contribution to the project!

> [!NOTE]
> Looking to translate the documentation instead? See [Contributing Translations to the Wiki](Translating-Wiki).

---

## Language Status

Translations live in `locale/server_lang_*.json` and appear in **User settings → Language**.  
English is the reference; every other file must have **exactly the same keys**.

| Code | Language | UI file | Commands file | Status |
| :--- | :--- | :--- | :--- | :--- |
| `en` | English | `server_lang_en.json` | `server_commands_en.json` | Reference - do not translate |
| `ru` | Russian | `server_lang_ru.json` | `server_commands_ru.json` | Complete - shipped |

For **`de`, `fr`, `es`, `ja`, `zh`, `pl`, `pt-br`, `uk`, `ko`, `it`, `cs`, `tr`, `nl`**: add `locale/server_lang_XX.json` and translate. The language menu already has display names for these codes without any code changes required.

If your language is not listed, open an issue or PR to request a picker label (`lang_name_*`).

---

## Adding a New UI Language

1. Copy the reference file:
   ```text
   locale/server_lang_en.json  →  locale/server_lang_XX.json
   ```

2. Translate **values only** — keep every **key** identical to English.

3. Verify locally:
   ```bash
   npm run locale:check
   ```

4. Check in the panel: **User settings → Language**.

5. Open a Pull Request, or send the finished `server_lang_XX.json` to the maintainer directly.

---

## Command Catalog (Optional)

The **Commands** tab provides built-in RCON command templates (names and descriptions).  
The panel merges `server_commands.json` with `server_commands_<code>.json` for the active UI language. Missing command files fall back to English labels.

### Translating Command Text

1. Copy `server_commands_en.json` → `server_commands_XX.json`.
2. Translate **values** in `categories` and `commands` — keep every **key** identical.
3. Do not edit RCON templates in `server_commands.json` unless you are changing the commands themselves.

### Adding a New Preset Command

You can propose new built-in RCON presets:

1. Open **Commands** → **Command Editor** in the panel.
2. Create the command, set parameters, and test it on your server.
3. Contribute the working files via Pull Request.

---

## Key Naming Conventions

| Prefix / Pattern | Used For |
| :--- | :--- |
| `web_*` | Login, access, web panel |
| `instances_*` | Server instance list and wizard |
| `saves_manager_*` | Save files |
| `modpack_*`, `mods_*` | Mods and modpacks |
| `map_gen_*` | Map generator |
| `players_*`, `history_*` | Players and history tabs |
| `server_settings_*` | `server-settings.json` editor |
| `maintenance_*` | Scheduled maintenance |
| `api_error_*` | Generic API error codes |
| `web_error_*` | Network and panel connectivity errors |

**Placeholders:** keep the same style as in English:
- `{0}`, `{1}`, … — Indexed args (UI strings)
- `{}` — Sequential args (server and log strings)

---

## Tooling

| Command | Purpose |
| :--- | :--- |
| `npm run locale:check` | Fails if any `server_lang_*.json` has keys missing or extra compared to English |
| `npm run locale:check:unused` | Fails if locale keys appear unused in code |

---

## Tips for Translators

- Keep UI labels concise — many appear in compact tables and buttons.
- Preserve `\n` line breaks where present; they are intentional in dialogs and error popups.
- Do not translate product names: **Factorio**, **FCC**, **RCON**, **Space Age**, or file extensions (`.fcc`).
- Quoted game or mod names in messages stay as `{0}` placeholders.
- After editing locale files, run `npm run locale:check` and verify via **User settings → Language**.
