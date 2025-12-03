// Simple Figma Plugin - Component Usage Explorer
// All-in-one file for Figma compatibility
/// <reference types="@figma/plugin-typings" />

console.log("Component Usage Explorer plugin loaded");

figma.showUI(__html__, { width: 800, height: 600, title: "Component Usage Explorer" });

console.log("UI shown, current selection:", figma.currentPage.selection.length, "items");

// Send message to UI
function sendToUI(message: any) {
  console.log("Sending to UI:", message.type, message);
  figma.ui.postMessage(message);
  console.log("Message sent");
}

// Handle selection change
figma.on("selectionchange", () => {
  const selection = figma.currentPage.selection;
  
  console.log("Selection changed:", selection.length, "items");
  
  if (selection.length === 1) {
    const node = selection[0];
    console.log("Selected node type:", node.type, "name:", node.name);
    
    if (node.type === "COMPONENT") {
      const component = node as ComponentNode;
      
      console.log("Component detected:", component.name, "key:", component.key);
      
      sendToUI({
        type: "component-selected",
        component: {
          id: component.id,
          key: component.key,
          name: component.name,
          isRemote: component.remote || false,
          sessionId: `scan-${Date.now()}`,
        },
      });
    } else if (node.type === "INSTANCE") {
      // User selected an instance - show helpful message
      const instance = node as InstanceNode;
      console.log("Instance selected - need to select master component instead");
      
      sendToUI({
        type: "instance-selected",
        message: `You selected an instance "${instance.name}". Please select the master component (blue/diamond icon) or right-click this instance → "Go to Main Component"`,
      });
    } else {
      console.log("Not a component - type is:", node.type);
      
      sendToUI({
        type: "wrong-selection",
        message: `Please select a master component (not ${node.type})`,
      });
    }
  } else {
    console.log("Multiple or no items selected");
  }
});

// Handle messages from UI
figma.ui.onmessage = async (msg) => {
  console.log("Plugin received message:", msg.type);
  
  if (msg.type === "ui-ready") {
    // UI is loaded, check current selection
    console.log("UI ready, checking current selection...");
    const selection = figma.currentPage.selection;
    
    if (selection.length === 1) {
      const node = selection[0];
      console.log("Current selection:", node.type, node.name);
      
      if (node.type === "COMPONENT") {
        const component = node as ComponentNode;
        console.log("Sending component to UI:", component.name);
        sendToUI({
          type: "component-selected",
          component: {
            id: component.id,
            key: component.key,
            name: component.name,
            isRemote: component.remote || false,
            sessionId: `scan-${Date.now()}`,
          },
        });
      } else if (node.type === "INSTANCE") {
        const instance = node as InstanceNode;
        sendToUI({
          type: "instance-selected",
          message: `You selected an instance "${instance.name}". Please select the master component (purple diamond with 4 squares) or right-click this instance → "Go to Main Component"`,
        });
      }
    }
  } else if (msg.type === "start-scan") {
    try {
      const { masterComponent } = msg.config;
      
      sendToUI({
        type: "scan-progress",
        progress: {
          stage: "scanning",
          message: "Starting scan...",
          instancesFound: 0,
        },
      });
      
      const records: any[] = [];
      const startTime = Date.now();
      
      // Scan current file
      const pages = figma.root.children;
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const page = pages[pageIndex];
        
        sendToUI({
          type: "scan-progress",
          progress: {
            stage: "scanning",
            message: `Scanning page "${page.name}" (${pageIndex + 1}/${pages.length})`,
            currentPage: page.name,
            currentPageIndex: pageIndex,
            totalPages: pages.length,
            instancesFound: records.length,
          },
        });
        
        // BFS traversal
        const queue: any[] = page.children.map((child: any) => ({
          node: child,
          path: [page.name, child.name],
        }));
        
        while (queue.length > 0) {
          const { node, path } = queue.shift()!;
          
          // Check if it's an instance of our component
          if (node.type === "INSTANCE") {
            // Modern Figma API: use getMainComponentAsync instead of mainComponent
            const mainComp = await (node as InstanceNode).getMainComponentAsync();

            if (mainComp && (mainComp.id === masterComponent.id || mainComp.key === masterComponent.key)) {
              const isNested = path.length > 2;
              const isRemote = mainComp.remote || false;
              
              let variant = null;
              if (node.variantProperties) {
                variant = Object.entries(node.variantProperties)
                  .map(([k, v]) => `${k}=${v}`)
                  .join(", ");
              }
              
              records.push({
                id: `${figma.fileKey || "current"}-${node.id}-${Date.now()}`,
                fileName: figma.root.name,
                fileKey: figma.fileKey || "current-file",
                pageName: page.name,
                pageId: page.id,
                nodeName: node.name,
                nodeId: node.id,
                instanceType: isNested ? "nested" : isRemote ? "remote" : "direct",
                path: path,
                variant: variant,
                timestamp: Date.now(),
              });
              
              // Report progress every 10 instances
              if (records.length % 10 === 0) {
                sendToUI({
                  type: "scan-progress",
                  progress: {
                    stage: "scanning",
                    message: `Found ${records.length} instances...`,
                    instancesFound: records.length,
                  },
                });
              }
            }
          }
          
          // Add children to queue
          if ("children" in node) {
            for (const child of node.children) {
              queue.push({
                node: child,
                path: [...path, child.name],
              });
            }
          }
          
          // Yield occasionally to prevent blocking
          if (queue.length % 100 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
        }
      }
      
      const scanDuration = Date.now() - startTime;
      
      sendToUI({
        type: "scan-complete",
        result: {
          sessionId: masterComponent.sessionId,
          masterComponent: masterComponent,
          totalInstances: records.length,
          records: records,
          scanDuration: scanDuration,
          timestamp: Date.now(),
          errors: [],
        },
      });
    } catch (error) {
      sendToUI({
        type: "scan-error",
        error: `Scan failed: ${error}`,
      });
    }
  } else if (msg.type === "jump-to-node") {
    try {
      const node = await figma.getNodeByIdAsync(msg.nodeId);
      
      if (node) {
        // Navigate to page
        let current: any = node.parent;
        while (current && current.type !== "PAGE") {
          current = current.parent;
        }
        if (current && current.type === "PAGE") {
          figma.currentPage = current as PageNode;
        }
        
        // Zoom to node
        figma.viewport.scrollAndZoomIntoView([node]);
        figma.currentPage.selection = [node as SceneNode];
        
        sendToUI({ type: "node-highlighted", success: true });
      } else {
        sendToUI({ type: "scan-error", error: "Node not found" });
      }
    } catch (error) {
      sendToUI({ type: "scan-error", error: `Failed to jump to node: ${error}` });
    }
  } else if (msg.type === "export-results") {
    // Simple export - just send the data back
    sendToUI({
      type: "export-ready",
      format: msg.format,
      data: "Export functionality requires full implementation",
    });
  }
};
