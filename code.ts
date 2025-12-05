// ============================================================================
// PLUGIN CONTROLLER - MAIN BACKEND LOGIC
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
import { db } from "./db";
import { ScanEngine } from "./scan-engine";
import { Exporter } from "./exporter";

// Global state
let currentScan: ScanEngine | null = null;
let currentScanStartTime = 0;
const SETTINGS_STORAGE_KEY = "component-usage-settings-v1";

async function loadSettings(): Promise<PluginSettings> {
  const stored = (await figma.clientStorage.getAsync(
    SETTINGS_STORAGE_KEY
  )) as PluginSettings | null;

  if (stored && typeof stored === "object") {
    return {
      apiToken: stored.apiToken != null ? stored.apiToken : null,
      defaultProjectId: stored.defaultProjectId != null ? stored.defaultProjectId : null,
    };
  }

  return {
    apiToken: null,
    defaultProjectId: null,
  };
}

async function saveSettings(settings: PluginSettings): Promise<void> {
  await figma.clientStorage.setAsync(SETTINGS_STORAGE_KEY, settings);
}

/**
 * Show the plugin UI
 */
figma.showUI(__html__, {
  width: 800,
  height: 600,
  title: "Component Radar",
});

/**
 * Send a message to the UI
 */
function sendToUI(message: PluginMessage) {
  figma.ui.postMessage(message);
}

async function getProjectFileKeys(
  projectId: string,
  apiToken: string
): Promise<string[]> {
  console.log("getProjectFileKeys: Fetching files for project", projectId);
  const url = `https://api.figma.com/v1/projects/${projectId}/files`;
  console.log("getProjectFileKeys: API URL:", url);
  
  const res = await fetch(
    url as string,
    {
      method: "GET",
      headers: {
        "X-Figma-Token": apiToken,
      },
    }
  );

  console.log("getProjectFileKeys: Response status:", res.status);
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error("getProjectFileKeys: API error response:", errorText);
    throw new Error(
      `Failed to list project files (projectId=${projectId}): HTTP ${res.status} - ${errorText}`
    );
  }

  const json: any = await res.json();
  console.log("getProjectFileKeys: API response:", json);
  const files = (json.files || []) as Array<{ key: string }>;
  console.log("getProjectFileKeys: Extracted", files.length, "file keys");
  return files.map((f) => f.key).filter(Boolean);
}

/**
 * Extract master component info from a selected node
 */
function extractMasterComponentInfo(node: ComponentNode): MasterComponentInfo {
  const sessionId = `scan-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  return {
    id: node.id,
    key: node.key,
    name: node.name,
    variantProperties: node.variantProperties || undefined,
    isRemote: node.remote || false,
    libraryName: node.parent && node.parent.type === "PAGE" ? figma.root.name : undefined,
    sessionId,
  };
}

/**
 * Handle component selection
 */
async function handleSelectComponent(nodeId: string) {
  try {
    const node = await figma.getNodeByIdAsync(nodeId);

    if (!node) {
      sendToUI({
        type: "scan-error",
        error: "Node not found",
      });
      return;
    }

    // Check if user selected an instance instead of main component
    if (node.type === "INSTANCE") {
      sendToUI({
        type: "scan-error",
        error: "⚠️ Cannot scan an instance!\n\nYou selected an instance of a component. Please select the main component instead.\n\nTip: Look for the component in your Assets panel or find the purple diamond icon (⬦) in the layers panel.",
      });
      return;
    }

    if (node.type !== "COMPONENT") {
      sendToUI({
        type: "scan-error",
        error: "Selected node is not a component. Please select a main component.",
      });
      return;
    }

    const componentNode = node as ComponentNode;
    const componentInfo = extractMasterComponentInfo(componentNode);

    // Export component as PNG thumbnail
    let thumbnailData: string | null = null;
    try {
      const imageBytes = await componentNode.exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: 2 }, // 2x for better quality
      });
      // Convert to base64
      const base64 = figma.base64Encode(imageBytes);
      thumbnailData = `data:image/png;base64,${base64}`;
    } catch (error) {
      console.error("Failed to export component thumbnail:", error);
    }

    sendToUI({
      type: "component-selected",
      component: componentInfo,
      thumbnail: thumbnailData,
    });
  } catch (error) {
    sendToUI({
      type: "scan-error",
      error: `Failed to select component: ${error}`,
    });
  }
}

/**
 * Handle scan start
 */
async function handleStartScan(config: ScanConfig) {
  try {
    console.log("Backend: handleStartScan called with config:", config);
    console.log("Backend: Scan scope:", config.scope);
    
    // Check current selection - user might have switched to an instance after initial component selection
    const currentSelection = figma.currentPage.selection;
    if (currentSelection.length === 1 && currentSelection[0].type === "INSTANCE") {
      sendToUI({
        type: "scan-error",
        error: "⚠️ Cannot scan an instance!\n\nYou selected an instance of a component. Please select the main component instead.\n\nTip: Look for the component in your Assets panel or find the purple diamond icon (⬦) in the layers panel.",
      });
      return;
    }
    
    // Validate that we're scanning a main component, not an instance
    const componentNode = await figma.getNodeByIdAsync(config.masterComponent.id);
    if (!componentNode) {
      sendToUI({
        type: "scan-error",
        error: "Component not found. Please select a valid component.",
      });
      return;
    }
    
    if (componentNode.type === "INSTANCE") {
      sendToUI({
        type: "scan-error",
        error: "⚠️ Cannot scan an instance!\n\nYou selected an instance of a component. Please select the main component instead.\n\nTip: Look for the component in your Assets panel or find the purple diamond icon (⬦) in the layers panel.",
      });
      return;
    }
    
    if (componentNode.type !== "COMPONENT") {
      sendToUI({
        type: "scan-error",
        error: "Selected node is not a component. Please select a main component.",
      });
      return;
    }
    
    // Initialize scan engine
    currentScan = new ScanEngine();
    currentScanStartTime = Date.now();

    // Set up progress reporting with elapsed time
    currentScan.onProgress((progress) => {
      const elapsedSeconds = Math.floor((Date.now() - currentScanStartTime) / 1000);
      const progressWithTimer = Object.assign({}, progress, { elapsedSeconds });
      sendToUI({
        type: "scan-progress",
        progress: progressWithTimer,
      });
    });

    let records: ComponentUsageRecord[] = [];

    // Execute scan based on scope
    if (config.scope === "current-file") {
      console.log("Backend: Starting CURRENT FILE scan");
      records = await currentScan.scanCurrentFile(config.masterComponent);
    } else if (config.scope === "entire-project") {
      console.log("Backend: Starting ENTIRE PROJECT scan");
      const settings = await loadSettings();
      const token = settings.apiToken;
      const projectId = config.projectId || settings.defaultProjectId;
      
      console.log("Backend: Token exists?", !!token);
      console.log("Backend: Project ID:", projectId);

      if (!token || !projectId) {
        console.log("Backend: Missing token or project ID, aborting");
        sendToUI({
          type: "scan-error",
          error:
            "Entire project scanning requires API token and project ID. Please provide them in the plugin UI.",
        });
        return;
      }

      console.log("Backend: Fetching file keys from project", projectId);
      const fileKeys = await getProjectFileKeys(projectId, token);
      console.log("Backend: Found", fileKeys.length, "files in project");

      if (fileKeys.length === 0) {
        console.log("Backend: No files found, aborting");
        sendToUI({
          type: "scan-error",
          error: "No files found in the specified project.",
        });
        return;
      }

      console.log("Backend: Starting scanExternalFiles with", fileKeys.length, "files");
      records = await currentScan.scanExternalFiles(
        config.masterComponent,
        fileKeys,
        token
      );
      console.log("Backend: scanExternalFiles complete, found", records.length, "instances");
    } else if (config.scope === "selected-files") {
      // Optional future enhancement: scan specific file keys via REST API
      if (!config.fileKeys || config.fileKeys.length === 0) {
        sendToUI({
          type: "scan-error",
          error: "No files selected for scanning.",
        });
        return;
      }

      const settings = await loadSettings();
      const token = settings.apiToken;
      if (!token) {
        sendToUI({
          type: "scan-error",
          error:
            "Selected-files scanning requires an API token. Please provide it in the plugin UI.",
        });
        return;
      }

      records = await currentScan.scanExternalFiles(
        config.masterComponent,
        config.fileKeys,
        token
      );
    }

    // Calculate scan duration
    const scanDuration = Date.now() - currentScanStartTime;

    // Build scan result
    const result: ScanResult = {
      sessionId: config.masterComponent.sessionId,
      masterComponent: config.masterComponent,
      totalInstances: records.length,
      records,
      scanDuration,
      timestamp: Date.now(),
      errors: [],
    };

    // Save to database
    await db.setRecord(result);

    // Send completion message
    sendToUI({
      type: "scan-complete",
      result,
    });

    currentScan = null;
  } catch (error) {
    let errorMessage = "Unknown error occurred";
    
    try {
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object') {
        errorMessage = JSON.stringify(error);
      } else {
        errorMessage = String(error);
      }
    } catch (stringifyError) {
      errorMessage = "Error occurred but couldn't be formatted";
    }
    
    console.error("Scan error details:", error);
    
    sendToUI({
      type: "scan-error",
      error: `Scan failed: ${errorMessage}`,
    });
    currentScan = null;
  }
}

/**
 * Handle scan cancellation
 */
function handleCancelScan() {
  if (currentScan) {
    currentScan.abort();
    currentScan = null;

    sendToUI({
      type: "scan-progress",
      progress: {
        stage: "error",
        instancesFound: 0,
        message: "Scan cancelled by user",
      },
    });
  }
}

/**
 * Handle jump to node
 */
async function handleJumpToNode(fileKey: string, nodeId: string) {
  try {
    // Check if node is in current file
    const currentFileKey = figma.fileKey || "";

    if (fileKey !== currentFileKey) {
      // Create a Figma URL to open the file directly at the node
      const figmaUrl = `https://www.figma.com/file/${fileKey}?node-id=${encodeURIComponent(nodeId)}`;
      
      // Open the URL in the browser
      figma.openExternal(figmaUrl);
      
      sendToUI({
        type: "node-highlighted",
        success: true,
      });
      return;
    }

    const node = await figma.getNodeByIdAsync(nodeId);

    if (!node) {
      sendToUI({
        type: "scan-error",
        error: "Node not found. It may have been deleted.",
      });
      return;
    }

    // Navigate to the node's page if needed
    if ("parent" in node) {
      let current = node.parent;
      while (current && current.type !== "PAGE") {
        current = current.parent;
      }

      if (current && current.type === "PAGE") {
        figma.currentPage = current as PageNode;
      }
    }

    // Zoom to node
    figma.viewport.scrollAndZoomIntoView([node]);

    // Highlight the node temporarily
    figma.currentPage.selection = [node as SceneNode];

    // Set plugin data for highlight effect
    if ("setPluginData" in node) {
      (node as any).setPluginData("highlight", "1");

      // Remove highlight after 2 seconds
      setTimeout(() => {
        if ("setPluginData" in node) {
          (node as any).setPluginData("highlight", "");
        }
      }, 2000);
    }

    sendToUI({
      type: "node-highlighted",
      success: true,
    });
  } catch (error) {
    sendToUI({
      type: "scan-error",
      error: `Failed to jump to node: ${error}`,
    });
  }
}

/**
 * Handle export request
 */
async function handleExport(format: "json" | "csv" | "html", sessionId: string) {
  try {
    const result = await db.getRecord(sessionId);

    if (!result) {
      sendToUI({
        type: "scan-error",
        error: "Scan results not found",
      });
      return;
    }

    const data = Exporter.export(result, format);

    sendToUI({
      type: "export-ready",
      format,
      data,
    });
  } catch (error) {
    sendToUI({
      type: "scan-error",
      error: `Export failed: ${error}`,
    });
  }
}

/**
 * Handle get scan results
 */
async function handleGetScanResults(sessionId: string) {
  try {
    const result = await db.getRecord(sessionId);

    if (!result) {
      sendToUI({
        type: "scan-error",
        error: "Scan results not found",
      });
      return;
    }

    sendToUI({
      type: "scan-results",
      result,
    });
  } catch (error) {
    sendToUI({
      type: "scan-error",
      error: `Failed to load scan results: ${error}`,
    });
  }
}

/**
 * Handle get all scans
 */
async function handleGetAllScans() {
  try {
    const scans = await db.getAll();

    sendToUI({
      type: "all-scans",
      scans,
    });
  } catch (error) {
    sendToUI({
      type: "scan-error",
      error: `Failed to load scan history: ${error}`,
    });
  }
}

/**
 * Handle clear history
 */
async function handleClearHistory() {
  try {
    await db.clear();

    sendToUI({
      type: "all-scans",
      scans: [],
    });
  } catch (error) {
    sendToUI({
      type: "scan-error",
      error: `Failed to clear history: ${error}`,
    });
  }
}


/**
 * Message handler from UI
 */
figma.ui.onmessage = async (msg: UIMessage) => {
  try {
    switch (msg.type) {
      case "select-component":
        await handleSelectComponent(msg.nodeId);
        break;

      case "start-scan":
        await handleStartScan(msg.config);
        break;

      case "cancel-scan":
        handleCancelScan();
        break;

      case "jump-to-node":
        await handleJumpToNode(msg.fileKey, msg.nodeId);
        break;

      case "export-results":
        await handleExport(msg.format, msg.sessionId);
        break;

      case "get-scan-results":
        await handleGetScanResults(msg.sessionId);
        break;

      case "get-all-scans":
        await handleGetAllScans();
        break;

      case "get-settings": {
        const settings = await loadSettings();
        sendToUI({ type: "settings-data", settings });
        break;
      }

      case "save-settings":
        await saveSettings(msg.settings);
        sendToUI({ type: "settings-saved", settings: msg.settings });
        break;

      case "get-project-id": {
        console.log("Backend: Received get-project-id request");
        // Try to get project ID from stored settings
        const settings = await loadSettings();
        console.log("Backend: Settings loaded:", settings);
        const projectId = settings.defaultProjectId;
        console.log("Backend: Project ID from settings:", projectId);
        
        if (projectId) {
          console.log("Backend: Sending project-id-detected to UI");
          sendToUI({ type: "project-id-detected", projectId });
        } else {
          console.log("Backend: No project ID found, sending error");
          // No stored project ID - need to prompt user for it
          sendToUI({
            type: "scan-error",
            error: "Please provide your project ID. You can find it in the Figma project URL: figma.com/files/TEAM_ID/PROJECT_ID/...",
          });
        }
        break;
      }

      case "clear-history":
        await handleClearHistory();
        break;

      default:
        console.warn("Unknown message type:", msg);
    }
  } catch (error) {
    sendToUI({
      type: "scan-error",
      error: `Unexpected error: ${error}`,
    });
  }
};

/**
 * Handle selection change in Figma
 */
figma.on("selectionchange", async () => {
  const selection = figma.currentPage.selection;

  if (selection.length === 1 && selection[0].type === "COMPONENT") {
    const component = selection[0] as ComponentNode;
    const componentInfo = extractMasterComponentInfo(component);

    // Export component as PNG thumbnail
    let thumbnailData: string | null = null;
    try {
      console.log("Exporting thumbnail for:", component.name);
      const imageBytes = await component.exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: 2 },
      });
      const base64 = figma.base64Encode(imageBytes);
      thumbnailData = `data:image/png;base64,${base64}`;
      console.log("Thumbnail exported successfully, size:", imageBytes.length, "bytes");
    } catch (error) {
      console.error("Failed to export component thumbnail:", error);
    }

    sendToUI({
      type: "component-selected",
      component: componentInfo,
      thumbnail: thumbnailData,
    });
  }
});

// Initialize: Load last scan on startup
(async () => {
  const lastScan = await db.getLastScan();
  if (lastScan) {
    sendToUI({
      type: "scan-results",
      result: lastScan,
    });
  }
})();
