# 📦 Installation Instructions for Figma

## Quick Install (3 Steps)

Your plugin is **ready to use**! Follow these steps to load it into Figma:

### Step 1: Locate the Plugin Folder
The plugin is located at:
```
/Users/lisandroalvo/Desktop/Figma Plugin COmponent/
```

### Step 2: Open Figma Desktop App
**Important**: This plugin only works in the **Figma Desktop App**, not in the browser version.

1. Open **Figma Desktop App**
2. Open any Figma file (or create a new one)

### Step 3: Import the Plugin
1. In Figma, go to the menu:
   - **Plugins** → **Development** → **Import plugin from manifest...**
   
2. In the file picker, navigate to:
   ```
   /Users/lisandroalvo/Desktop/Figma Plugin COmponent/
   ```

3. Select the file: **`manifest.json`**

4. Click **"Open"**

5. ✅ Done! The plugin is now installed.

---

## Running the Plugin

### First Time Use

1. **Create or open a Figma file** with some components
2. **Select a master component** (not an instance!)
3. Open the plugin:
   - **Plugins** → **Development** → **Component Usage Explorer**
4. The plugin UI will open
5. Click **"Start Scan"**
6. View results!

---

## What the Plugin Does

### 🎯 Scan Mode Tab
- **Select a Component**: Pick any master component in your Figma file
- **Choose Scope**: Currently supports "Current File" (other scopes need OAuth)
- **Start Scan**: Finds ALL instances of that component
- **Progress Log**: Real-time updates as it scans

### 📊 Usage Results Tab
- **Hierarchical Tree**: See all instances grouped by files and pages
- **Instance Types**: Direct, Nested, or Remote
- **Jump to Node**: Click any instance to navigate to it in Figma
- **Statistics**: Total counts and breakdowns

### 📦 Export Tab
- **JSON Export**: Full structured data
- **CSV Export**: Import into Excel/Sheets
- **HTML Export**: Beautiful standalone report

---

## Testing the Plugin

### Quick Test
1. **Create a test component**:
   - Draw a rectangle in Figma
   - Select it and click "Create Component" (Cmd+Option+K)
   - Name it "Test Button"

2. **Create some instances**:
   - Copy the component several times
   - Place them in different frames/pages
   - Nest some inside other components

3. **Run the scan**:
   - Select the original "Test Button" component
   - Open the plugin
   - Click "Start Scan"
   - See all your instances appear!

---

## Troubleshooting

### Plugin doesn't appear in menu
- ✅ Make sure you're using **Figma Desktop** (not browser)
- ✅ Check you imported `manifest.json` from the correct folder
- ✅ Try restarting Figma

### "Cannot find plugin" error
- ✅ Ensure all files are in place (check folder contents)
- ✅ Reimport the plugin (repeat Step 3 above)

### Scan button is disabled
- ✅ Select a **master component** (the original, not a copy)
- ✅ Don't select an instance (the purple icon ones)
- ✅ The component must be in the current file

### "OAuth Required" message
- ✅ This is **expected** for external file scanning
- ✅ Use "Current File" scope instead (works without OAuth)
- ✅ External file scanning is a future enhancement

### Build errors
If you modify the code and get errors:
```bash
cd "/Users/lisandroalvo/Desktop/Figma Plugin COmponent"
npm run build
```

---

## Development Mode

### Making Changes
1. Edit any `.ts` file
2. Run build: `npm run build`
3. In Figma, right-click the plugin → **"Reload"**
4. Test your changes

### Watch Mode (Auto-rebuild)
```bash
npm run watch
```
Now any changes to `.ts` files automatically recompile!

---

## File Structure

```
📁 Figma Plugin COmponent/
├── 📄 manifest.json          ← Plugin config (you selected this)
├── 📄 code.js                ← Built plugin backend
├── 📄 ui.html                ← UI interface
├── 📄 ui.js                  ← Built UI logic
│
├── 📂 Source Files (.ts):
│   ├── code.ts               ← Plugin controller
│   ├── ui.ts                 ← UI controller
│   ├── scan-engine.ts        ← Scanning logic
│   ├── db.ts                 ← Storage management
│   ├── exporter.ts           ← Export functions
│   └── types.ts              ← TypeScript types
│
├── 📂 Documentation:
│   ├── README.md             ← Full documentation
│   ├── QUICKSTART.md         ← Quick start guide
│   └── example-scan-result.json ← Sample output
│
└── 📂 Config:
    ├── package.json          ← NPM dependencies
    ├── tsconfig.json         ← TypeScript config
    └── tsconfig.ui.json      ← UI TypeScript config
```

---

## What's Next?

### Try These Features:
- ✅ Scan different component types
- ✅ Export results as HTML (beautiful reports!)
- ✅ Jump to instances across different pages
- ✅ Track nested component usage

### Future Enhancements:
- 🔮 External file scanning (requires OAuth)
- 🔮 Batch scanning multiple components
- 🔮 Component dependency graphs
- 🔮 Change tracking over time

---

## Need Help?

### Documentation
- **Quick Start**: See `QUICKSTART.md`
- **Full Guide**: See `README.md`
- **Example Output**: See `example-scan-result.json`

### Support
- Check Figma Console for errors: **Plugins → Development → Open Console**
- Verify build succeeded: Look for `code.js` and `ui.js` files
- Try rebuilding: `npm run build`

---

## 🎉 You're All Set!

Your plugin is ready to use. Start by:
1. Opening a Figma file
2. Selecting a component
3. Running the plugin
4. Exploring the results!

**Happy Component Tracking! 🚀**
