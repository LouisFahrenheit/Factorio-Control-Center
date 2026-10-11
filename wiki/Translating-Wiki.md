[English](Translating-Wiki) | [Русский](Translating-Wiki-RU)

---

# Contributing Translations to the Wiki

This repository supports multilingual documentation in the GitHub Wiki. Anyone can add new language translations, add new pages, or update existing ones. Thank you for your contribution to the project!

> [!NOTE]
> Looking to translate the web panel interface itself? See [Translating the App UI](Translating-App).


---

## File Naming Convention

Wiki pages use suffix-based naming for language versions:

- **English (Base language):** `<Page-Name>.md` (for example, `Installation-Guide.md`)
- **Russian:** `<Page-Name>-RU.md` (for example, `Installation-Guide-RU.md`)
- **Other Languages:** `<Page-Name>-<LANG>.md` using uppercase 2-letter ISO 639-1 language codes:
  - German: `Installation-Guide-DE.md`
  - French: `Installation-Guide-FR.md`
  - Spanish: `Installation-Guide-ES.md`
  - Chinese: `Installation-Guide-ZH.md`

---

## Page Structure

Every translated page must follow this structure:

1. **Language Bar:** Add language switcher links at the top:
   ```markdown
   [English](Page-Name) | [Русский](Page-Name-RU) | [Deutsch](Page-Name-DE)

   ---
   ```
2. **Page Content:** Translate the markdown content accurately following the original article structure.
3. **Sidebar Entry:** Add your page link to [`_Sidebar.md`](_Sidebar) under the corresponding language section.
4. **Home Entry:** Add a link to your language landing page in [`Home.md`](Home).

---

## How to Submit Changes

1. Fork the repository: [Factorio-Control-Center](https://github.com/LouisFahrenheit/Factorio-Control-Center).
2. Create or edit files in the `wiki/` directory.
3. Open a Pull Request against the `main` branch.
4. Once merged, GitHub Actions automatically deploys the updated markdown files to the GitHub Wiki.
