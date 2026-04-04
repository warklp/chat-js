# Electron Desktop App

This directory contains the Electron wrapper for your ChatJS app.

## Development

Make sure the Next.js web app is running first (`bun run dev` in the parent directory), then:

```bash
bun install
bun run dev
```

`bun run dev` points Electron at `http://localhost:3000` by default. You can override
that during development with `ELECTRON_APP_URL=... bun run dev`.

## Customization

### App Icon

Replace `icon.png` with your own 512×512 PNG. Then regenerate the platform icons:

```bash
bun run generate-icons
```

This produces `build/icon.png` and `build/icon.icns` (macOS) used by Electron and the installer.

### App Name & ID

Edit `electron-builder.yml`:

- `productName` — display name shown in the OS
- `appId` — reverse-DNS bundle identifier (e.g. `com.yourcompany.yourapp`)

### Protocol Scheme (Deep Links)

The `APP_SCHEME` in `src/config.ts` controls the custom URL scheme used for OAuth deep links (e.g. `yourapp://`). It must match the `schemes` entries in `electron-builder.yml`.

### Production URL

Update `appUrl` in `apps/chat/chat.config.ts` for your deployed site. Packaged Electron
builds use that URL by default, while development uses `http://localhost:3000` unless
`ELECTRON_APP_URL` is set.

## Building for Distribution

```bash
bun run dist:mac   # macOS .dmg
bun run dist:win   # Windows installer
bun run dist:linux # Linux AppImage
```
