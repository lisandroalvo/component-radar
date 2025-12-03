// ============================================================================
// SHARED TYPES FOR COMPONENT USAGE EXPLORER
// ============================================================================

/**
 * Record of a single component instance usage
 */
export interface ComponentUsageRecord {
  id: string;
  fileName: string;
  fileKey: string;
  pageName: string;
  pageId: string;
  nodeName: string;
  nodeId: string;
  instanceType: "direct" | "nested" | "remote";
  path: string[]; // Breadcrumb path from document root to instance
  variant: string | null;
  timestamp: number;
}

/**
 * Metadata about a master component being scanned
 */
export interface MasterComponentInfo {
  id: string;
  key: string;
  name: string;
  variantProperties?: { [key: string]: string };
  isRemote: boolean;
  libraryName?: string;
  sessionId: string;
}

/**
 * Scan configuration
 */
export interface ScanConfig {
  scope: "current-file" | "selected-files" | "entire-project";
  masterComponent: MasterComponentInfo;
  fileKeys?: string[]; // For selected-files mode
  projectId?: string; // For entire-project mode
}

/**
 * Scan progress update
 */
export interface ScanProgress {
  stage: "initializing" | "scanning" | "processing" | "complete" | "error";
  currentFile?: string;
  currentFileIndex?: number;
  totalFiles?: number;
  currentPage?: string;
  currentPageIndex?: number;
  totalPages?: number;
  instancesFound: number;
  message: string;
}

/**
 * Scan result summary
 */
export interface ScanResult {
  sessionId: string;
  masterComponent: MasterComponentInfo;
  totalInstances: number;
  records: ComponentUsageRecord[];
  scanDuration: number; // milliseconds
  timestamp: number;
  errors: string[];
}

/**
 * Grouped usage results for UI display
 */
export interface GroupedUsageResults {
  byFile: Map<string, ComponentUsageRecord[]>;
  byPage: Map<string, ComponentUsageRecord[]>;
  byType: Map<string, ComponentUsageRecord[]>;
}

/**
 * Export format options
 */
export type ExportFormat = "json" | "csv" | "html";

/**
 * Plugin storage schema
 */
export interface PluginStorage {
  scans: { [sessionId: string]: ScanResult };
  lastScanId: string | null;
  settings: {
    autoSaveScans: boolean;
    maxStoredScans: number;
  };
}

// Lightweight settings stored via figma.clientStorage
export interface PluginSettings {
  apiToken: string | null;
  defaultProjectId: string | null;
}

/**
 * Messages from UI to Plugin Backend
 */
export type UIMessage =
  | { type: "select-component"; nodeId: string }
  | { type: "start-scan"; config: ScanConfig }
  | { type: "cancel-scan" }
  | { type: "jump-to-node"; fileKey: string; nodeId: string }
  | { type: "export-results"; format: ExportFormat; sessionId: string }
  | { type: "clear-history" }
  | { type: "get-scan-results"; sessionId: string }
  | { type: "get-all-scans" }
  | { type: "get-settings" }
  | { type: "save-settings"; settings: PluginSettings }
  | { type: "get-project-id" };

/**
 * Messages from Plugin Backend to UI
 */
export type PluginMessage =
  | { type: "component-selected"; component: MasterComponentInfo; thumbnail?: string | null }
  | { type: "scan-progress"; progress: ScanProgress }
  | { type: "scan-complete"; result: ScanResult }
  | { type: "scan-error"; error: string }
  | { type: "scan-results"; result: ScanResult }
  | { type: "all-scans"; scans: ScanResult[] }
  | { type: "export-ready"; format: ExportFormat; data: string }
  | { type: "node-highlighted"; success: boolean }
  | { type: "settings-data"; settings: PluginSettings }
  | { type: "settings-saved"; settings: PluginSettings }
  | { type: "project-id-detected"; projectId: string | null };

/**
 * Node classification for traversal
 */
export interface NodeClassification {
  isInstance: boolean;
  isDirect: boolean;
  isNested: boolean;
  isRemote: boolean;
  masterComponentKey?: string;
  variant: string | null;
}
