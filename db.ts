// ============================================================================
// LOCAL STORAGE DATABASE LAYER
// ============================================================================

import type { PluginStorage, ScanResult } from "./types";

const STORAGE_KEY = "component-usage-explorer-db";
const MAX_STORED_SCANS = 50;

/**
 * Database class for managing plugin storage
 */
export class PluginDB {
  private cache: PluginStorage | null = null;

  /**
   * Initialize the database with default values
   */
  private getDefaultStorage(): PluginStorage {
    return {
      scans: {},
      lastScanId: null,
      settings: {
        autoSaveScans: true,
        maxStoredScans: MAX_STORED_SCANS,
      },
    };
  }

  /**
   * Load storage from Figma clientStorage
   */
  async load(): Promise<PluginStorage> {
    if (this.cache) {
      return this.cache;
    }

    try {
      const data = await figma.clientStorage.getAsync(STORAGE_KEY);
      this.cache = (data as PluginStorage) || this.getDefaultStorage();
      return this.cache;
    } catch (error) {
      console.error("Failed to load storage:", error);
      this.cache = this.getDefaultStorage();
      return this.cache;
    }
  }

  /**
   * Save storage to Figma clientStorage
   */
  async save(storage: PluginStorage): Promise<void> {
    try {
      await figma.clientStorage.setAsync(STORAGE_KEY, storage);
      this.cache = storage;
    } catch (error) {
      console.error("Failed to save storage:", error);
      throw error;
    }
  }

  /**
   * Get a specific scan result by session ID
   */
  async getRecord(sessionId: string): Promise<ScanResult | null> {
    const storage = await this.load();
    return storage.scans[sessionId] || null;
  }

  /**
   * Set/update a scan result
   */
  async setRecord(result: ScanResult): Promise<void> {
    const storage = await this.load();
    
    // Add new record
    storage.scans[result.sessionId] = result;
    storage.lastScanId = result.sessionId;

    // Enforce max scans limit
    const scanIds = Object.keys(storage.scans);
    if (scanIds.length > storage.settings.maxStoredScans) {
      // Remove oldest scans
      const sorted = scanIds
        .map((id) => ({ id, timestamp: storage.scans[id].timestamp }))
        .sort((a, b) => a.timestamp - b.timestamp);

      const toRemove = sorted.slice(0, scanIds.length - storage.settings.maxStoredScans);
      toRemove.forEach((item) => {
        delete storage.scans[item.id];
      });
    }

    await this.save(storage);
  }

  /**
   * Get all scan results
   */
  async getAll(): Promise<ScanResult[]> {
    const storage = await this.load();
    return Object.values(storage.scans).sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get last scan result
   */
  async getLastScan(): Promise<ScanResult | null> {
    const storage = await this.load();
    if (!storage.lastScanId) {
      return null;
    }
    return storage.scans[storage.lastScanId] || null;
  }

  /**
   * Clear all scan history
   */
  async clear(): Promise<void> {
    const storage = this.getDefaultStorage();
    await this.save(storage);
  }

  /**
   * Get metadata (settings)
   */
  async getSettings() {
    const storage = await this.load();
    return storage.settings;
  }

  /**
   * Update settings
   */
  async updateSettings(settings: Partial<PluginStorage["settings"]>): Promise<void> {
    const storage = await this.load();
    storage.settings = Object.assign({}, storage.settings, settings);
    await this.save(storage);
  }

  /**
   * Delete a specific scan
   */
  async deleteScan(sessionId: string): Promise<void> {
    const storage = await this.load();
    delete storage.scans[sessionId];
    
    if (storage.lastScanId === sessionId) {
      const remaining = Object.keys(storage.scans);
      if (remaining.length > 0) {
        // Set the most recent scan as last
        const sorted = remaining
          .map((id) => ({ id, timestamp: storage.scans[id].timestamp }))
          .sort((a, b) => b.timestamp - a.timestamp);
        storage.lastScanId = sorted[0].id;
      } else {
        storage.lastScanId = null;
      }
    }

    await this.save(storage);
  }

  /**
   * Get storage statistics
   */
  async getStats() {
    const storage = await this.load();
    const scanIds = Object.keys(storage.scans);
    
    return {
      totalScans: scanIds.length,
      totalInstances: Object.values(storage.scans).reduce(
        (sum, scan) => sum + scan.totalInstances,
        0
      ),
      oldestScan: scanIds.length > 0
        ? Math.min.apply(null, Object.values(storage.scans).map((s) => s.timestamp))
        : null,
      newestScan: scanIds.length > 0
        ? Math.max.apply(null, Object.values(storage.scans).map((s) => s.timestamp))
        : null,
    };
  }
}

// Export singleton instance
export const db = new PluginDB();
