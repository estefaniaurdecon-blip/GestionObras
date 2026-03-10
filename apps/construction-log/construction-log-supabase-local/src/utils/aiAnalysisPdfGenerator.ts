import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { isNative, blobToBase64, saveBase64File } from './nativeFile';
import { sanitizePdfFilename } from './securePdfFilename';

interface Message {
  role: "user" | "assistant";
  content: string;
  images?: string[];
}

export const generateAIAnalysisPDF = async (
  messages: Message[],
  companyName?: string,
  companyLogo?: string,
  workName?: string,
  userPrompt?: string,
  brandColor?: string
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  // Unified margins for a clean layout
  const MARGIN_LEFT = 20;
  const MARGIN_RIGHT = 20;
  const CONTENT_WIDTH = pageWidth - MARGIN_LEFT - MARGIN_RIGHT;
  let yPosition = 24;

  // Convert brand color from hex to RGB for jsPDF
  let primaryR = 85, primaryG = 102, primaryB = 51; // Default green
  if (brandColor && /^#[0-9A-Fa-f]{6}$/.test(brandColor)) {
    const hex = brandColor.replace('#', '');
    primaryR = parseInt(hex.substring(0, 2), 16);
    primaryG = parseInt(hex.substring(2, 4), 16);
    primaryB = parseInt(hex.substring(4, 6), 16);
  }

  // Helper function to add new page if needed
  const checkPageBreak = (requiredSpace: number) => {
    if (yPosition + requiredSpace > pageHeight - 20) {
      doc.addPage();
      yPosition = 20;
      return true;
    }
    return false;
  };

  // Header with logo and company name
  const addHeader = () => {
    let currentY = 12;
    
    // Company logo if available
    if (companyLogo) {
      try {
        // Detect image format from base64 string
        let format = 'PNG';
        if (companyLogo.includes('data:image/jpeg') || companyLogo.includes('data:image/jpg')) {
          format = 'JPEG';
        } else if (companyLogo.includes('data:image/png')) {
          format = 'PNG';
        }
        doc.addImage(companyLogo, format, MARGIN_LEFT, currentY, 20, 20);
      } catch (error) {
        console.error('Error adding logo:', error);
      }
    }

    // Title with work name
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(primaryR, primaryG, primaryB); // Use brand color
    const titleX = companyLogo ? MARGIN_LEFT + 26 : MARGIN_LEFT;
    const mainTitle = workName ? `Análisis ${workName}` : (companyName || 'Análisis de Planos IA');
    doc.text(mainTitle, titleX, 20);

    // Subtitle with user prompt if available
    if (userPrompt) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      const subtitleLines = doc.splitTextToSize(userPrompt, pageWidth - titleX - MARGIN_RIGHT);
      currentY = 26;
      subtitleLines.forEach((line: string) => {
        doc.text(line, titleX, currentY);
        currentY += 5;
      });
    }

    // Date
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-ES', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    })}`, pageWidth - MARGIN_RIGHT, 20, { align: 'right' });

    // Separator line within margins
    const separatorY = Math.max(currentY + 6, 38);
    doc.setDrawColor(primaryR, primaryG, primaryB); // Use brand color
    doc.setLineWidth(0.5);
    doc.line(MARGIN_LEFT, separatorY, pageWidth - MARGIN_RIGHT, separatorY);

    yPosition = separatorY + 8;
  };

  // Add footer with page numbers
  const addFooter = () => {
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Página ${i} de ${totalPages}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );

      doc.text(
        'Generado por Sistema de Gestión de Obra',
        pageWidth - MARGIN_RIGHT,
        pageHeight - 10,
        { align: 'right' }
      );
    }
  };

  // Process markdown-like content to extract structure (with sanitization)
  const sanitizeText = (str: string) => {
    // Remove emojis and special characters that don't render well in PDF
    const withoutEmojis = str.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
    
    // Remove any leading garbage chars until we hit an allowed alphanumeric (Spanish included)
    const allowedStart = /[A-Za-z0-9ÁÉÍÓÚÜáéíóúüÑñ¿¡]/;
    let i = 0;
    while (i < withoutEmojis.length && !allowedStart.test(withoutEmojis[i])) i++;
    const sliced = withoutEmojis.slice(i);
    return sliced
      .normalize('NFC')
      .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '')
      .replace(/^[:\-–—\s]+/, '') // remove leftover punctuation immediately after trim
      .replace(/\s+/g, ' ')
      .trim();
  };

  const isHorizontalRule = (line: string) => /^(\s*)(-{3,}|\*{3,}|_{3,})(\s*)$/.test(line.trim());

  const parseContent = (content: string) => {
    const lines = content.split('\n');
    const sections: {
      type: 'h1' | 'h2' | 'h3' | 'p' | 'list' | 'table' | 'code';
      content: string | string[][] | string[];
    }[] = [];

    let currentList: string[] = [];
    let currentTable: string[][] = [];
    let inCodeBlock = false;
    let codeLines: string[] = [];

    lines.forEach((line, index) => {
      // Skip horizontal rules
      if (isHorizontalRule(line)) return;

      // Code blocks
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          sections.push({ type: 'code', content: codeLines });
          codeLines = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        return;
      }

      // Headers
      if (line.startsWith('# ')) {
        if (currentList.length > 0) {
          sections.push({ type: 'list', content: currentList });
          currentList = [];
        }
        sections.push({ type: 'h1', content: sanitizeText(line.replace(/^#+ /, '')) });
      } else if (line.startsWith('## ')) {
        if (currentList.length > 0) {
          sections.push({ type: 'list', content: currentList });
          currentList = [];
        }
        sections.push({ type: 'h2', content: sanitizeText(line.replace(/^#+ /, '')) });
      } else if (line.startsWith('### ')) {
        if (currentList.length > 0) {
          sections.push({ type: 'list', content: currentList });
          currentList = [];
        }
        sections.push({ type: 'h3', content: sanitizeText(line.replace(/^#+ /, '')) });
      }
      // Lists
      else if (line.trim().match(/^[-*•]\s/) || line.trim().match(/^\d+\.\s/)) {
        const listItem = sanitizeText(
          line.trim()
            .replace(/^[-*•]\s/, '')
            .replace(/^\d+\.\s/, '')
            .replace(/^\*\*/, '')
            .replace(/\*\*$/, '')
        );
        if (listItem) {
          currentList.push(listItem);
        }
      }
      // Tables
      else if (line.includes('|')) {
        const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);
        if (cells.length > 0) {
          currentTable.push(cells);
        }
        // Check if next line is not a table to finalize
        if (index === lines.length - 1 || !lines[index + 1].includes('|')) {
          if (currentTable.length > 0) {
            sections.push({ type: 'table', content: currentTable });
            currentTable = [];
          }
        }
      }
      // Regular paragraphs
      else if (line.trim()) {
        if (currentList.length > 0) {
          sections.push({ type: 'list', content: currentList });
          currentList = [];
        }
        // Clean up markdown formatting and sanitize
        const cleanContent = sanitizeText(
          line.trim()
            .replace(/^\*\*/, '')
            .replace(/\*\*:?$/, '')
            .replace(/\*\*/g, '')
        );
        if (cleanContent) {
          sections.push({ type: 'p', content: cleanContent });
        }
      }
    });

    // Add remaining items
    if (currentList.length > 0) {
      sections.push({ type: 'list', content: currentList });
    }
    if (currentTable.length > 0) {
      sections.push({ type: 'table', content: currentTable });
    }

    return sections;
  };

  // Add initial header
  addHeader();

  // Process each message
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    checkPageBreak(30);

    // Message header
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    if (msg.role === 'user') {
      doc.setFillColor(primaryR, primaryG, primaryB); // Use brand color
      doc.setTextColor(255, 255, 255);
      doc.rect(MARGIN_LEFT, yPosition - 5, CONTENT_WIDTH, 10, 'F');
      doc.text('Consulta:', MARGIN_LEFT + 5, yPosition + 2);
    } else {
      // Create lighter version of brand color for background
      const lightR = Math.min(255, primaryR + (255 - primaryR) * 0.85);
      const lightG = Math.min(255, primaryG + (255 - primaryG) * 0.85);
      const lightB = Math.min(255, primaryB + (255 - primaryB) * 0.85);
      doc.setFillColor(lightR, lightG, lightB);
      doc.setTextColor(primaryR, primaryG, primaryB);
      doc.rect(MARGIN_LEFT, yPosition - 5, CONTENT_WIDTH, 10, 'F');
      doc.text('Análisis IA:', MARGIN_LEFT + 5, yPosition + 2);
    }

    yPosition += 12;

    // Add images if present
    if (msg.images && msg.images.length > 0) {
      for (const image of msg.images) {
        checkPageBreak(80);
        try {
          const imgWidth = CONTENT_WIDTH;
          const imgHeight = 60; // keep ratio-friendly height cap
          doc.addImage(image, 'PNG', MARGIN_LEFT, yPosition, imgWidth, imgHeight);
          yPosition += imgHeight + 5;
        } catch (error) {
          console.error('Error adding image:', error);
        }
      }
    }

    // Parse and render content
    const sections = parseContent(msg.content);
    
    for (const section of sections) {
      checkPageBreak(20);

      switch (section.type) {
        case 'h1':
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(primaryR, primaryG, primaryB); // Use brand color
          doc.text(section.content as string, 20, yPosition);
          yPosition += 10;
          break;

        case 'h2':
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(primaryR, primaryG, primaryB); // Use brand color
          doc.text(section.content as string, 20, yPosition);
          yPosition += 8;
          break;

        case 'h3':
          doc.setFontSize(11);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(60, 60, 60);
          doc.text(section.content as string, 20, yPosition);
          yPosition += 7;
          break;

        case 'p': {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(60, 60, 60);
          const lines = doc.splitTextToSize(section.content as string, CONTENT_WIDTH);
          for (const line of lines) {
            checkPageBreak(7);
            doc.text(line, MARGIN_LEFT, yPosition);
            yPosition += 6;
          }
          yPosition += 2;
          break;
        }

        case 'list':
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          doc.setTextColor(60, 60, 60);
          (section.content as string[]).forEach(item => {
            checkPageBreak(7);
            const bulletX = MARGIN_LEFT + 2;
            doc.circle(bulletX, yPosition - 2, 0.8, 'F');
            const itemLines = doc.splitTextToSize(item, CONTENT_WIDTH - 8);
            for (let j = 0; j < itemLines.length; j++) {
              if (j > 0) checkPageBreak(6);
              doc.text(itemLines[j], MARGIN_LEFT + 6, yPosition);
              yPosition += 6;
            }
          });
          yPosition += 3;
          break;

        case 'table': {
          checkPageBreak(30);
          const tableData = section.content as string[][];
          if (tableData.length > 1) {
            // Create lighter version of brand color for alternating rows
            const altR = Math.min(255, primaryR + (255 - primaryR) * 0.90);
            const altG = Math.min(255, primaryG + (255 - primaryG) * 0.90);
            const altB = Math.min(255, primaryB + (255 - primaryB) * 0.90);
            
            autoTable(doc, {
              head: [tableData[0]],
              body: tableData.slice(1).filter(row => !row.every(cell => cell.includes('-'))),
              startY: yPosition,
              margin: { left: MARGIN_LEFT, right: MARGIN_RIGHT },
              headStyles: {
                fillColor: [primaryR, primaryG, primaryB], // Use brand color
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 9,
              },
              bodyStyles: {
                fontSize: 9,
                textColor: [60, 60, 60],
              },
              alternateRowStyles: {
                fillColor: [altR, altG, altB], // Use lighter brand color
              },
              theme: 'striped',
            });
            yPosition = (doc as any).lastAutoTable.finalY + 8;
          }
          break;
        }

        case 'code': {
          checkPageBreak(15);
          doc.setFillColor(245, 245, 245);
          const codeContent = (section.content as string[]).join('\n');
          const codeLines = doc.splitTextToSize(codeContent, CONTENT_WIDTH);
          const codeHeight = codeLines.length * 5 + 6;
          checkPageBreak(codeHeight);
          doc.rect(MARGIN_LEFT, yPosition - 3, CONTENT_WIDTH, codeHeight, 'F');
          doc.setFontSize(8);
          doc.setFont('courier', 'normal');
          doc.setTextColor(40, 40, 40);
          codeLines.forEach((line: string) => {
            doc.text(line, MARGIN_LEFT + 3, yPosition);
            yPosition += 5;
          });
          yPosition += 5;
          break;
        }
      }
    }

    yPosition += 10; // Space between messages
  }

  // Add footers to all pages
  addFooter();

  // Generate filename with timestamp - sanitize to prevent path traversal (GHSA-f8cm-6447-x5h2)
  const timestamp = new Date().toISOString().split('T')[0];
  const rawFilename = `Analisis_Planos_IA_${timestamp}.pdf`;
  const filename = sanitizePdfFilename(rawFilename);

  // Save the PDF - different approach for native vs web
  if (isNative()) {
    const pdfBlob = doc.output('blob');
    const base64 = await blobToBase64(pdfBlob);
    await saveBase64File(filename, base64, 'application/pdf');
  } else {
    doc.save(filename);
  }
};
