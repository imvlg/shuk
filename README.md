# Shuk

Shuk is a small client-side search engine and research notebook.

Hosted on GitHub Pages: (https://imvlg.github.io/shuk/)

## Features

- **Search:** Wikipedia articles, Wikidata facts (dates, population, coordinates), in-app article reader.
- **Calculations & Tools:** Math parser, unit converter, currency rates (NBU, market), Open-Meteo weather, city timezones, date calculator.
- **Dev Utilities:** Unix timestamp, CIDR calculator, HEX/RGB converter, Base64, SHA-256, UUID, password generator.
- **Catalogs:** Search Wikimedia Commons, Open Library, arXiv, Crossref, OpenStreetMap.
- **Notebook:** Local Markdown editor, `#tags`, `[[wikilinks]]`, task lists, slash commands (`/`), in-text fact search (`Ctrl+Shift+F`).
- **Export:** `.md`, `.docx`, `.html`, `.zip` (Obsidian-compatible backup).

## Architecture

- **Stack:** Vanilla JavaScript, HTML5, CSS3.
- **Storage:** Browser localStorage (client-side only, no external servers).
- **APIs:** Public open APIs (Wikimedia, Wikidata, Open-Meteo, Nominatim, Crossref, Open Library). No API keys required.
