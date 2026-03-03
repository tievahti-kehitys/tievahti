import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProject } from "@/context/ProjectContext";
import { useCatalog, CatalogItem } from "@/context/CatalogContext";
import { useCategoryFilter } from "@/context/CategoryFilterContext";
import { supabase } from "@/integrations/supabase/client";
import { useProjectTextSections } from "@/hooks/useProjectTextSections";
import {
  FileSpreadsheet,
  Printer,
  ChevronDown,
  ChevronRight,
  Map as MapIcon,
  MapPin,
  Image as ImageIcon,
  X,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { evaluateFormula, evaluateNameFormula } from "@/lib/costCalculator";
import { buildEffectiveParameters } from "@/lib/parameterUtils";
import { useProductChainages, formatChainageDisplay } from "@/hooks/useProductChainages";
import tievahtiLogo from "@/assets/tievahti-logo.svg";

export function BuildPlanPanel() {
  const { project, allProducts: rawProducts } = useProject();
  const { items } = useCatalog();
  const { filter } = useCategoryFilter();
  const { sections } = useProjectTextSections(project?.id);
  
  // Resolve chainage from DB or calculate on-the-fly
  const chainageMap = useProductChainages(project?.id, rawProducts);

  // Filter products by active category
  const allProducts = useMemo(() => {
    if (filter === 'all') return rawProducts;
    if (filter === 'uncategorized') return rawProducts.filter(p => !p.categoryId);
    return rawProducts.filter(p => p.categoryId === filter);
  }, [rawProducts, filter]);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([
    "Murskeet",
    "Tien kuivatus",
    "Kohtaamispaikat",
    "Toimenpiteet",
  ]);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Helper to get catalog item by ID
  const getItemById = (id: string): CatalogItem | undefined => {
    return items.find(item => item.id === id);
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  };

  // Get catalog item IDs for fetching compositions
  const catalogItemIds = useMemo(() => {
    if (!project) return [] as string[];
    const ids = allProducts.map(p => p.productDefinitionId);
    return Array.from(new Set(ids));
  }, [project, allProducts]);

  // Fetch compositions for operations
  const { data: compositionsByParentId = {} } = useQuery<Record<string, Array<any>>>({
    queryKey: ['build_plan_compositions', catalogItemIds],
    enabled: catalogItemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_composition')
        .select('*, catalog_items!catalog_composition_child_item_id_fkey(*)')
        .in('parent_item_id', catalogItemIds)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      const grouped: Record<string, Array<any>> = {};
      for (const row of (data ?? []) as any[]) {
        const childItemData = row.catalog_items;
        const composition = {
          id: row.id,
          parentItemId: row.parent_item_id,
          childItemId: row.child_item_id,
          quantityFactorFormula: row.quantity_factor_formula,
          label: row.label ?? undefined,
          sortOrder: row.sort_order,
          childItem: childItemData ? {
            id: childItemData.id,
            name: childItemData.name,
            type: childItemData.type,
            unit: childItemData.unit,
          } : undefined,
        };

        if (!grouped[composition.parentItemId]) grouped[composition.parentItemId] = [];
        grouped[composition.parentItemId].push(composition);
      }
      return grouped;
    },
  });

  // Chainage is now resolved via useProductChainages hook

  const productsByCategory = useMemo(() => {
    if (!project) return new Map<string, any[]>();

    const map = new Map<string, any[]>();
    allProducts.forEach((product) => {
      const catalogItem = getItemById(product.productDefinitionId);
      const category = catalogItem?.category || "Muut";

      // Resolve chainage from hook
      const resolved = chainageMap[product.id];
      let chainageStart = resolved?.chainageStart ?? 0;
      let chainageEnd = resolved?.chainageEnd ?? 0;
      let coordinates: [number, number] = [0, 0];
      let endCoordinates: [number, number] | null = null;
      let length = 0;
      let isLineGeometry = false;

      if (product.geometry.type === "point") {
        coordinates = product.geometry.coordinates;
      } else if (product.geometry.type === "line" || product.geometry.type === "polygon") {
        isLineGeometry = true;
        coordinates = product.geometry.coordinates[0];
        endCoordinates = product.geometry.coordinates[product.geometry.coordinates.length - 1];
        
        if (product.geometry.type === "line") {
          for (let i = 1; i < product.geometry.coordinates.length; i++) {
            const [lat1, lon1] = product.geometry.coordinates[i - 1];
            const [lat2, lon2] = product.geometry.coordinates[i];
            length += calculateDistance(lat1, lon1, lat2, lon2);
          }
        }
      }

      // Build formula variables
      const params = buildEffectiveParameters(product.parameters || {}, catalogItem?.defaultParameters || []);
      const formulaVariables: Record<string, number> = {
        ...params,
        length,
        pituus: length,
        quantity: 1,
      };
      if (formulaVariables.pituus_m === undefined && length > 0) {
        formulaVariables.pituus_m = length;
      }

      // String variables for if(param()) support
      const stringVars: Record<string, string> = product.stringParameters ?? {};

      // Calculate quantity
      let quantity = 1;
      if (catalogItem?.quantityFormula) {
        quantity = evaluateFormula(catalogItem.quantityFormula, formulaVariables, stringVars);
      } else if (length > 0) {
        quantity = length;
      }
      formulaVariables.quantity = quantity;

      // Calculate compositions for operations (materials only)
      let childDetails: Array<{ name: string; quantity: number; unit: string }> = [];
      
      if (catalogItem?.type === 'operation') {
        const compositions = compositionsByParentId[catalogItem.id] || [];
        compositions.forEach(comp => {
          if (!comp.childItem) return;
          const childQty = evaluateFormula(comp.quantityFactorFormula, formulaVariables, stringVars);
          // Only show if non-zero
          if (childQty > 0) {
            childDetails.push({
              name: evaluateNameFormula(comp.label, comp.childItem.name, { ...formulaVariables, quantity: childQty }),
              quantity: childQty,
              unit: comp.childItem.unit,
            });
          }
        });
      }

      // Collect visible string parameters for display
      const visibleStringParams: Array<{ label: string; value: string }> = [];
      if (catalogItem?.defaultParameters && product.stringParameters) {
        for (const paramDef of catalogItem.defaultParameters as any[]) {
          if ((paramDef.type === 'select' || paramDef.type === 'boolean') && product.stringParameters[paramDef.slug] !== undefined) {
            visibleStringParams.push({ label: paramDef.label, value: product.stringParameters[paramDef.slug] });
          }
        }
      }

      const existing = map.get(category) || [];
      map.set(category, [...existing, { 
        ...product, 
        chainageStart,
        chainageEnd,
        isLineGeometry,
        displayCoordinates: coordinates,
        endCoordinates,
        childDetails,
        quantity,
        unit: catalogItem?.unit || 'kpl',
        visibleStringParams,
      }]);
    });

    // Sort by chainage within each category
    map.forEach((items, category) => {
      items.sort((a, b) => a.chainageStart - b.chainageStart);
      map.set(category, items);
    });

    return map;
  }, [project, allProducts, items, compositionsByParentId, chainageMap]);

  const exportToPDF = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const content = generatePrintContent();
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
  };

  const exportToCSV = () => {
    if (!project) return;

    const headers = ["Kategoria", "Tuote", "Koordinaatit", "Paaluväli (m)", "Toimenpide", "Kuvaus"];
    const rows = allProducts.map((product) => {
      const catalogItem = getItemById(product.productDefinitionId);
      let coords: [number, number] = [0, 0];
      let chainage = '';

      if (product.geometry.type === "point") {
        coords = product.geometry.coordinates;
      } else if (product.geometry.coordinates.length > 0) {
        coords = product.geometry.coordinates[0];
      }
      const resolved = chainageMap[product.id];
      chainage = formatChainageDisplay(resolved?.chainageStart, resolved?.chainageEnd, product.geometry.type === 'line');

      return [
        catalogItem?.category || "Muut",
        catalogItem?.name || "Määrittelemätön",
        `${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}`,
        chainage,
        catalogItem?.name || "",
        product.notes || "",
      ];
    });

    const csv = [headers, ...rows].map((row) => row.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.name}-rakennussuunnitelma.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const generatePrintContent = () => {
    if (!project) return "";

    const currentDate = new Date().toLocaleDateString("fi-FI");
    
    // Enabled text sections
    const enabledSections = sections.filter(s => s.isEnabled && s.content.trim());

    // Build text sections HTML
    let textSectionsHtml = enabledSections.map(section => `
      <div style="margin-bottom:20px;page-break-inside:avoid;">
        <h2 style="color:#505050;font-size:14px;margin-bottom:8px;font-weight:600;">${section.title}</h2>
        <div style="font-size:11px;line-height:1.6;color:#333;white-space:pre-wrap;">${section.content}</div>
      </div>
    `).join('');

    // Build products table for each category - Tievahti style
    let productsTableHtml = '';
    
    productsByCategory.forEach((products, category) => {
      // Build table rows for this category
      let tableRows = '';
      
      products.forEach((product) => {
        const catalogItem = getItemById(product.productDefinitionId);
        
        // Coordinate string
        const coordStr = `${product.displayCoordinates[0].toFixed(5)}, ${product.displayCoordinates[1].toFixed(6)}`;
        
        // Chainage string
        const chainageStr = formatChainageDisplay(product.chainageStart, product.chainageEnd, product.isLineGeometry);
        
        // Quantity description
        const quantityDesc = `${product.quantity.toFixed(2)} ${product.unit}`;

        // String params description (e.g. "Uusi / Vanha")
        const stringParamDesc = (product.visibleStringParams || []).map((sp: any) => `${sp.label}: ${sp.value}`).join(', ');
        
        // Main product row
        tableRows += `
          <tr>
            <td style="font-family:monospace;font-size:9px;">${coordStr}</td>
            <td class="center">${chainageStr}</td>
            <td>- ${catalogItem?.name || 'Määrittelemätön'}</td>
            <td>${quantityDesc}${stringParamDesc ? ', ' + stringParamDesc : ''}${product.notes ? ', ' + product.notes : ''}</td>
          </tr>
        `;
        
        // Child products (materials for operations)
         if (product.childDetails && product.childDetails.length > 0) {
           product.childDetails.forEach((child: any) => {
             tableRows += `
               <tr class="child-row">
                 <td></td>
                 <td></td>
                 <td style="padding-left:20px;">– ${child.name}</td>
                 <td>${child.quantity.toFixed(2)} ${child.unit}</td>
               </tr>
             `;
           });
         }
      });
      
      productsTableHtml += `
        <div style="margin-bottom:24px;page-break-inside:avoid;">
          <h3 style="color:#505050;font-size:13px;margin-bottom:8px;font-weight:600;">${category}</h3>
          <table class="products-table">
            <thead>
              <tr>
                <th style="width:25%;">Koordinaatit</th>
                <th style="width:15%;" class="center">Paaluväli (m)</th>
                <th style="width:30%;">Toimenpide</th>
                <th style="width:30%;">Kuvaus</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      `;
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${project.name} - Rakennussuunnitelma</title>
        <meta charset="UTF-8">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700;900&display=swap');
          
          * { box-sizing: border-box; margin: 0; padding: 0; }
          
          body { 
            font-family: 'Poppins', Arial, sans-serif; 
            color: #505050;
            font-size: 11px;
            line-height: 1.4;
          }
          
          .page {
            padding: 30px 40px;
            min-height: 100vh;
            position: relative;
            padding-bottom: 80px;
          }
          
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 3px solid #22C3F3;
          }
          
          .header-left {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          
          .logo { height: 36px; }
          
          .header-title {
            font-size: 18px;
            font-weight: 700;
            color: #505050;
          }
          
          .header-date {
            font-size: 11px;
            color: #888;
          }
          
          .project-info {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 16px;
            margin-bottom: 24px;
          }
          
          .project-info h2 {
            font-size: 13px;
            color: #505050;
            margin-bottom: 12px;
            font-weight: 600;
          }
          
          .project-info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px 24px;
          }
          
          .project-info-item {
            display: flex;
            font-size: 10px;
          }
          
          .project-info-label {
            color: #888;
            min-width: 140px;
          }
          
          .project-info-value {
            color: #333;
            font-weight: 500;
          }
          
          .text-section {
            margin-bottom: 20px;
            page-break-inside: avoid;
          }
          
          .text-section h2 {
            color: #505050;
            font-size: 14px;
            margin-bottom: 8px;
            font-weight: 600;
          }
          
          .text-section p {
            font-size: 11px;
            line-height: 1.6;
            color: #333;
          }
          
          .products-section {
            margin-top: 30px;
          }
          
          .products-section > h2 {
            font-size: 14px;
            color: #505050;
            margin-bottom: 16px;
            font-weight: 600;
          }
          
          .products-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
            margin-bottom: 16px;
          }
          
          .products-table th {
            background: #505050;
            color: white;
            padding: 8px 6px;
            text-align: left;
            font-weight: 600;
            font-size: 9px;
          }
          
          .products-table th.center { text-align: center; }
          
          .products-table td {
            padding: 6px;
            border-bottom: 1px solid #e5e7eb;
            vertical-align: top;
          }
          
          .products-table td.center { text-align: center; }
          
          .child-row td {
            font-size: 9px;
            background: #f9fafb;
            padding-top: 4px;
            padding-bottom: 4px;
          }
          
          .footer {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 10px 40px;
            background: #505050;
            color: white;
            font-size: 9px;
            display: flex;
            justify-content: space-between;
          }
          
          .footer-section {
            display: flex;
            gap: 16px;
          }
          
          @media print {
            .page { padding: 15px 25px 60px; }
            .footer { position: fixed; }
            @page { margin: 0; size: A4; }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="header-left">
              <img src="${tievahtiLogo}" class="logo" alt="Tievahti" onerror="this.style.display='none'" />
              <div class="header-title">HANKKEEN RAKENTAMISSUUNNITELMA</div>
            </div>
            <div class="header-date">${currentDate}</div>
          </div>
          
          <div class="project-info">
            <h2>Projektin tiedot</h2>
            <div class="project-info-grid">
              <div class="project-info-item">
                <span class="project-info-label">Projektin tyyppi:</span>
                <span class="project-info-value">${project.projectType || ''}</span>
              </div>
              <div class="project-info-item">
                <span class="project-info-label">Tiekunta:</span>
                <span class="project-info-value">${project.tiekunta || project.name}</span>
              </div>
              <div class="project-info-item">
                <span class="project-info-label">Käyttöoikeusyksikkötunnus:</span>
                <span class="project-info-value">${project.kayttooikeusyksikkotunnus || ''}</span>
              </div>
              <div class="project-info-item">
                <span class="project-info-label">Kunta:</span>
                <span class="project-info-value">${project.kunta || ''}</span>
              </div>
              <div class="project-info-item">
                <span class="project-info-label">Kohdeosoite:</span>
                <span class="project-info-value">${project.kohdeosoite || ''}</span>
              </div>
              <div class="project-info-item">
                <span class="project-info-label">Osakasmäärä:</span>
                <span class="project-info-value">${project.osakasCount || 0} kpl</span>
              </div>
              <div class="project-info-item">
                <span class="project-info-label">Yksikkömäärä:</span>
                <span class="project-info-value">${project.yksikkoCount || 0} kpl</span>
              </div>
              <div class="project-info-item">
                <span class="project-info-label">Vastuuhenkilö:</span>
                <span class="project-info-value">${project.vastuuhenkiloName || ''}</span>
              </div>
              <div class="project-info-item">
                <span class="project-info-label">Vastuuhenkilön puhelin:</span>
                <span class="project-info-value">${project.vastuuhenkiloPhone || ''}</span>
              </div>
              <div class="project-info-item">
                <span class="project-info-label">Vastuuhenkilön sähköposti:</span>
                <span class="project-info-value">${project.vastuuhenkiloEmail || ''}</span>
              </div>
            </div>
          </div>
          
          ${textSectionsHtml}
          
          ${productsTableHtml ? `
            <div class="products-section">
              <h2>Selvitykset</h2>
              ${productsTableHtml}
            </div>
          ` : ''}
        </div>
        
        <div class="footer">
          <div class="footer-section">
            <span>Suomen Tieverkko Oy</span>
            <span>Suomen Tieinfra Oy</span>
            <span>Satamatie 2, 53900 Lappeenranta</span>
          </div>
          <div class="footer-section">
            <span>010 2028 444</span>
            <span>hankkeet@tievahti.fi</span>
            <span>www.tievahti.fi</span>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  if (!project) {
    return <div className="p-4 text-sidebar-foreground/70 text-sm">Luo projekti nähdäksesi rakennussuunnitelman.</div>;
  }

  if (allProducts.length === 0 && sections.filter(s => s.isEnabled && s.content).length === 0) {
    return (
      <div className="p-4 text-sidebar-foreground/70 text-sm">
        Lisää tuotteita projektiin tai kirjoita tekstiosiot nähdäksesi rakennussuunnitelman.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with export buttons */}
      <div className="p-3 border-b border-sidebar-border space-y-2">
        <h3 className="text-sm font-semibold text-sidebar-foreground">Rakentamissuunnitelma</h3>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            className="h-7 px-2.5 gap-1 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
            title="Tulosta PDF"
            onClick={exportToPDF}
          >
            <Printer className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Tulosta</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 gap-1 text-xs bg-sidebar-accent hover:bg-sidebar-accent/80 border-sidebar-border text-sidebar-foreground"
            title="Lataa CSV"
            onClick={exportToCSV}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
            <span>CSV</span>
          </Button>
        </div>
      </div>

      {/* Road info */}
      {project.roadGeometry && (
        <div className="p-3 border-b border-sidebar-border bg-sidebar-accent/20">
          <div className="flex items-center gap-2 text-xs text-sidebar-foreground">
            <MapIcon className="w-4 h-4 text-primary" />
            <span className="font-medium">{project.roadGeometry.name}</span>
            <span className="text-sidebar-foreground/60">
              ({(project.roadGeometry.totalLength / 1000).toFixed(2)} km)
            </span>
          </div>
        </div>
      )}

      {/* Products by category - NO COSTS */}
      <div className="flex-1 overflow-auto p-3">
        <div className="space-y-2">
          {Array.from(productsByCategory.entries()).map(([category, products]) => {
            const isExpanded = expandedCategories.includes(category);

            return (
              <div key={category} className="bg-sidebar-accent/20 rounded-md overflow-hidden">
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between p-2 hover:bg-sidebar-accent/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-sidebar-foreground/50" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-sidebar-foreground/50" />
                    )}
                    <span className="text-xs font-semibold text-sidebar-foreground">{category}</span>
                    <span className="text-xs text-sidebar-foreground/50">({products.length})</span>
                  </div>
                </button>

                {/* Category items - NO COSTS */}
                {isExpanded && (
                  <div className="px-2 pb-2 space-y-1">
                    {products.map((product) => {
                      const catalogItem = getItemById(product.productDefinitionId);
                      const hasPhotos = product.photos && product.photos.length > 0;

                      // Chainage display
                      const chainageDisplay = `PL ${formatChainageDisplay(product.chainageStart, product.chainageEnd, product.isLineGeometry) || '0'}`;

                      return (
                        <div key={product.id} className="bg-sidebar-accent/30 rounded p-2 text-xs">
                          {/* Header with name only - NO COST */}
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: product.colorOverride || catalogItem?.markerStyle?.color || "#22C3F3" }}
                              />
                              <span className="font-medium text-sidebar-foreground">
                                {catalogItem?.name || "Määrittelemätön"}
                              </span>
                            </div>
                            <span className="text-sidebar-foreground/70 text-[10px]">
                              {product.quantity.toFixed(1)} {product.unit}
                            </span>
                          </div>

                          {/* Chainage and coordinates */}
                          <div className="flex items-center gap-3 text-sidebar-foreground/60 mt-1 ml-4">
                            <span className="flex items-center gap-1 font-mono text-[10px] font-semibold text-primary">
                              <MapPin className="w-3 h-3" />
                              {chainageDisplay}
                            </span>
                            <span className="font-mono text-[10px]">
                              {product.displayCoordinates[0].toFixed(5)}, {product.displayCoordinates[1].toFixed(5)}
                            </span>
                          </div>
                          
                          {/* End coordinates for line geometry */}
                          {product.isLineGeometry && product.endCoordinates && (
                            <div className="flex items-center gap-3 text-sidebar-foreground/50 mt-0.5 ml-4">
                              <span className="text-[10px]">→</span>
                              <span className="font-mono text-[10px]">
                                {product.endCoordinates[0].toFixed(5)}, {product.endCoordinates[1].toFixed(5)}
                              </span>
                            </div>
                          )}

                          {/* String parameters (select/boolean) */}
                          {product.visibleStringParams && product.visibleStringParams.length > 0 && (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 ml-4">
                              {product.visibleStringParams.map((sp: any, idx: number) => (
                                <span key={idx} className="text-[10px] text-sidebar-foreground/60">
                                  <span className="text-sidebar-foreground/40">{sp.label}:</span> {sp.value}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Notes */}
                          {product.notes && (
                            <p className="text-sidebar-foreground/50 mt-1 ml-4 italic">{product.notes}</p>
                          )}

                          {/* Child products (materials for operations) - NO COSTS */}
                          {product.childDetails && product.childDetails.length > 0 && (
                            <div className="mt-2 ml-4 p-2 bg-success/10 rounded border-l-2 border-success">
                              <div className="text-[10px] text-success uppercase font-semibold mb-1 flex items-center gap-1">
                                <Package className="w-3 h-3" />
                                Materiaalit
                              </div>
                              {product.childDetails.map((child: any, idx: number) => (
                                <div key={idx} className="text-sidebar-foreground/70">
                                  <span>{child.name}: {child.quantity.toFixed(1)} {child.unit}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Photos */}
                          {hasPhotos && (
                            <div className="flex items-center gap-1 mt-2 ml-4">
                              <ImageIcon className="w-3 h-3 text-sidebar-foreground/50" />
                              <div className="flex gap-1">
                                {product.photos.slice(0, 4).map((photo: any) => (
                                  <button
                                    key={photo.id}
                                    onClick={() => setLightboxImage(photo.url)}
                                    className="w-10 h-10 rounded overflow-hidden border border-sidebar-border hover:border-primary transition-colors"
                                  >
                                    <img src={photo.url} alt="" className="w-full h-full object-cover" />
                                  </button>
                                ))}
                                {product.photos.length > 4 && (
                                  <span className="text-sidebar-foreground/50 text-[10px] ml-1">
                                    +{product.photos.length - 4}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Image Lightbox */}
      <Dialog open={!!lightboxImage} onOpenChange={() => setLightboxImage(null)}>
        <DialogContent className="max-w-4xl p-0 bg-black/90">
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white z-10"
          >
            <X className="w-6 h-6" />
          </button>
          {lightboxImage && <img src={lightboxImage} alt="" className="w-full h-auto max-h-[90vh] object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
