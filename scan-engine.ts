// ============================================================================
// SCAN ENGINE - BFS TRAVERSAL & CROSS-FILE SCANNING
// ============================================================================

import type {
  MasterComponentInfo,
  ComponentUsageRecord,
  NodeClassification,
  ScanProgress,
} from "./types";

// Minimal shape of nodes returned by the Figma REST API
interface JsonNode {
  id: string;
  name: string;
  type: string;
  children?: JsonNode[];
  // For instances, REST API exposes the main component reference
  componentId?: string;
  // Component properties (only present on COMPONENT nodes)
  componentProperties?: any;
  // Additional fields that might help identify cross-file references
  [key: string]: any;
}

/**
 * Core scanning engine using BFS traversal
 */
export class ScanEngine {
  private masterComponent: MasterComponentInfo | null = null;
  private records: ComponentUsageRecord[] = [];
  private aborted = false;
  private progressCallback: ((progress: ScanProgress) => void) | null = null;
  private componentKeyToNodeIdMap: Map<string, string> = new Map(); // Maps component key to local node ID
  private nodeIdToKeyMap: Map<string, string> = new Map(); // Reverse map: node ID to component key

  /**
   * Set the progress callback
   */
  onProgress(callback: (progress: ScanProgress) => void) {
    this.progressCallback = callback;
  }

  /**
   * Report progress to UI
   */
  private reportProgress(progress: Partial<ScanProgress>) {
    if (this.progressCallback) {
      this.progressCallback(Object.assign({
        stage: progress.stage || "scanning",
        instancesFound: this.records.length,
        message: progress.message || "",
      }, progress));
    }
  }

  /**
   * Abort the current scan
   */
  abort() {
    this.aborted = true;
  }

  /**
   * Reset the engine state
   */
  reset() {
    this.masterComponent = null;
    this.records = [];
    this.aborted = false;
  }

  /**
   * Classify a node to determine if it's an instance of the master component
   */
  private async classifyNode(node: SceneNode, path: string[]): Promise<NodeClassification | null> {
    if (!this.masterComponent) {
      return null;
    }

    // Check if node is a component instance
    if (node.type !== "INSTANCE") {
      return null;
    }

    const instance = node as InstanceNode;
    const mainComponent = await instance.getMainComponentAsync();

    if (!mainComponent) {
      return null;
    }

    // Check if this instance matches our master component
    const isDirect = mainComponent.id === this.masterComponent.id;
    const isSameKey = mainComponent.key === this.masterComponent.key;

    // Debug logging for first few instances in current file scan
    if (this.records.length < 3) {
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`📍 CURRENT FILE: Checking INSTANCE "${node.name}"`);
      console.log(`   mainComponent.id:  "${mainComponent.id}"`);
      console.log(`   mainComponent.key: "${mainComponent.key}"`);
      console.log(`   masterComponent.id:  "${this.masterComponent.id}"`);
      console.log(`   masterComponent.key: "${this.masterComponent.key}"`);
      console.log(`   Match by ID: ${isDirect}, Match by Key: ${isSameKey}`);
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    }

    if (!isDirect && !isSameKey) {
      return null;
    }

    // Determine instance type
    const isNested = path.length > 1;
    const isRemote = mainComponent.remote || false;

    // Extract variant properties if any
    let variant: string | null = null;
    if (instance.variantProperties) {
      variant = Object.entries(instance.variantProperties)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ");
    }

    return {
      isInstance: true,
      isDirect,
      isNested,
      isRemote,
      masterComponentKey: mainComponent.key,
      variant,
    };
  }

  /**
   * BFS traversal of a node tree
   */
  private async traverseNode(
    node: SceneNode,
    fileKey: string,
    fileName: string,
    pageName: string,
    pageId: string,
    parentPath: string[] = []
  ): Promise<void> {
    if (this.aborted) {
      return;
    }

    const queue: Array<{ node: SceneNode; path: string[] }> = [
      { node, path: parentPath.concat([node.name]) },
    ];

    while (queue.length > 0 && !this.aborted) {
      const { node: currentNode, path } = queue.shift()!;

      // Classify the current node
      const classification = await this.classifyNode(currentNode, path);

      if (classification && classification.isInstance) {
        // Found an instance! Create a record
        const record: ComponentUsageRecord = {
          id: `${fileKey}-${currentNode.id}-${Date.now()}`,
          fileName,
          fileKey,
          pageName,
          pageId,
          nodeName: currentNode.name,
          nodeId: currentNode.id,
          instanceType: classification.isNested
            ? "nested"
            : classification.isRemote
            ? "remote"
            : "direct",
          path,
          variant: classification.variant || null,
          timestamp: Date.now(),
        };

        this.records.push(record);

        // Report progress every 10 instances
        if (this.records.length % 10 === 0) {
          this.reportProgress({
            message: `Found ${this.records.length} instances...`,
          });
        }
      }

      // Queue children for BFS traversal
      if ("children" in currentNode) {
        const children = (currentNode as FrameNode | GroupNode | ComponentNode).children;
        for (const child of children) {
          queue.push({
            node: child,
            path: path.concat([child.name]),
          });
        }
      }

      // Yield to prevent blocking
      if (queue.length % 100 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  /**
   * Scan a single page
   */
  private async scanPage(
    page: PageNode,
    fileKey: string,
    fileName: string,
    pageIndex: number,
    totalPages: number
  ): Promise<void> {
    if (this.aborted) {
      return;
    }

    this.reportProgress({
      message: `Scanning page "${page.name}" (${pageIndex + 1}/${totalPages})`,
      currentPage: page.name,
      currentPageIndex: pageIndex,
      totalPages,
    });

    for (const child of page.children) {
      await this.traverseNode(child, fileKey, fileName, page.name, page.id);
    }
  }

  /**
   * Scan the current Figma file
   */
  async scanCurrentFile(masterComponent: MasterComponentInfo): Promise<ComponentUsageRecord[]> {
    this.reset();
    this.masterComponent = masterComponent;

    this.reportProgress({
      stage: "initializing",
      message: "Initializing scan of current file...",
    });

    // Load all pages before accessing them
    await figma.loadAllPagesAsync();

    const fileName = figma.root.name;
    const fileKey = figma.fileKey || "current-file";
    const pages = figma.root.children;

    this.reportProgress({
      stage: "scanning",
      message: `Scanning ${pages.length} pages in "${fileName}"`,
      totalPages: pages.length,
    });

    for (let i = 0; i < pages.length; i++) {
      if (this.aborted) {
        break;
      }
      await this.scanPage(pages[i], fileKey, fileName, i, pages.length);
    }

    this.reportProgress({
      stage: "complete",
      message: `Scan complete! Found ${this.records.length} instances.`,
    });

    return this.records;
  }

  /**
   * Scan external files via REST API using JSON documents
   */
  async scanExternalFiles(
    masterComponent: MasterComponentInfo,
    fileKeys: string[],
    accessToken?: string
  ): Promise<ComponentUsageRecord[]> {
    this.reset();
    this.masterComponent = masterComponent;

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("🔍 STARTING EXTERNAL FILE SCAN");
    console.log("   Master Component ID:", masterComponent.id);
    console.log("   Master Component Key:", masterComponent.key);
    console.log("   Is Remote (Library):", masterComponent.isRemote);
    console.log("   Library Name:", masterComponent.libraryName);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    this.reportProgress({
      stage: "initializing",
      message: `Preparing to scan ${fileKeys.length} external files...`,
      totalFiles: fileKeys.length,
    });

    if (!accessToken) {
      throw new Error(
        "External file scanning requires API token. Please configure it in plugin settings."
      );
    }

    const headers = { "X-Figma-Token": accessToken } as const;
    let skippedFiles = 0;
    const BATCH_SIZE = 10; // Fetch 10 files at a time (balanced for speed vs rate limits)

    try {
      // Process files in batches for parallel fetching
      for (let batchStart = 0; batchStart < fileKeys.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, fileKeys.length);
        const batch = fileKeys.slice(batchStart, batchEnd);
        
        // Fetch all files in this batch in parallel
        this.reportProgress({
          stage: "scanning",
          message: `Fetching files ${batchStart + 1}-${batchEnd}/${fileKeys.length}...`,
          totalFiles: fileKeys.length,
        });
        
        const fetchPromises = batch.map(async (fileKey, batchIndex) => {
          const globalIndex = batchStart + batchIndex;

          // Add geometry=paths to reduce response size (we don't need detailed vector data)
          const res = await fetch(`https://api.figma.com/v1/files/${fileKey}?geometry=paths` as string, {
            method: "GET",
            headers,
          });
          
          return { fileKey, globalIndex, res };
        });
        
        // Wait for all files in batch to be fetched
        const results = await Promise.all(fetchPromises);
        
        // Process each result
        for (const { fileKey, globalIndex, res } of results) {
          const i = globalIndex;

        if (!res.ok) {
          const errorText = await res.text();
          
          // Skip problematic files instead of failing entire scan
          if (res.status === 400 || res.status === 404 || res.status === 403 || res.status === 429) {
            let reason = 'error';
            if (res.status === 404) {
              reason = 'file not found (deleted)';
            } else if (res.status === 403) {
              reason = 'access denied';
            } else if (res.status === 429) {
              reason = 'rate limit - try reducing scan scope';
            } else if (errorText.includes('too large')) {
              reason = 'too large';
            } else if (errorText.includes('File type not supported')) {
              reason = 'unsupported type';
            }
            
            console.warn(`⚠️ Skipping file ${fileKey}: ${reason}`);
            skippedFiles++;
            
            // Report progress even for skipped files
            this.reportProgress({
              stage: "scanning",
              message: `Skipped file ${i + 1}/${fileKeys.length} (${reason})`,
              currentFileIndex: i,
              totalFiles: fileKeys.length,
            });
            
            continue; // Skip this file and move to the next one
          }
          
          throw new Error(`Failed to fetch file ${fileKey}: HTTP ${res.status} - ${errorText}`);
        }

        let fileJson: any;
        try {
          const responseText = await res.text();
          fileJson = JSON.parse(responseText);
        } catch (jsonError) {
          console.error(`ScanEngine: JSON parse error for file ${fileKey}:`, jsonError);
          throw new Error(`Failed to parse response for file ${fileKey}. The file might be too large or the response is incomplete.`);
        }

        await this.scanFileJsonInternal(fileJson, fileKey);
        
        // Report progress after each file is processed
        this.reportProgress({
          stage: "scanning",
          message: `Scanned file ${i + 1}/${fileKeys.length}... [${i + 1}s]`,
          currentFileIndex: i,
          totalFiles: fileKeys.length,
        });
        }
        
        // Add small delay between batches to avoid rate limiting
        if (batchEnd < fileKeys.length) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
        ? error 
        : JSON.stringify(error);
      
      console.error("ScanEngine: External file scan error:", error);
      throw new Error(errorMessage);
    }

    const scannedFiles = fileKeys.length - skippedFiles;
    const skippedMessage = skippedFiles > 0 
      ? ` (${skippedFiles} file${skippedFiles > 1 ? 's' : ''} skipped)` 
      : '';
    
    this.reportProgress({
      stage: "complete",
      message: `External scan complete! Found ${this.records.length} instances in ${scannedFiles}/${fileKeys.length} files${skippedMessage}.`,
    });

    return this.records;
  }

  /**
   * Traverse a JSON node tree from REST API (internal helper)
   */
  private async traverseJsonNode(
    node: JsonNode,
    fileKey: string,
    fileName: string,
    pageName: string,
    pageId: string,
    parentPath: string[] = []
  ): Promise<void> {
    if (this.aborted) return;

    const queue: Array<{ node: JsonNode; path: string[] }> = [
      { node, path: parentPath.concat([node.name]) },
    ];

    while (queue.length > 0 && !this.aborted) {
      const { node: currentNode, path } = queue.shift()!;
      
      if (this.masterComponent && currentNode.type === "INSTANCE") {
        // REST API exposes component reference in the componentId field
        const componentId = currentNode.componentId;
        
        if (!componentId) {
          continue;
        }
        
        const masterKey = this.masterComponent.key;
        const masterId = this.masterComponent.id;
        const cidStr = String(componentId).trim();
        
        // Strategy 1: Direct match by component key (for library components)
        const matchesByKey = cidStr === String(masterKey).trim();
        
        // Strategy 2: Match by node ID (for same file)
        const matchesById = cidStr === String(masterId).trim();
        
        // Strategy 3: Forward lookup - check if the componentId maps to our master key
        // This handles cases where componentId is a local node ID in this file
        let matchesByForwardLookup = false;
        const localNodeIdForMasterKey = this.componentKeyToNodeIdMap.get(masterKey);
        if (localNodeIdForMasterKey) {
          matchesByForwardLookup = cidStr === String(localNodeIdForMasterKey).trim();
        }
        
        // Strategy 4: Reverse lookup - check if the componentId resolves to our master key
        // This handles instances referencing components defined in this file by their local node ID
        let matchesByComponentLookup = false;
        const componentKeyForThisId = this.nodeIdToKeyMap.get(cidStr);
        if (componentKeyForThisId) {
          matchesByComponentLookup = componentKeyForThisId === String(masterKey).trim();
        }
        
        // Strategy 5: Name-based fallback matching for non-library components
        // When components are copied across files, they might have the same name but different IDs
        let matchesByName = false;
        if (currentNode.name === this.masterComponent.name) {
          // Additional validation: check if this looks like a component instance of the same type
          matchesByName = true;
        }
        
        const matches = matchesByKey || matchesById || matchesByForwardLookup || matchesByComponentLookup || matchesByName;

        if (matches) {
          const isNested = path.length > 1;

          const record: ComponentUsageRecord = {
            id: `${fileKey}-${currentNode.id}-${Date.now()}`,
            fileName,
            fileKey,
            pageName,
            pageId,
            nodeName: currentNode.name,
            nodeId: currentNode.id,
            instanceType: isNested ? "nested" : "direct",
            path,
            variant: null,
            timestamp: Date.now(),
          };

          this.records.push(record);

          if (this.records.length % 10 === 0) {
            this.reportProgress({
              message: `Found ${this.records.length} instances...`,
            });
          }
        }
      }

      if (currentNode.children && currentNode.children.length) {
        for (const child of currentNode.children) {
          queue.push({
            node: child,
            path: path.concat([child.name]),
          });
        }
      }

      if (queue.length % 200 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  /**
   * Scan a REST API file JSON (internal helper)
   */
  private async scanFileJsonInternal(fileJson: any, fileKey: string): Promise<void> {
    if (this.aborted) return;

    try {
      const fileName: string = fileJson.name || fileJson.document?.name || "Untitled";
      const pages: JsonNode[] = (fileJson.document?.children || []) as JsonNode[];
    
    // Build bidirectional maps of component keys to their local node IDs in this file
    this.componentKeyToNodeIdMap.clear();
    this.nodeIdToKeyMap.clear();
    
    if (fileJson.components) {
      // Build both forward and reverse mappings
      for (const [key, componentData] of Object.entries(fileJson.components)) {
        const data = componentData as any;
        const nodeId = data.node_id || data.nodeId;
        if (nodeId) {
          this.componentKeyToNodeIdMap.set(key, nodeId);
          this.nodeIdToKeyMap.set(nodeId, key);
        }
      }
    }

    this.reportProgress({
      stage: "scanning",
      message: `Scanning ${pages.length} pages in "${fileName}"`,
      totalPages: pages.length,
    });

    for (let i = 0; i < pages.length; i++) {
      if (this.aborted) break;
      const page = pages[i];

      if (page.children) {
        for (const child of page.children) {
          await this.traverseJsonNode(
            child,
            fileKey,
            fileName,
            page.name,
            page.id
          );
        }
      }
    }
    } catch (error) {
      const errorMessage = error instanceof Error 
        ? error.message 
        : typeof error === 'string' 
        ? error 
        : JSON.stringify(error);
      
      console.error(`ScanEngine: Error scanning file ${fileKey}:`, error);
      throw new Error(`Failed to scan file: ${errorMessage}`);
    }
  }

  /**
   * Get scan statistics
   */
  getStats() {
    const byFile = new Map<string, number>();
    const byType = new Map<string, number>();

    this.records.forEach((record) => {
      byFile.set(record.fileName, (byFile.get(record.fileName) || 0) + 1);
      byType.set(record.instanceType, (byType.get(record.instanceType) || 0) + 1);
    });

    return {
      total: this.records.length,
      byFile: Object.fromEntries(byFile),
      byType: Object.fromEntries(byType),
    };
  }
}
