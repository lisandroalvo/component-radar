// ============================================================================
// EXPORT MODULE - JSON, CSV, HTML EXPORTERS
// ============================================================================

import type { ScanResult, ComponentUsageRecord, ExportFormat } from "./types";

/**
 * Exporter class for generating various export formats
 */
export class Exporter {
  /**
   * Export scan results to JSON
   */
  static toJSON(result: ScanResult): string {
    return JSON.stringify(result, null, 2);
  }

  /**
   * Export scan results to CSV
   */
  static toCSV(result: ScanResult): string {
    const headers = [
      "File Name",
      "File Key",
      "Page Name",
      "Node Name",
      "Node ID",
      "Instance Type",
      "Variant",
      "Path",
    ];

    const rows = result.records.map((record) => [
      record.fileName,
      record.fileKey,
      record.pageName,
      record.nodeName,
      record.nodeId,
      record.instanceType,
      record.variant || "",
      record.path.join(" > "),
    ]);

    const csvLines = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ];

    return csvLines.join("\n");
  }

  /**
   * Export scan results to HTML summary
   */
  static toHTML(result: ScanResult): string {
    const grouped = this.groupByFile(result.records);

    const fileBlocks = Array.from(grouped.entries())
      .map(([fileName, records]) => {
        const instanceList = records
          .map(
            (r) => `
          <tr>
            <td>${r.pageName}</td>
            <td>${r.nodeName}</td>
            <td><code>${r.nodeId}</code></td>
            <td><span class="badge badge-${r.instanceType}">${r.instanceType}</span></td>
            <td>${r.variant || "-"}</td>
            <td><small>${r.path.join(" > ")}</small></td>
          </tr>
        `
          )
          .join("");

        return `
        <div class="file-section">
          <h2>📁 ${fileName} <span class="count">${records.length} instances</span></h2>
          <table>
            <thead>
              <tr>
                <th>Page</th>
                <th>Node Name</th>
                <th>Node ID</th>
                <th>Type</th>
                <th>Variant</th>
                <th>Path</th>
              </tr>
            </thead>
            <tbody>
              ${instanceList}
            </tbody>
          </table>
        </div>
      `;
      })
      .join("");

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Component Usage Report - ${result.masterComponent.name}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: #f5f5f5;
      color: #333;
      padding: 40px 20px;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      padding: 40px;
    }
    .header {
      border-bottom: 2px solid #0d99ff;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    h1 {
      font-size: 32px;
      color: #18a0fb;
      margin-bottom: 10px;
    }
    .meta {
      display: flex;
      gap: 30px;
      flex-wrap: wrap;
      color: #666;
      font-size: 14px;
    }
    .meta-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .meta-label {
      font-weight: 600;
    }
    .summary {
      background: #f9fafb;
      padding: 20px;
      border-radius: 6px;
      margin-bottom: 30px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
    }
    .stat {
      text-align: center;
    }
    .stat-value {
      font-size: 36px;
      font-weight: 700;
      color: #18a0fb;
      display: block;
    }
    .stat-label {
      color: #666;
      font-size: 14px;
      margin-top: 5px;
    }
    .file-section {
      margin-bottom: 40px;
    }
    h2 {
      font-size: 20px;
      color: #333;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .count {
      background: #18a0fb;
      color: white;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th {
      background: #f9fafb;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      font-size: 13px;
      color: #666;
      border-bottom: 2px solid #e5e7eb;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
      font-size: 14px;
    }
    tr:hover {
      background: #f9fafb;
    }
    code {
      background: #f3f4f6;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 12px;
      color: #6366f1;
    }
    .badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .badge-direct {
      background: #d1fae5;
      color: #065f46;
    }
    .badge-nested {
      background: #dbeafe;
      color: #1e40af;
    }
    .badge-remote {
      background: #fef3c7;
      color: #92400e;
    }
    small {
      color: #999;
      font-size: 12px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #999;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Component Usage Report</h1>
      <div class="meta">
        <div class="meta-item">
          <span class="meta-label">Component:</span>
          <span>${result.masterComponent.name}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Scan Date:</span>
          <span>${new Date(result.timestamp).toLocaleString()}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Duration:</span>
          <span>${(result.scanDuration / 1000).toFixed(2)}s</span>
        </div>
      </div>
    </div>

    <div class="summary">
      <div class="stat">
        <span class="stat-value">${result.totalInstances}</span>
        <span class="stat-label">Total Instances</span>
      </div>
      <div class="stat">
        <span class="stat-value">${grouped.size}</span>
        <span class="stat-label">Files</span>
      </div>
      <div class="stat">
        <span class="stat-value">${new Set(result.records.map((r) => r.pageId)).size}</span>
        <span class="stat-label">Pages</span>
      </div>
    </div>

    ${fileBlocks}

    <div class="footer">
      Generated by Component Usage Explorer • ${new Date().toLocaleString()}
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Group records by file name
   */
  private static groupByFile(records: ComponentUsageRecord[]): Map<string, ComponentUsageRecord[]> {
    const grouped = new Map<string, ComponentUsageRecord[]>();

    records.forEach((record) => {
      const existing = grouped.get(record.fileName) || [];
      existing.push(record);
      grouped.set(record.fileName, existing);
    });

    return grouped;
  }

  /**
   * Export in the specified format
   */
  static export(result: ScanResult, format: ExportFormat): string {
    switch (format) {
      case "json":
        return this.toJSON(result);
      case "csv":
        return this.toCSV(result);
      case "html":
        return this.toHTML(result);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Get file extension for format
   */
  static getExtension(format: ExportFormat): string {
    return format;
  }

  /**
   * Get MIME type for format
   */
  static getMimeType(format: ExportFormat): string {
    switch (format) {
      case "json":
        return "application/json";
      case "csv":
        return "text/csv";
      case "html":
        return "text/html";
      default:
        return "text/plain";
    }
  }
}
