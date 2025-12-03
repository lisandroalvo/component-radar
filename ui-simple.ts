// ============================================================================
// UI CONTROLLER - SIMPLE VERSION (No imports)
// ============================================================================

console.log("UI Script loading...");

// Function to initialize the UI
function initializeUI() {
  console.log("Initializing UI...");
  
  // Check if already called
  if ((window as any).uiInitialized) {
    console.log("UI already initialized, skipping");
    return;
  }
  (window as any).uiInitialized = true;

let currentComponent: any = null;
let currentScanResult: any = null;

// DOM Elements
const tabs = document.querySelectorAll(".tab");
const tabContents = document.querySelectorAll(".tab-content");
const componentInfoEl = document.getElementById("component-info");
const btnStartScan = document.getElementById("btn-start-scan") as HTMLButtonElement;
const btnCancelScan = document.getElementById("btn-cancel-scan") as HTMLButtonElement;
const progressSection = document.getElementById("progress-section");
const progressFill = document.getElementById("progress-fill") as HTMLDivElement;
const progressLog = document.getElementById("progress-log");
const resultsContainer = document.getElementById("results-container");
const exportContainer = document.getElementById("export-container");

console.log("DOM elements found:", {
  tabs: tabs.length,
  componentInfoEl: !!componentInfoEl,
  btnStartScan: !!btnStartScan,
  progressSection: !!progressSection,
  progressLog: !!progressLog,
  resultsContainer: !!resultsContainer,
});

// Send message to plugin
function sendToPlugin(message: any) {
  parent.postMessage({ pluginMessage: message }, "*");
}

// Add log entry
function addLogEntry(message: string, type: string = "info") {
  const entry = document.createElement("div");
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  progressLog.appendChild(entry);
  progressLog.scrollTop = progressLog.scrollHeight;
}

// Clear log
function clearLog() {
  progressLog.innerHTML = "";
}

// Render component info
function renderComponentInfo(component: any) {
  console.log("Rendering component info:", component);
  
  if (!componentInfoEl) {
    console.error("componentInfoEl not found!");
    return;
  }
  
  componentInfoEl.innerHTML = `
    <div class="component-info">
      <div class="component-icon">🎨</div>
      <div class="component-details">
        <div class="component-name">${component.name}</div>
        <div class="component-meta">Key: ${component.key?.substring(0, 8)}...</div>
      </div>
    </div>
  `;
  
  if (btnStartScan) {
    btnStartScan.disabled = false;
    console.log("Start Scan button enabled");
  }
}

// Render results
function renderResults(result: any) {
  if (result.totalInstances === 0) {
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">No Instances Found</div>
      </div>
    `;
    return;
  }

  // Group by file
  const byFile = new Map();
  result.records.forEach((record: any) => {
    if (!byFile.has(record.fileName)) {
      byFile.set(record.fileName, []);
    }
    byFile.get(record.fileName).push(record);
  });

  let html = `
    <div class="results-summary">
      <div class="stat-card">
        <div class="stat-value">${result.totalInstances}</div>
        <div class="stat-label">Total Instances</div>
      </div>
    </div>
    <div class="usage-tree">
      <div class="tree-header">Component Instances</div>
      <div class="tree-body">
  `;

  byFile.forEach((records: any[], fileName: string) => {
    html += `
      <div class="tree-group">
        <div class="tree-group-header" onclick="this.parentElement.classList.toggle('expanded')">
          <span class="tree-group-toggle">▶</span>
          <span class="tree-group-title">📁 ${fileName}</span>
          <span class="tree-group-count">${records.length}</span>
        </div>
        <div class="tree-group-items">
    `;

    records.forEach((record: any) => {
      html += `
        <div class="tree-item" onclick='jumpToNode("${record.fileKey}", "${record.nodeId}")'>
          <div class="tree-item-name">
            ${record.nodeName}
            <span class="tree-item-type type-${record.instanceType}">${record.instanceType}</span>
          </div>
          <div class="tree-item-path">${record.pageName} › ${record.path.slice(-2).join(" › ")}</div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  html += `
      </div>
    </div>
  `;

  resultsContainer.innerHTML = html;
}

// Tab switching
tabs.forEach((tab: any) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t: any) => t.classList.remove("active"));
    tab.classList.add("active");

    tabContents.forEach((content: any) => {
      content.classList.remove("active");
      if (content.id === `tab-${tab.dataset.tab}`) {
        content.classList.add("active");
      }
    });
  });
});

// Start scan
btnStartScan.addEventListener("click", () => {
  if (!currentComponent) return;

  const scope = (document.querySelector('input[name="scope"]:checked') as HTMLInputElement)?.value;

  progressSection.classList.add("active");
  btnStartScan.disabled = true;
  clearLog();
  addLogEntry("Starting scan...", "info");

  sendToPlugin({
    type: "start-scan",
    config: {
      scope: scope || "current-file",
      masterComponent: currentComponent,
    },
  });
});

// Cancel scan
btnCancelScan.addEventListener("click", () => {
  sendToPlugin({ type: "cancel-scan" });
  progressSection.classList.remove("active");
  btnStartScan.disabled = false;
  addLogEntry("Scan cancelled", "error");
});

// Jump to node (global function)
(window as any).jumpToNode = function (fileKey: string, nodeId: string) {
  sendToPlugin({ type: "jump-to-node", fileKey, nodeId });
};

// Message handler
window.onmessage = (event: any) => {
  const message = event.data.pluginMessage;
  console.log("UI received message:", message);
  if (!message) return;

  switch (message.type) {
    case "component-selected":
      currentComponent = message.component;
      renderComponentInfo(message.component);
      addLogEntry(`Component selected: ${message.component.name}`, "success");
      break;

    case "instance-selected":
    case "wrong-selection":
      componentInfoEl.innerHTML = `
        <div class="empty-state" style="padding: 20px;">
          <div class="empty-icon">⚠️</div>
          <div class="empty-description" style="color: #fbbf24; margin-top: 8px;">${message.message}</div>
        </div>
      `;
      btnStartScan.disabled = true;
      addLogEntry(message.message, "error");
      break;

    case "scan-progress":
      addLogEntry(message.progress.message, message.progress.stage === "error" ? "error" : "info");
      if (message.progress.totalPages) {
        const pct = ((message.progress.currentPageIndex + 1) / message.progress.totalPages) * 100;
        progressFill.style.width = `${pct}%`;
      }
      break;

    case "scan-complete":
      btnStartScan.disabled = false;
      progressSection.classList.remove("active");
      progressFill.style.width = "100%";
      currentScanResult = message.result;
      addLogEntry(`Scan complete! Found ${message.result.totalInstances} instances`, "success");

      // Switch to results tab
      tabs.forEach((t: any) => {
        if (t.dataset.tab === "results") t.click();
      });

      renderResults(message.result);
      break;

    case "scan-error":
      btnStartScan.disabled = false;
      progressSection.classList.remove("active");
      addLogEntry(`Error: ${message.error}`, "error");
      break;

    case "node-highlighted":
      if (message.success) {
        addLogEntry("Jumped to node in Figma", "success");
      }
      break;
  }
};

// Initialization complete
console.log("Component Usage Explorer UI initialized");

// Tell plugin we're ready
console.log("Sending UI-ready message to plugin...");
sendToPlugin({ type: "ui-ready" });

} // End of initializeUI function

// Call initialization - try both immediate and on DOMContentLoaded
console.log("Setting up initialization, readyState:", document.readyState);

// Try immediate call
try {
  console.log("Attempting immediate initialization...");
  initializeUI();
} catch (e) {
  console.error("Immediate init failed:", e);
}

// Also listen for DOMContentLoaded as backup
document.addEventListener("DOMContentLoaded", function() {
  console.log("DOMContentLoaded event fired, calling initializeUI");
  initializeUI();
});
