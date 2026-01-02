/**
 * PDF Export Utility
 *
 * This utility provides functions for exporting HTML content to PDF
 * using the browser's built-in printing capabilities.
 */

/**
 * Generate a PDF from HTML content
 * @param html The HTML content to convert to PDF
 * @param filename The filename for the PDF (without extension)
 * @param title The title to show in the print dialog and document
 */
export function generatePDF(
  html: string,
  filename: string,
  title: string
): void {
  // Create a new window for printing
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    throw new Error(
      "Failed to open print window. Please disable popup blocker and try again."
    );
  }

  // Add enhanced styles for better PDF output
  const styles = `
    @page {
      size: A4;
      margin: 1.5cm;
    }
    body {
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.5;
      color: #333;
      max-width: 100%;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1em;
      margin-bottom: 0.5em;
      page-break-after: avoid;
      color: #000;
    }
    h1 { font-size: 24pt; }
    h2 { font-size: 20pt; }
    h3 { font-size: 16pt; }
    p { margin-bottom: 0.8em; }
    
    img {
      max-width: 100%;
      height: auto;
      page-break-inside: avoid;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      page-break-inside: avoid;
      margin: 1em 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    th {
      background-color: #f2f2f2;
      font-weight: bold;
    }
    a {
      color: #1a73e8;
      text-decoration: underline;
    }
    blockquote {
      border-left: 4px solid #ccc;
      padding-left: 15px;
      margin-left: 0;
      color: #666;
    }
    code {
      font-family: monospace;
      background-color: #f5f5f5;
      padding: 2px 4px;
      border-radius: 3px;
    }
    pre {
      background-color: #f5f5f5;
      padding: 15px;
      border-radius: 5px;
      overflow-x: auto;
      page-break-inside: avoid;
    }
    ul, ol {
      padding-left: 20px;
    }
    li {
      margin-bottom: 0.5em;
    }
    
    /* Controls for the PDF export UI */
    .pdf-controls {
      position: fixed;
      top: 10px;
      right: 10px;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 8px 15px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .pdf-controls button {
      background: #1a73e8;
      color: white;
      border: none;
      padding: 8px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
    }
    .pdf-controls button:hover {
      background: #0d62d1;
    }
    
    @media print {
      .pdf-controls {
        display: none;
      }
      body {
        padding: 0;
      }
    }
  `;

  // Write the HTML content to the window
  printWindow.document.open();
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title || filename}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>${styles}</style>
      </head>
      <body>
        <div class="pdf-controls">
          <button id="print-button">Save as PDF</button>
        </div>
        ${html}
        <script>
          // Auto-trigger print after a short delay
          setTimeout(function() {
            document.getElementById('print-button').addEventListener('click', function() {
              window.print();
            });
          }, 300);
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();

  // Set window title
  printWindow.document.title = title || filename;
}

/**
 * Generate a file name for the PDF based on a title
 * @param title The title to base the filename on
 * @returns A sanitized filename with .pdf extension
 */
export function generatePdfFilename(title: string): string {
  // Sanitize the title for use as a filename
  let filename = title || "document";

  // Replace invalid filename characters
  filename = filename
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();

  return `${filename}.pdf`;
}
