# Datalization

Datalization is an Obsidian plugin that turns date-named daily notes into a visual monthly dashboard.

Each day card shows the note's `mood` as a large number on a red-to-yellow-to-green background and `hours slept` in the lower panel. A red dot appears when `High fluctuation` is true; a blue dot appears when `Pill taken` is true. Daily expenses appear in the card tooltip and are totaled in the monthly summary.

## Daily note format

Daily notes can live anywhere in the vault, but their filename must use `YYYY-MM-DD.md`.

```yaml
---
mood: 6
hours slept: 3
expenses: 60
Pill taken: true
High fluctuation: false
---
```

The property names are case-sensitive. Other frontmatter and note content are ignored.

## Use

1. Enable **Datalization** in Obsidian's Community plugins settings.
2. Select the calendar icon in the ribbon, or run **Datalization: Open monthly dashboard** from the command palette.
3. Use the arrow controls to move between months. Select a populated day card to open its daily note.

The dashboard updates when matching daily notes are created, deleted, renamed, or their metadata changes.

## Build

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into `<vault>/.obsidian/plugins/datalization/`, then reload Obsidian.

## License

MIT

