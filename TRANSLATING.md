# Translating Factorio Control Center

If you can help - a full translation, a few fixed lines, or corrections to what's already there - I'd be truly grateful. Thank you.
The factory must grow.

---

## Language status

Translations live in `locale/server_lang_*.json` and appear in **User settings → Language**.  
English is the reference; every other file must have **exactly the same keys**.

| Code | Language | UI file | Commands file | Status |
|------|----------|---------|---------------|--------|
| `en` | English | `server_lang_en.json` | `server_commands_en.json` | Reference - do not translate |
| `ru` | Russian | `server_lang_ru.json` | `server_commands_ru.json` | **Complete** - shipped |

For **`de`, `fr`, `es`, `ja`, `zh`, `pl`, `pt-br`, `uk`, `ko`, `it`, `cs`, `tr`, `nl`**: add `locale/server_lang_XX.json` and translate - that's all. The language menu already has names for these codes. **No code changes.**

Your language not listed? Open an issue or PR to request a picker label (`lang_name_*`).

---

## Add a new UI language

1. Copy the reference file:

   ```text
   locale/server_lang_en.json  →  locale/server_lang_XX.json
   ```

2. Translate **values only** - keep every **key** identical to English.

3. Verify locally:

   ```bash
   npm run locale:check
   ```

4. Smoke-test in the panel: **User settings → Language**.

5. Open a pull request, or send the finished `server_lang_XX.json` to the maintainer directly.
---

## Command catalog (optional)

The **Commands** tab ships built-in RCON command templates (names and descriptions).  
The panel merges `server_commands.json` with `server_commands_<code>.json` for the active UI language. Missing command files → English labels.

### Translate command text

1. Copy `server_commands_en.json` → `server_commands_XX.json`.
2. Translate **values** in `categories` and `commands` - keep every **key** (category id, command id) identical.
3. Do **not** edit RCON templates in `server_commands.json` unless you are changing the commands themselves.

### Add a new preset command

You can propose new built-in RCON presets (not only translations).

**Command Editor**

1. Open **Commands** → **Command Editor**.
2. Create the command, set parameters, and test it on your server.
3. Contribute the working files via pull request (or send it to the maintainer).

**Manual (JSON)**

1. In `server_commands.json`, add an entry under the right category (`player`, `game`, `items`, `enemies`, `map`):

   ```json
   {
     "id": "my_command",
     "command": "/c game.players[\"{player}\"].force.manual_mining_speed_modifier={value}",
     "has_player": true,
     "has_value": true,
     "default_value": "100"
   }
   ```

   - `id` - unique snake_case key
   - `command` - RCON template; placeholders: `{player}`, `{value}`, `{boolean}`, `{item}`, `{count}`, `{quality}`
   - flags - only what the UI needs: `has_player`, `has_value`, `has_boolean`, `has_item`, `has_count`, `has_quality`; optional `default_value` (and `items` map for item pickers)

2. In `server_commands_en.json`, add `name` and `description` under `commands` for that same `id` (required). Other `server_commands_XX.json` files are optional - missing locales fall back to English.

3. Open a pull request, or send the files to the maintainer, with a short note on what the command does and when admins would use it.

---

## Key naming conventions

| Prefix / pattern | Used for |
|------------------|----------|
| `web_*` | Login, access, web panel |
| `instances_*` | Server instance list and wizard |
| `saves_manager_*` | Save files |
| `modpack_*`, `mods_*` | Mods and modpacks |
| `map_gen_*` | Map generator |
| `players_*`, `history_*` | Players and history tabs |
| `server_settings_*` | `server-settings.json` editor |
| `maintenance_*` | Scheduled maintenance |
| `api_error_*` | Generic API error codes |
| `web_error_*` | Network / panel connectivity errors |

**Placeholders** - keep the same style as in English; do not convert between them.

| Syntax | Usage |
|--------|-------|
| `{0}`, `{1}`, … | Indexed args (UI): `t('key', a, b)` → `{0}` = a, `{1}` = b |
| `{}` | Sequential args (mostly server/log strings): first `{}` gets the first arg, next `{}` the second, and so on |

---

## Tooling

| Command | Purpose |
|---------|---------|
| `npm run locale:check` | Fail if any `server_lang_*.json` has keys missing/extra vs English (CI) |
| `npm run locale:check:unused` | Fail if locale keys appear unused in code (CI; heuristic) |

---

## Tips for translators

- Keep UI labels concise - many appear in narrow table columns.
- Preserve `\n` line breaks where present; they are intentional in dialogs and errors.
- Do **not** translate product names: **Factorio**, **FCC**, **RCON**, **Space Age**, file extensions (`.fcc`).
- Quoted game/mod names in messages stay as `{0}` placeholders.
- After editing locale JSON, run `npm run locale:check` and smoke-test via **User settings → Language**.
