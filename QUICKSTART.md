# 🚀 Quick Start Guide

## Installation (5 minutes)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Build the Plugin
```bash
npm run build
```

This will generate:
- `code.js` - Plugin backend
- `ui.js` - UI frontend

### Step 3: Load in Figma
1. Open **Figma Desktop App**
2. Go to **Plugins** → **Development** → **Import plugin from manifest**
3. Navigate to this directory and select `manifest.json`
4. Done! The plugin is now loaded.

## Usage

### First Run
1. Open any Figma file with components
2. Select a **master component** (not an instance!)
3. Run **Plugins** → **Development** → **Component Usage Explorer**
4. Click **"Start Scan"**
5. View results in the tree view

### Features to Try

#### 🎯 Scan a Component
- Select any master component in Figma
- Plugin auto-detects it
- Choose scan scope (currently only "Current File" works)
- Click "Start Scan"

#### 📊 View Results
- Browse hierarchical tree grouped by files/pages
- Click any instance to jump to it in Figma
- View instance types (direct, nested, remote)
- See full path breadcrumbs

#### 📦 Export Data
- Switch to "Export" tab
- Choose format: JSON, CSV, or HTML
- Click export button
- File downloads automatically

## Development Mode

### Watch Mode (Auto-rebuild)
```bash
npm run watch
```

This runs TypeScript in watch mode for both:
- Plugin code (`tsconfig.json`)
- UI code (`tsconfig.ui.json`)

Any changes to `.ts` files will auto-compile to `.js`

### After Making Changes
1. Save your `.ts` file
2. In Figma, right-click plugin → **"Reload"** (or close/reopen)
3. Test your changes

## Common Issues

### "Cannot find name 'figma'" errors
✅ **Fixed after running `npm install`** - These are TypeScript lint errors that appear before installing `@figma/plugin-typings`

### "Cannot find name 'document'" errors in ui.ts
✅ **Normal** - UI uses different tsconfig with DOM lib. Will compile correctly.

### Plugin doesn't show up in Figma
- Make sure you're using **Figma Desktop App** (not browser)
- Check that `manifest.json` is in the root directory
- Try reimporting the plugin

### Scan button is disabled
- Make sure you've selected a **master component** (not an instance)
- Component must be in the current file
- Check console for errors

### "OAuth Required" message
✅ **Expected** - External file scanning requires OAuth setup (not yet implemented). Use "Current File" scope instead.

## File Structure Reference

```
📁 Component Usage Explorer/
│
├── 📄 manifest.json          # Plugin manifest
├── 📄 package.json           # NPM config
├── 📄 tsconfig.json          # TS config (plugin code)
├── 📄 tsconfig.ui.json       # TS config (UI code)
│
├── 📄 types.ts               # Shared interfaces
│
├── 📄 code.ts → code.js      # Plugin backend
├── 📄 scan-engine.ts         # Scanning logic
├── 📄 db.ts                  # Storage layer
├── 📄 exporter.ts            # Export formatters
│
├── 📄 ui.html                # UI markup + styles
└── 📄 ui.ts → ui.js          # UI controller
```

## Next Steps

### Try These Features
1. ✅ Scan a simple component with a few instances
2. ✅ Scan a component with nested instances
3. ✅ Export results as HTML and view the report
4. ✅ Jump to different instances using the tree view

### Advanced Usage
- Scan components with variants
- Track remote library components
- Compare scans over time (check scan history)
- Export to CSV for spreadsheet analysis

### Customize
- Modify UI colors in `ui.html` styles
- Adjust max stored scans in `db.ts`
- Add custom export formats in `exporter.ts`
- Extend instance classification in `scan-engine.ts`

## Need Help?

### Check the Logs
- Open Figma **Console** (Plugins → Development → Open Console)
- Check for error messages
- Look for scan progress logs

### Common Fixes
1. **Rebuild**: `npm run build`
2. **Reload Plugin**: Right-click plugin in Figma → Reload
3. **Restart Figma**: Close and reopen Figma Desktop
4. **Reinstall**: Delete `node_modules`, run `npm install` again

## Ready to Deploy?

See [README.md](./README.md) for full documentation including:
- Architecture details
- Performance optimization
- OAuth setup (future)
- Contributing guidelines
