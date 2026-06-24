import { jsPDF } from 'jspdf';

export const TRACKBOOK_BRANDING = {
  line1: "Powered by TrackBook, AI-Powered Expense Management",
  url: "https://trackbook.xyz",
};

/**
 * Adds the professional TrackBook branding footer to a jsPDF document page.
 * @param doc The jsPDF instance
 * @param pageNum Current page number
 * @param totalPages Total pages in the document
 * @param title Optional document title or book name to display in the footer
 */
export function addPdfBrandingFooter(doc: jsPDF, pageNum: number, totalPages: number, title?: string) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Save current state (font, colors) to restore after adding footer
  const originalFontSize = doc.getFontSize();
  const originalTextColor = doc.getTextColor();

  // 1. Draw thin, light gray divider line
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.1);
  doc.line(15, pageHeight - 22, pageWidth - 15, pageHeight - 22);

  // 2. Set font styling for branding line
  doc.setFontSize(7.5);
  doc.setTextColor(140, 140, 140); // small professional light gray font

  // 3. Center and render Line 1: "Powered by TrackBook, AI-Powered Expense Management"
  const line1Text = TRACKBOOK_BRANDING.line1;
  const line1Width = doc.getTextWidth(line1Text);
  const line1X = (pageWidth - line1Width) / 2;
  doc.text(line1Text, line1X, pageHeight - 17);

  // 4. Center and render Line 2: Clickable URL "https://trackbook.xyz"
  const urlText = TRACKBOOK_BRANDING.url;
  const urlWidth = doc.getTextWidth(urlText);
  const urlX = (pageWidth - urlWidth) / 2;
  
  // Use textWithLink for native, perfectly overlayed clickable hyperlink
  doc.setTextColor(79, 70, 229); // Modern Indigo color for the link to make it look clickable and premium
  doc.textWithLink(urlText, urlX, pageHeight - 12, { url: urlText });

  // 5. Draw the standard Page X of Y and Document title in a matching subtle style
  doc.setFontSize(7.5);
  doc.setTextColor(160, 160, 160);
  
  // Page number centered at the very bottom
  doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth / 2, pageHeight - 5, { align: 'center' });
  
  // Left side: Document Name
  if (title) {
    const cleanTitle = title.length > 30 ? title.substring(0, 30) + '...' : title;
    doc.text(`Report: ${cleanTitle}`, 15, pageHeight - 5);
  }
  
  // Right side: Current date
  const dateStr = new Date().toLocaleDateString('en-IN');
  doc.text(dateStr, pageWidth - 15, pageHeight - 5, { align: 'right' });

  // Restore original font and color settings
  doc.setFontSize(originalFontSize);
  if (typeof originalTextColor === 'string') {
    doc.setTextColor(originalTextColor);
  }
}
