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

    try {
      for (let i = 0; i < fileKeys.length; i++) {
        const fileKey = fileKeys[i];

        console.log(`ScanEngine: Scanning file ${i + 1}/${fileKeys.length}, key: ${fileKey}`);

        this.reportProgress({
          stage: "scanning",
          message: `Fetching file ${i + 1}/${fileKeys.length}...`,
          currentFile: fileKey,
          currentFileIndex: i,
          totalFiles: fileKeys.length,
        });

        const res = await fetch(`https://api.figma.com/v1/files/${fileKey}` as string, {
          method: "GET",
          headers,
        });

        console.log(`ScanEngine: File ${fileKey} fetch response:`, res.status);

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Failed to fetch file ${fileKey}: HTTP ${res.status} - ${errorText}`);
        }

        const fileJson: any = await res.json();
        console.log(`ScanEngine: File ${fileKey} name:`, fileJson.name);

        const beforeCount = this.records.length;
        await this.scanFileJsonInternal(fileJson, fileKey);
        const afterCount = this.records.length;
        console.log(`ScanEngine: File ${fileKey} scan complete. Found ${afterCount - beforeCount} instances in this file`);
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

    this.reportProgress({
      stage: "complete",
      message: `External scan complete! Found ${this.records.length} instances.`,
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
      
      // Log first 20 nodes of each type to see what we're traversing
      if (queue.length % 100 === 0) {
        console.log(`ScanEngine: Traversing node type: ${currentNode.type}, name: ${currentNode.name}`);
      }

      if (this.masterComponent && currentNode.type === "INSTANCE") {
        // Log first instance structure to see all available fields
        if (this.records.length === 0) {
          console.log("🔍 FIRST INSTANCE IN EXTERNAL FILE - Full structure:");
          console.log(JSON.stringify(currentNode, null, 2));
        }
        
        // REST API exposes component reference in the componentId field
        const componentId = currentNode.componentId;
        
        if (!componentId) {
          console.log(`⚠️ INSTANCE "${currentNode.name}" has no componentId - skipping`);
          console.log("   Available fields:", Object.keys(currentNode));
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
        
        // Debug: Log first few instances to verify the data
        if (this.records.length < 5) {
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          console.log(`📍 Checking INSTANCE: "${currentNode.name}" (file: ${fileKey})`);
          console.log(`   Instance name: "${currentNode.name}"`);
          console.log(`   Master component name: "${this.masterComponent.name}"`);
          console.log(`   componentId from API: "${cidStr}"`);
          console.log(`   Component key for this ID: "${componentKeyForThisId || 'N/A'}"`);
          console.log(`   masterKey selected:   "${String(masterKey).trim()}"`);
          console.log(`   masterId selected:    "${String(masterId).trim()}"`);
          console.log(`   Local node ID for master key: "${localNodeIdForMasterKey || 'N/A'}"`);
          console.log(`   Match by key: ${matchesByKey}`);
          console.log(`   Match by ID: ${matchesById}`);
          console.log(`   Match by forward lookup: ${matchesByForwardLookup}`);
          console.log(`   Match by component lookup: ${matchesByComponentLookup}`);
          console.log(`   Match by name: ${matchesByName}`);
          console.log(`   FINAL MATCH: ${matches}`);
          console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        }

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
      console.log("📦 File has components metadata:");
      console.log("   Total components:", Object.keys(fileJson.components).length);
      
      // Build both forward and reverse mappings
      for (const [key, componentData] of Object.entries(fileJson.components)) {
        const data = componentData as any;
        const nodeId = data.node_id || data.nodeId;
        if (nodeId) {
          this.componentKeyToNodeIdMap.set(key, nodeId);
          this.nodeIdToKeyMap.set(nodeId, key);
        }
      }
      
      console.log("   Built component maps:");
      console.log("      Key → Node ID entries:", this.componentKeyToNodeIdMap.size);
      console.log("      Node ID → Key entries:", this.nodeIdToKeyMap.size);
      
      // Check if our master component key exists in this file
      if (this.masterComponent && fileJson.components[this.masterComponent.key]) {
        const componentInfo = fileJson.components[this.masterComponent.key] as any;
        const localNodeId = componentInfo.node_id || componentInfo.nodeId;
        console.log("   ✅ FOUND master component in this file's components:");
        console.log("      Key:", this.masterComponent.key);
        console.log("      Node ID in this file:", localNodeId);
        console.log("      Name:", componentInfo.name);
      } else {
        console.log("   ❌ Master component key NOT found in this file's components");
        console.log("      This means the component is not defined in this file");
        console.log("      (instances might reference it from another file/library)");
      }
    }

    console.log(`ScanEngine: Scanning file "${fileName}" (${fileKey}) with ${pages.length} pages`);

    this.reportProgress({
      stage: "scanning",
      message: `Scanning ${pages.length} pages in "${fileName}"`,
      totalPages: pages.length,
    });

    for (let i = 0; i < pages.length; i++) {
      if (this.aborted) break;
      const page = pages[i];

      console.log(`ScanEngine: Scanning page "${page.name}" in file "${fileName}"`);

      this.reportProgress({
        message: `Scanning page "${page.name}" (${i + 1}/${pages.length})`,
        currentPage: page.name,
        currentPageIndex: i,
        totalPages: pages.length,
      });

      if (page.children) {
        console.log(`ScanEngine: Page "${page.name}" has ${page.children.length} children`);
        for (const child of page.children) {
          await this.traverseJsonNode(
            child,
            fileKey,
            fileName,
            page.name,
            page.id
          );
        }
      } else {
        console.log(`ScanEngine: Page "${page.name}" has no children!`);
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
