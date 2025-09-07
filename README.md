<p align="center">
  <img src="assets/logo.png" alt="nuke_modules logo" width="140" />
</p>

# nuke_modules

Scan, visualize, and safely delete heavy `node_modules` across your projects. Installable PWA that works offline.

## Highlights

- Fast scan with live size totals (pretty bytes)
- One-click select all, multi-select, and bulk delete
- Prepare projects for `pnpm` (sets `packageManager`, writes `.npmrc`, removes `package-lock.json`)
- Command palette (⌘/Ctrl + K) and search focus (/)
- Installable as a Progressive Web App (PWA) and usable offline

## Getting started
### Use the app

1) Click “Pick root” and choose the top-level folder that contains your projects.

2) Click “Scan” to discover `node_modules` folders and their sizes.

3) Select items and choose “Delete” or “Prepare pnpm”.

## PWA install (Add to Home Screen)

- On Chrome/Edge/Brave desktop: open the omnibox install icon or use the three-dot menu → Install nuke_modules.
- On Android Chrome: visit the site, open the menu → Add to Home screen.
- The app caches core assets and continues to work offline after first load.

## Keyboard shortcuts

- `/` Focus search
- `⌘/Ctrl + K` Open command palette
- `Esc` Close command palette

## How it works (permissions & safety)

- Uses the File System Access API to read sizes and delete folders you select.
- You explicitly grant access by picking a root folder; nothing outside that root is touched.
- Deletion only occurs for checked `node_modules` and is permission-gated by the browser.

## Browser support

- Best in Chromium-based browsers (Chrome, Edge, Brave) where the File System Access API is fully available.
- Other browsers may load the UI but won’t support scanning/deleting without the API.

## Development notes

- This project is static: `index.html`, `styles.css`, `app.js`, plus a `manifest.webmanifest` and `sw.js` for PWA.
- Service worker strategy: cache app shell on install; network-first for HTML, cache-first for static assets.

## Troubleshooting

- “Folder selection failed”: ensure you didn’t cancel the picker and that your browser allows file system access.
- “Some deletions failed”: you may lack permissions for certain subfolders; re-run with elevated access or check OS-level permissions.
- If updates don’t appear after deploying, refresh with “Empty cache and hard reload” to update the service worker.


