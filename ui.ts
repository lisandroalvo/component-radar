// ============================================================================
// UI CONTROLLER - FRONTEND LOGIC
// ============================================================================

import type {
  UIMessage,
  PluginMessage,
  MasterComponentInfo,
  ScanConfig,
  ScanResult,
  ComponentUsageRecord,
  PluginSettings,
} from "./types";

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

console.log("=== UI.TS LOADING ===");
console.log("Compiled UI controller starting...");

let currentComponent: MasterComponentInfo | null = null;
let currentScanResult: ScanResult | null = null;
let isScanning = false;
let currentSettings: PluginSettings | null = null;
let detectedProjectId: string | null = null;
let currentFileKey: string | null = null; // Track the current Figma file key

// ============================================================================
// DOM ELEMENTS
// ============================================================================

// Tabs
const tabs = document.querySelectorAll<HTMLButtonElement>(".tab");
const tabContents = document.querySelectorAll<HTMLDivElement>(".tab-content");

// Scan Mode Elements
const componentInfoEl = document.getElementById("component-info")!;
const btnStartScan = document.getElementById("btn-start-scan") as HTMLButtonElement;
const btnCancelScan = document.getElementById("btn-cancel-scan") as HTMLButtonElement;
const progressSection = document.getElementById("progress-section")!;
const progressFill = document.getElementById("progress-fill") as HTMLDivElement;
const progressLog = document.getElementById("progress-log")!;

// Token Setup Elements
const tokenSetupEl = document.getElementById("token-setup");
const apiTokenInput = document.getElementById("api-token-input") as HTMLInputElement;
const projectIdInput = document.getElementById("project-id-input") as HTMLInputElement;
const saveTokenBtn = document.getElementById("save-token-btn") as HTMLButtonElement;

// Debug: Check if elements exist
console.log("Token setup elements:", {
  tokenSetupEl: !!tokenSetupEl,
  apiTokenInput: !!apiTokenInput,
  projectIdInput: !!projectIdInput,
  saveTokenBtn: !!saveTokenBtn,
});

console.log("Start scan button element:", btnStartScan);
console.log("Start scan button disabled?", btnStartScan.disabled);

// Results Elements
const resultsContainer = document.getElementById("results-container");
if (!resultsContainer) console.error("results-container not found!");

// Export Elements
const exportContainer = document.getElementById("export-container");
if (!exportContainer) console.error("export-container not found!");


console.log("All DOM elements loaded successfully");

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Send message to plugin backend
 */
function sendToPlugin(message: UIMessage) {
  parent.postMessage({ pluginMessage: message }, "*");
}

/**
 * Add log entry
 */
function addLogEntry(message: string, type: "info" | "success" | "error" = "info") {
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  progressLog.appendChild(entry);
  progressLog.scrollTop = progressLog.scrollHeight;
}

/**
 * Clear log
 */
function clearLog() {
  progressLog.innerHTML = "";
}

/**
 * Format number with commas
 */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Format duration
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Check if token setup is needed and show/hide UI accordingly
 */
function checkTokenSetup() {
  if (!tokenSetupEl) return true;
  
  const scopeElement = document.querySelector<HTMLInputElement>(
    'input[name="scope"]:checked'
  );
  const scope = scopeElement ? scopeElement.value : null;

  if (scope === "entire-project") {
    const hasToken = currentSettings && currentSettings.apiToken;
    const hasProjectId = currentSettings && currentSettings.defaultProjectId;
    if (!hasToken || !hasProjectId) {
      tokenSetupEl.style.display = "block";
      return false;
    } else {
      tokenSetupEl.style.display = "none";
      return true;
    }
  } else {
    tokenSetupEl.style.display = "none";
    return true;
  }
}

// ============================================================================
// UI RENDERING
// ============================================================================

/**
 * Render component info
 */
function renderComponentInfo(component: MasterComponentInfo, thumbnail?: string | null) {
  const iconHtml = thumbnail 
    ? `<img src="${thumbnail}" alt="${component.name}" class="component-thumbnail" style="width: 80px; height: 80px; object-fit: contain; border-radius: 8px; background: #2a2a2a;" />`
    : '<div class="component-icon">✅</div>';
    
  componentInfoEl.innerHTML = `
    <div class="component-info">
      ${iconHtml}
      <div class="component-details">
        <div class="component-name">
          ${component.name}
          ${component.isRemote ? '<span class="badge badge-remote">Remote</span>' : ""}
        </div>
        <div class="component-meta">
          ${component.libraryName ? `Library: ${component.libraryName}` : ""}
          ${component.key ? ` • Key: ${component.key.substring(0, 8)}...` : ""}
        </div>
      </div>
    </div>
  `;

  btnStartScan.disabled = false;
}

/**
 * Render scan results summary
 */
function renderResultsSummary(result: ScanResult) {
  const uniqueFiles = new Set(result.records.map((r) => r.fileKey)).size;
  const uniquePages = new Set(result.records.map((r) => r.pageId)).size;
  const directCount = result.records.filter((r) => r.instanceType === "direct").length;
  const nestedCount = result.records.filter((r) => r.instanceType === "nested").length;
  const remoteCount = result.records.filter((r) => r.instanceType === "remote").length;

  return `
    <div class="results-summary">
      <div class="stat-card">
        <div class="stat-value">${formatNumber(result.totalInstances)}</div>
        <div class="stat-label">Total Instances</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${uniqueFiles}</div>
        <div class="stat-label">Files</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${uniquePages}</div>
        <div class="stat-label">Pages</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${directCount}</div>
        <div class="stat-label">Direct</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${nestedCount}</div>
        <div class="stat-label">Nested</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${remoteCount}</div>
        <div class="stat-label">Remote</div>
      </div>
    </div>
  `;
}

/**
 * Group records by file
 */
function groupRecordsByFile(records: ComponentUsageRecord[]) {
  const grouped = new Map<string, ComponentUsageRecord[]>();

  records.forEach((record) => {
    const key = record.fileName;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(record);
  });

  return grouped;
}

/**
 * Render usage tree with page previews
 */
function renderUsageTree(result: ScanResult) {
  const groupedByFile = groupRecordsByFile(result.records);

  let treeHTML = `
    <div class="usage-tree">
      <div class="tree-header">
        <span>Component Instances</span>
        <span>${formatNumber(result.totalInstances)} found</span>
      </div>
      <div class="tree-body">
  `;

  groupedByFile.forEach((fileRecords, fileName) => {
    // Group by pages within this file
    const pageGroups = new Map<string, ComponentUsageRecord[]>();
    fileRecords.forEach((record) => {
      const key = `${record.pageName}|||${record.pageId}|||${record.fileKey}`;
      if (!pageGroups.has(key)) {
        pageGroups.set(key, []);
      }
      pageGroups.get(key)!.push(record);
    });

    treeHTML += `
      <div class="tree-group">
        <div class="tree-group-header" onclick="toggleTreeGroup(this)">
          <span class="tree-group-toggle">▶</span>
          <span class="tree-group-title">📁 ${fileName}</span>
          <span class="tree-group-count">${fileRecords.length}</span>
        </div>
        <div class="tree-group-items">
    `;

    // Render pages with previews
    pageGroups.forEach((pageRecords, key) => {
      const [pageName, pageId, fileKey] = key.split('|||');
      const pageInstanceId = `page-${fileKey}-${pageId}`;
      
      treeHTML += `
        <div class="page-group">
          <div class="page-header" onclick="togglePageGroup(this)">
            <span class="page-toggle">▶</span>
            <span class="page-title">📄 ${pageName}</span>
            <span class="page-count">${pageRecords.length}</span>
          </div>
          <div class="page-content">
            <div class="page-instances">
      `;

      pageRecords.forEach((record) => {
        // Check if this is an external file (different from the first record's file)
        const isExternal = result.records.length > 0 && fileKey !== result.records[0].fileKey;
        const externalIcon = isExternal ? '<span style="color: #18a0fb; font-size: 11px; margin-left: 4px;" title="Opens in browser">🔗</span>' : '';
        
        treeHTML += `
          <div class="tree-item">
            <div class="tree-item-content">
              <div class="tree-item-info">
                <div class="tree-item-name">
                  ${record.nodeName}${externalIcon}
                  <span class="tree-item-type type-${record.instanceType}">${record.instanceType}</span>
                  ${record.variant ? `<span style="color: #999; font-size: 11px; margin-left: 8px;">${record.variant}</span>` : ""}
                </div>
                <div class="tree-item-path">
                  ${record.path.slice(-3).join(" › ")}
                </div>
              </div>
              <button class="goto-button" onclick='jumpToNode("${record.fileKey}", "${record.nodeId}", "${pageId}")'>
                Go to instance
              </button>
            </div>
          </div>
        `;
      });

      treeHTML += `
            </div>
          </div>
        </div>
      `;
      
      // Disable page preview loading - Figma API doesn't reliably support page-level previews
      // setTimeout(() => loadPagePreview(fileKey, pageId, pageInstanceId), 100);
    });

    treeHTML += `
        </div>
      </div>
    `;
  });

  treeHTML += `
      </div>
    </div>
  `;

  return treeHTML;
}

/**
 * Render full results
 */
function renderResults(result: ScanResult) {
  if (!resultsContainer) return;
  
  if (result.totalInstances === 0) {
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">No Instances Found</div>
        <div class="empty-description">
          We couldn't find any instances of "${result.masterComponent.name}" in your selected scope.<br>
          <span style="font-size: 11px; margin-top: 8px; display: block;">💡 Try scanning a wider scope or check if the component is being used.</span>
        </div>
      </div>
    `;
    return;
  }

  resultsContainer.innerHTML = renderResultsSummary(result) + renderUsageTree(result);
}

/**
 * Render export section
 */
function renderExportSection(result: ScanResult) {
  if (!exportContainer) return;
  
  if (!result) {
    exportContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📦</div>
        <div class="empty-title">No Results Yet</div>
        <div class="empty-description">Complete a scan first, then come back here to export your results</div>
      </div>
    `;
    return;
  }

  exportContainer.innerHTML = `
    <div class="export-section">
      <h3 style="margin-bottom: 16px; color: #fff;">💾 Export Your Results</h3>
      <p style="margin-bottom: 16px; color: #999; font-size: 12px;">
        <strong style="color: #fff;">${result.masterComponent.name}</strong><br>
        🎯 ${formatNumber(result.totalInstances)} instance${result.totalInstances !== 1 ? 's' : ''} found<br>
        🕒 Scanned ${new Date(result.timestamp).toLocaleString()}<br>
        ⏱️ Completed in ${formatDuration(result.scanDuration)}
      </p>
      <div class="export-buttons">
        <button class="button button-secondary" onclick='exportResults("json")'>
          📄 JSON
        </button>
        <button class="button button-secondary" onclick='exportResults("csv")'>
          📊 CSV
        </button>
        <button class="button button-secondary" onclick='exportResults("html")'>
          🌐 HTML
        </button>
      </div>
    </div>

    <div style="background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 6px; padding: 16px;">
      <h3 style="margin-bottom: 12px; color: #fff;">📊 Summary</h3>
      ${renderResultsSummary(result)}
    </div>
  `;
}


// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle tab switching
 */
tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    const targetTab = tab.dataset.tab;

    // Update tabs
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    // Update content
    tabContents.forEach((content) => {
      content.classList.remove("active");
      if (content.id === `tab-${targetTab}`) {
        content.classList.add("active");
      }
    });

    // Refresh export section when switching to export tab
    if (targetTab === "export" && currentScanResult) {
      renderExportSection(currentScanResult);
    }
  });
});

/**
 * Handle scope change
 */
document.querySelectorAll<HTMLInputElement>('input[name="scope"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    checkTokenSetup();
  });
});

/**
 * Handle save token button
 */
if (saveTokenBtn) {
  console.log("Attaching event listener to save token button");
  saveTokenBtn.addEventListener("click", () => {
    console.log("Save button clicked!");
    const token = apiTokenInput.value.trim();
    let projectId = projectIdInput.value.trim();
    
    console.log("Token length:", token.length);
    console.log("Project ID input:", projectId);
    
    if (!token) {
      alert("⚠️ Missing API Token\n\nPlease enter your Figma API token to continue.");
      return;
    }

    if (!projectId) {
      alert("⚠️ Missing Project ID\n\nPlease enter your Figma project ID to continue.");
      return;
    }

    // Extract project ID from URL if user pasted full URL
    if (projectId.includes("figma.com")) {
      const match = projectId.match(/\/project\/(\d+)/);
      if (match && match[1]) {
        projectId = match[1];
        console.log("Extracted project ID from URL:", projectId);
      }
    }

    currentSettings = {
      apiToken: token,
      defaultProjectId: projectId,
    };

    console.log("Sending settings to plugin...", currentSettings);
    sendToPlugin({
      type: "save-settings",
      settings: currentSettings,
    });

    addLogEntry("Configuration saved successfully!", "success");
    if (tokenSetupEl) {
      tokenSetupEl.style.display = "none";
    }
  });
} else {
  console.error("Save token button not found!");
}

/**
 * Handle start scan
 */
console.log("Attaching click listener to Start Scan button");
btnStartScan.addEventListener("click", () => {
  console.log("=== START SCAN BUTTON CLICKED ===");
  console.log("Current component:", currentComponent);
  
  if (!currentComponent) {
    console.log("No component selected, returning");
    alert("🎯 Select a Component\n\nPlease select a component in Figma first, then click 'Start Scanning'.");
    return;
  }

  const scopeElement = document.querySelector<HTMLInputElement>(
    'input[name="scope"]:checked'
  );
  const scope = (scopeElement ? scopeElement.value : "current-file") as "entire-project" | "current-file" | "selected-files";
  console.log("Selected scope:", scope);

  if (!scope) {
    alert("⚠️ Choose Scan Scope\n\nPlease select where you'd like to scan: entire project or current file only.");
    return;
  }

  // For entire-project, check token first
  if (scope === "entire-project" && !checkTokenSetup()) {
    alert("🔑 Setup Required\n\nTo scan your entire project, please complete the API token setup above.");
    return;
  }

  // For entire-project, request project ID from backend
  if (scope === "entire-project") {
    console.log("Entire project scan - requesting project ID from backend");
    // Backend will auto-detect project ID
    sendToPlugin({
      type: "get-project-id",
    });
    // The actual scan will be triggered when we receive the project ID
    return;
  }

  console.log("Starting scan with scope:", scope);

  const config: ScanConfig = {
    scope,
    masterComponent: currentComponent,
  };

  isScanning = true;
  btnStartScan.disabled = true;
  progressSection.classList.add("active");
  clearLog();
  addLogEntry("🔍 Initializing scan...", "info");

  sendToPlugin({
    type: "start-scan",
    config,
  });
});

/**
 * Handle cancel scan
 */
btnCancelScan.addEventListener("click", () => {
  sendToPlugin({ type: "cancel-scan" });
  isScanning = false;
  btnStartScan.disabled = false;
  progressSection.classList.remove("active");
  addLogEntry("⛔ Scan stopped by user", "error");
});

/**
 * Toggle tree group (exposed globally for onclick)
 */
(window as any).toggleTreeGroup = function (element: HTMLElement) {
  const group = element.parentElement!;
  group.classList.toggle("expanded");
};

/**
 * Toggle page group (exposed globally for onclick)
 */
(window as any).togglePageGroup = function (element: HTMLElement) {
  const group = element.parentElement!;
  group.classList.toggle("expanded");
};

/**
 * Load page preview thumbnail
 */
async function loadPagePreview(fileKey: string, pageId: string, elementId: string) {
  // Disabled: Figma's Images API doesn't reliably support page-level rendering
  // This function is kept for potential future use with frame-level previews
  const element = document.getElementById(elementId);
  if (!element) return;
  
  element.innerHTML = `
    <div class="preview-placeholder" style="padding: 20px;">
      <div style="color: #666; font-size: 11px; text-align: center;">
        ${pageId.split('-')[0]}
      </div>
    </div>
  `;
}

/**
 * Jump to node (exposed globally for onclick)
 */
(window as any).jumpToNode = function (fileKey: string, nodeId: string, pageId: string) {
  // For now, ALWAYS try to use the plugin API first
  // The backend will handle whether it's the current file or not
  sendToPlugin({
    type: "jump-to-node",
    fileKey,
    nodeId,
  });
};

/**
 * Export results (exposed globally for onclick)
 */
(window as any).exportResults = function (format: "json" | "csv" | "html") {
  if (!currentScanResult) return;

  sendToPlugin({
    type: "export-results",
    format,
    sessionId: currentScanResult.sessionId,
  });
};


// ============================================================================
// MESSAGE HANDLER FROM PLUGIN
// ============================================================================

window.onmessage = (event) => {
  console.log("🔔 UI RECEIVED MESSAGE:", event.data.pluginMessage);
  
  const message = event.data.pluginMessage as PluginMessage;

  if (!message) {
    console.log("⚠️ Message was null/undefined");
    return;
  }

  console.log("📨 Processing message type:", message.type);

  switch (message.type) {
    case "component-selected":
      currentComponent = message.component;
      renderComponentInfo(message.component, message.thumbnail);
      addLogEntry(`Ready to scan: ${message.component.name}`, "success");
      break;

    case "scan-progress":
      const { progress } = message;
      const timerText = progress.elapsedSeconds !== undefined 
        ? ` [${progress.elapsedSeconds}s]` 
        : '';
      addLogEntry(progress.message + timerText, progress.stage === "error" ? "error" : "info");

      // Update progress bar (rough estimate)
      if (progress.currentFileIndex !== undefined && progress.totalFiles !== undefined) {
        const percentage = ((progress.currentFileIndex + 1) / progress.totalFiles) * 100;
        progressFill.style.width = `${percentage}%`;
      } else if (progress.currentPageIndex !== undefined && progress.totalPages !== undefined) {
        const percentage = ((progress.currentPageIndex + 1) / progress.totalPages) * 100;
        progressFill.style.width = `${percentage}%`;
      }
      break;

    case "scan-complete":
      console.log("=== SCAN COMPLETE ===");
      console.log("Result:", message.result);
      
      isScanning = false;
      btnStartScan.disabled = false;
      progressSection.classList.remove("active");
      progressFill.style.width = "100%";

      currentScanResult = message.result;
      console.log("currentScanResult set to:", currentScanResult);
      
      addLogEntry(
        `✅ Scan complete! Found ${message.result.totalInstances} instance${message.result.totalInstances !== 1 ? 's' : ''} in ${formatDuration(message.result.scanDuration)}`,
        "success"
      );

      // Switch to results tab
      tabs.forEach((t) => {
        if (t.dataset.tab === "results") {
          t.click();
        }
      });

      renderResults(message.result);
      renderExportSection(message.result); // Also refresh export tab
      
      console.log("=== SCAN COMPLETE HANDLING DONE ===");
      break;

    case "scan-error":
      isScanning = false;
      btnStartScan.disabled = false;
      progressSection.classList.remove("active");
      addLogEntry(`❌ Error: ${message.error}`, "error");
      alert(`❌ Scan Failed\n\n${message.error}\n\nPlease try again or check your settings.`);
      break;

    case "scan-results":
      currentScanResult = message.result;
      renderResults(message.result);
      renderExportSection(message.result); // Also refresh export tab
      break;

    case "settings-data":
      currentSettings = message.settings;
      checkTokenSetup();
      break;

    case "settings-saved":
      currentSettings = message.settings;
      addLogEntry("✓ Settings saved successfully", "success");
      checkTokenSetup();
      break;

    case "project-id-detected":
      detectedProjectId = message.projectId;
      if (!detectedProjectId) {
        alert("⚠️ Project Not Found\n\nCouldn't detect a project ID. Please make sure this file belongs to a Figma project.");
        break;
      }
      // Now start the actual scan with the detected project ID
      if (!currentComponent) break;
      
      const config: ScanConfig = {
        scope: "entire-project",
        masterComponent: currentComponent,
        projectId: detectedProjectId,
      };
      
      isScanning = true;
      btnStartScan.disabled = true;
      progressSection.classList.add("active");
      clearLog();
      addLogEntry("🚀 Starting project-wide scan...", "info");
      addLogEntry(`🎯 Project ID: ${detectedProjectId}`, "info");
      
      sendToPlugin({
        type: "start-scan",
        config,
      });
      break;

    case "export-ready":
      // Create download link
      const blob = new Blob([message.data], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `component-usage-${Date.now()}.${message.format}`;
      a.click();
      URL.revokeObjectURL(url);
      addLogEntry(`📥 Export complete: ${message.format.toUpperCase()} file downloaded`, "success");
      break;

    case "node-highlighted":
      if (message.success) {
        addLogEntry("✅ Navigated to instance", "success");
      } else {
        addLogEntry("❌ Could not navigate to instance", "error");
      }
      break;

    default:
      console.log("Unknown message type:", message);
  }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

// Request settings on load
sendToPlugin({ type: "get-settings" });

// Check token setup on load
setTimeout(() => {
  checkTokenSetup();
}, 100);
