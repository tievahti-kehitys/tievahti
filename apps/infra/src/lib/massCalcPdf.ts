/**
 * Mass Calculation PDF Report Generator
 * 
 * One PDF per run, with branch-separated sections.
 * Includes: measurement table, diagram, BOQ (KaM16/32/56), summary.
 * Excludes: Geotextile, OJA_KAIVUU, OK segments.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { MassCalcResult, BranchResult, MassCalcGlobalSettings } from './massCalcEngine';

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function generateMassCalcPdf(
  result: MassCalcResult,
  projectName: string,
): Promise<Blob> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;

  for (let i = 0; i < result.branches.length; i++) {
    if (i > 0) doc.addPage();
    renderBranchSection(doc, result.branches[i], result.globalSettings, projectName, margin, contentWidth, pageWidth);
  }

  // Grand totals page
  if (result.branches.length > 1) {
    doc.addPage();
    renderGrandTotals(doc, result, projectName, margin, contentWidth);
  }

  return doc.output('blob');
}

function renderBranchSection(
  doc: jsPDF,
  br: BranchResult,
  settings: MassCalcGlobalSettings,
  projectName: string,
  margin: number,
  contentWidth: number,
  pageWidth: number,
) {
  let y = margin;

  // ── Header ──
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Kantavuusmittauksen tulokset', margin, y);
  y += 8;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Projekti: ${projectName}`, margin, y);
  y += 5;
  doc.text(`Tiehaara: ${br.branch.name}`, margin, y);
  y += 5;
  doc.text(`Päivämäärä: ${new Date().toLocaleDateString('fi-FI')}`, margin, y);
  y += 7;

  // Parameters
  doc.setFontSize(9);
  doc.setFont('helvetica', 'italic');
  const params = [
    `Tavoitekantavuus: ${br.branch.targetBearingCapacity} MN/m²`,
    `Tien leveys: ${br.branch.roadWidth} m`,
    `Kevätkantavuuskerroin: ${settings.springFactor}`,
    `Vaikutusetäisyys: ${settings.influenceDistanceM} m`,
    `Katkaisupituus: ${settings.cutLengthM} m`,
    `Pintamurskeen paksuus: ${settings.surfaceThicknessM * 1000} mm`,
  ];
  doc.text(params.join('  |  '), margin, y, { maxWidth: contentWidth });
  y += 8;

  // ── B) Measurement Data Table ──
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Mittaustiedot', margin, y);
  y += 2;

  const measureRows = br.points.map(p => [
    r2(p.station).toFixed(2),
    r2(br.branch.targetBearingCapacity).toFixed(2),
    r2(p.effectiveMeasured).toFixed(2),
    r2(p.deficit).toFixed(2),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Paalu (m)', 'Tavoite (MN/m²)', 'Mitattu (MN/m²)', 'Alijäämä (MN/m²)']],
    body: measureRows,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: 'bold' },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 3) {
        const val = parseFloat(data.cell.raw as string);
        if (val > 0) {
          data.cell.styles.textColor = [200, 0, 0];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // ── C) Bearing Capacity Diagram ──
  // Check if we need a new page
  if (y > 200) {
    doc.addPage();
    y = margin;
  }
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Kantavuuskaavio', margin, y);
  y += 5;

  y = drawBearingDiagram(doc, br, margin, y, contentWidth);
  y += 8;

  // ── D) BOQ Table ──
  if (y > 220) {
    doc.addPage();
    y = margin;
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Massaluettelo', margin, y);
  y += 2;

  const boqRows: string[][] = [];

  // Repair segments: KaM32, KaM56
  for (const seg of br.segments) {
    if (seg.thickness32 > 0) {
      boqRows.push([
        String(seg.id),
        `${seg.chainageStart.toFixed(0)}–${seg.chainageEnd.toFixed(0)}`,
        'KaM 0/32',
        seg.lengthM.toFixed(2),
        r2(seg.thickness32 * 1000).toFixed(2),
        br.branch.roadWidth.toFixed(2),
        seg.volume32.toFixed(2),
        seg.weight32.toFixed(2),
      ]);
    }
    if (seg.thickness56 > 0) {
      boqRows.push([
        String(seg.id),
        `${seg.chainageStart.toFixed(0)}–${seg.chainageEnd.toFixed(0)}`,
        'KaM 0/56',
        seg.lengthM.toFixed(2),
        r2(seg.thickness56 * 1000).toFixed(2),
        br.branch.roadWidth.toFixed(2),
        seg.volume56.toFixed(2),
        seg.weight56.toFixed(2),
      ]);
    }
  }

  // KaM16 whole branch (use chainage-based values)
  const kam16Vol = br.totals.kam16_m3;
  const kam16Weight = br.totals.kam16_t;
  const branchLength = r2(br.chainageMax - br.chainageMin);
  boqRows.push([
    '–',
    `${br.chainageMin.toFixed(0)}–${br.chainageMax.toFixed(0)}`,
    'KaM 0/16',
    branchLength.toFixed(2),
    r2(50).toFixed(2),
    br.branch.roadWidth.toFixed(2),
    kam16Vol.toFixed(2),
    kam16Weight.toFixed(2),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['#', 'Paaluväli', 'Materiaali', 'Pituus (m)', 'Paksuus (mm)', 'Leveys (m)', 'Tilavuus (m³)', 'Paino (tn)']],
    body: boqRows,
    styles: { fontSize: 7, cellPadding: 1.2 },
    headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 28 },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  // ── E) Summary ──
  if (y > 250) {
    doc.addPage();
    y = margin;
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Yhteenveto', margin, y);
  y += 2;

  const summaryRows = [
    ['KaM 0/16', br.totals.kam16_m3.toFixed(2), br.totals.kam16_t.toFixed(2)],
    ['KaM 0/32', br.totals.kam32_m3.toFixed(2), br.totals.kam32_t.toFixed(2)],
    ['KaM 0/56', br.totals.kam56_m3.toFixed(2), br.totals.kam56_t.toFixed(2)],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Materiaali', 'Tilavuus (m³)', 'Paino (tn)']],
    body: summaryRows,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: 'bold' },
  });
}

function renderGrandTotals(
  doc: jsPDF,
  result: MassCalcResult,
  projectName: string,
  margin: number,
  contentWidth: number,
) {
  let y = margin;

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Kokonaisyhteenveto', margin, y);
  y += 8;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Projekti: ${projectName}`, margin, y);
  y += 5;
  doc.text(`Haarat: ${result.branches.map(b => b.branch.name).join(', ')}`, margin, y);
  y += 8;

  const totals = result.grandTotals;
  const rows = [
    ['KaM 0/16', totals.kam16_m3.toFixed(2), totals.kam16_t.toFixed(2)],
    ['KaM 0/32', totals.kam32_m3.toFixed(2), totals.kam32_t.toFixed(2)],
    ['KaM 0/56', totals.kam56_m3.toFixed(2), totals.kam56_t.toFixed(2)],
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Materiaali', 'Tilavuus (m³)', 'Paino (tn)']],
    body: rows,
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: 'bold' },
  });
}

// ── Bearing Capacity Diagram (simple canvas-style drawing) ──
function drawBearingDiagram(
  doc: jsPDF,
  br: BranchResult,
  margin: number,
  startY: number,
  contentWidth: number,
): number {
  if (br.points.length === 0) return startY;

  const chartHeight = 50;
  const chartX = margin + 10;
  const chartWidth = contentWidth - 20;
  const chartY = startY;

  const stations = br.points.map(p => p.station);
  const minStation = Math.min(...stations);
  const maxStation = Math.max(...stations);
  const stationRange = maxStation - minStation || 1;

  const values = br.points.map(p => p.effectiveMeasured);
  const target = br.branch.targetBearingCapacity;
  const allValues = [...values, target];
  const minVal = Math.min(...allValues) * 0.8;
  const maxVal = Math.max(...allValues) * 1.2;
  const valRange = maxVal - minVal || 1;

  const toX = (station: number) => chartX + ((station - minStation) / stationRange) * chartWidth;
  const toY = (val: number) => chartY + chartHeight - ((val - minVal) / valRange) * chartHeight;

  // Axes
  doc.setDrawColor(100);
  doc.setLineWidth(0.3);
  doc.line(chartX, chartY + chartHeight, chartX + chartWidth, chartY + chartHeight); // x-axis
  doc.line(chartX, chartY, chartX, chartY + chartHeight); // y-axis

  // Target line (dashed red)
  const targetY = toY(target);
  doc.setDrawColor(200, 0, 0);
  doc.setLineWidth(0.5);
  doc.setLineDashPattern([2, 2], 0);
  doc.line(chartX, targetY, chartX + chartWidth, targetY);
  doc.setLineDashPattern([], 0);

  // Target label
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(200, 0, 0);
  doc.text(`Tavoite ${target}`, chartX + chartWidth + 1, targetY + 1);

  // Measured line (blue)
  doc.setDrawColor(0, 80, 200);
  doc.setLineWidth(0.8);
  doc.setTextColor(0, 0, 0);
  for (let i = 0; i < br.points.length - 1; i++) {
    const x1 = toX(br.points[i].station);
    const y1 = toY(br.points[i].effectiveMeasured);
    const x2 = toX(br.points[i + 1].station);
    const y2 = toY(br.points[i + 1].effectiveMeasured);
    doc.line(x1, y1, x2, y2);
  }

  // Points
  doc.setFillColor(0, 80, 200);
  for (const p of br.points) {
    doc.circle(toX(p.station), toY(p.effectiveMeasured), 0.8, 'F');
  }

  // Axis labels
  doc.setFontSize(6);
  doc.setTextColor(80);
  doc.text(`${minStation.toFixed(0)}`, chartX, chartY + chartHeight + 4);
  doc.text(`${maxStation.toFixed(0)} m`, chartX + chartWidth - 8, chartY + chartHeight + 4);
  doc.text(`${maxVal.toFixed(0)}`, margin, chartY + 2);
  doc.text(`${minVal.toFixed(0)}`, margin, chartY + chartHeight);

  // Legend
  const legendY = chartY + chartHeight + 7;
  doc.setFontSize(7);
  doc.setTextColor(0, 80, 200);
  doc.text('● Mitattu kantavuus', chartX, legendY);
  doc.setTextColor(200, 0, 0);
  doc.text('--- Tavoite', chartX + 35, legendY);
  doc.setTextColor(0, 0, 0);

  return legendY + 3;
}
