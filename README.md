# Component Usage Explorer

A production-ready Figma plugin for tracking all instances of a master component across files.

## 🎯 Features

### ✅ Intelligent Component Detection
- Detects all instances of a selected master component
- Identifies **direct instances**, **nested instances**, and **remote instances**
- Tracks variant properties and overrides
- Handles disconnected and modified instances

### 🔍 Advanced Scanning Capabilities
- **Current File Scan**: Scan all pages in the current Figma file
- **BFS Traversal**: Efficient breadth-first search algorithm for optimal performance
- **Deep Nesting Support**: Finds instances inside components inside components
- **Progress Tracking**: Real-time scan progress with detailed logs

### 📊 Comprehensive Results
- Hierarchical tree view grouped by files and pages
- Instance count statistics (total, direct, nested, remote)
- Quick jump-to-node functionality
- Full path breadcrumbs for each instance
- Variant information display

### 📦 Export Capabilities
- **JSON Export**: Full structured data export
- **CSV Export**: Spreadsheet-compatible format
- **HTML Export**: Beautiful standalone report with styling

### 💾 Local Storage
- Auto-save scan results
- Scan history management
- Quick access to previous scans
- Configurable storage limits

## 🚀 Installation

### Development Setup

1. **Clone or download** this plugin to your local machine

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Build the plugin**:
   ```bash
   npm run build
   ```

   This compiles:
   - `code.ts` → `code.js` (plugin backend)
   - `ui.ts` → `ui.js` (UI frontend)

4. **Load in Figma**:
   - Open Figma Desktop App
   - Go to **Plugins** → **Development** → **Import plugin from manifest**
   - Select the `manifest.json` file from this directory

### Build Scripts

```json
{
  "build": "npm run build:code && npm run build:ui",
  "build:code": "tsc -p tsconfig.json",
  "build:ui": "tsc -p tsconfig.ui.json",
  "watch": "npm run watch:code & npm run watch:ui",
  "watch:code": "tsc -p tsconfig.json --watch",
  "watch:ui": "tsc -p tsconfig.ui.json --watch"
}
```

## 📖 Usage

### Basic Workflow

1. **Select a Master Component**
   - In Figma, select any master component (not an instance)
   - The plugin will automatically detect it

2. **Choose Scan Scope**
   - **Current File**: Scans all pages in the current file ✅
   - **Selected Files**: Requires OAuth setup ⚠️
   - **Entire Project**: Requires OAuth setup ⚠️

3. **Start Scan**
   - Click "Start Scan" button
   - Watch real-time progress in the log
   - Results appear automatically when complete

4. **Browse Results**
   - Navigate the tree view grouped by files/pages
   - Click any instance to jump to it in Figma
   - View statistics and instance types

5. **Export Results**
   - Switch to "Export" tab
   - Choose format: JSON, CSV, or HTML
   - Download generated file

## 🏗️ Architecture

### File Structure

```
.
├── manifest.json         # Plugin manifest with permissions
├── package.json          # NPM dependencies
├── tsconfig.json         # TypeScript config for plugin code
├── tsconfig.ui.json      # TypeScript config for UI code
│
├── types.ts              # Shared TypeScript types and interfaces
│
├── code.ts               # Plugin backend controller
├── scan-engine.ts        # BFS scanning logic
├── db.ts                 # Local storage management
├── exporter.ts           # JSON/CSV/HTML exporters
│
├── ui.html               # UI markup and styles
└── ui.ts                 # UI controller and event handlers
```

### Core Modules

#### **types.ts**
Defines all TypeScript interfaces:
- `ComponentUsageRecord`: Single instance record
- `MasterComponentInfo`: Master component metadata
- `ScanConfig`: Scan configuration
- `ScanResult`: Complete scan results
- Message types for UI ↔ Plugin communication

#### **scan-engine.ts**
Core scanning engine:
- **BFS Traversal**: Queue-based breadth-first search
- **Node Classification**: Identifies instance types
- **Memory-Safe**: Async chunks to prevent blocking
- **Progress Reporting**: Real-time updates via callbacks

#### **db.ts**
Storage layer using Figma's `clientStorage`:
- CRUD operations for scan results
- Automatic storage limits (max 50 scans)
- Scan history management
- Settings persistence

#### **exporter.ts**
Export formatters:
- **JSON**: Structured data export
- **CSV**: Comma-separated values for spreadsheets
- **HTML**: Standalone report with embedded styles

#### **code.ts**
Plugin backend controller:
- Message routing from UI
- Figma API integration
- Scan orchestration
- Node selection and navigation

#### **ui.ts**
Frontend UI controller:
- Tab navigation
- Component selection display
- Progress visualization
- Results tree rendering
- Export handling

## 🔧 Technical Details

### BFS vs DFS Traversal
This plugin uses **Breadth-First Search (BFS)** instead of Depth-First Search for several reasons:
- Better performance on large, shallow trees
- More predictable memory usage
- Natural progress reporting by level
- Easier to implement cancellation

### Performance Optimizations
1. **Async Micro-tasks**: Yields to prevent UI blocking
2. **Debounced Updates**: Progress updates every 10 instances
3. **Cached Queries**: Stores component key lookups
4. **Smart Limits**: Max 50 stored scans with auto-cleanup

### Instance Type Classification

| Type | Description |
|------|-------------|
| **Direct** | Direct instance of the master component |
| **Nested** | Instance found inside another component/frame |
| **Remote** | Instance from a remote library |

## 🔮 Future Enhancements

### OAuth Integration (Coming Soon)
Currently, external file scanning requires OAuth setup. Implementation roadmap:
1. Figma OAuth app registration
2. Access token management
3. REST API integration for cross-file scanning
4. Rate limiting and error handling

### Planned Features
- [ ] Batch scanning of multiple components
- [ ] Instance override detection
- [ ] Change tracking over time
- [ ] Component dependency graph
- [ ] Advanced filtering and search
- [ ] Export to Notion/Airtable

## 🐛 Known Limitations

1. **External File Scanning**: Requires OAuth (not yet implemented)
2. **Large Files**: Files with >10,000 nodes may take several minutes
3. **Deleted Instances**: Won't detect instances that have been deleted
4. **Variant Tracking**: Limited support for complex variant combinations

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly in Figma
5. Submit a pull request

## 📄 License

MIT License - Feel free to use and modify as needed.

## 🙏 Acknowledgments

Built with:
- **Figma Plugin API**
- **TypeScript**
- **Modern ES2020 Features**

---

**Built by**: Component Usage Explorer Team  
**Version**: 1.0.0  
**Last Updated**: 2024
