import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useProject } from '@/context/ProjectContext';
import { useRole } from '@/context/RoleContext';
import { useCatalog, CatalogItem, CatalogItemWork } from '@/context/CatalogContext';
import { useCategoryFilter } from '@/context/CategoryFilterContext';
import { supabase } from '@/integrations/supabase/client';
import { FileSpreadsheet, Printer, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { evaluateNameFormula, evaluatePriceFormula, evaluateFormula, calculateWorkHours } from '@/lib/costCalculator';
import { buildEffectiveParameters } from '@/lib/parameterUtils';
import { useProductChainages, formatChainageDisplay } from '@/hooks/useProductChainages';
import tievahtiLogo from '@/assets/tievahti-logo.svg';

export function CostEstimatePanel() {
  const { project, allProducts: rawProducts, addCustomCost, removeCustomCost } = useProject();
  const { canEdit } = useRole();
  const { items, workTypes } = useCatalog();
  const { filter } = useCategoryFilter();
  
  // Filter products by active category
  const allProducts = useMemo(() => {
    if (filter === 'all') return rawProducts;
    if (filter === 'uncategorized') return rawProducts.filter(p => !p.categoryId);
    return rawProducts.filter(p => p.categoryId === filter);
  }, [rawProducts, filter]);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [newCostDescription, setNewCostDescription] = useState('');
  const [newCostAmount, setNewCostAmount] = useState('');
  
  // Resolve chainage from DB or calculate on-the-fly
  const chainageMap = useProductChainages(project?.id, allProducts);

  // Helper to get catalog item by ID
  const getItemById = (id: string): CatalogItem | undefined => {
    return items.find(item => item.id === id);
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  const handleAddCustomCost = () => {
    if (newCostDescription && newCostAmount) {
      addCustomCost(newCostDescription, parseFloat(newCostAmount) || 0);
      setNewCostDescription('');
      setNewCostAmount('');
    }
  };

  // Get custom costs from project
  const customCosts = project?.customCosts || [];

  const catalogItemIds = useMemo(() => {
    if (!project) return [] as string[];
    const ids = allProducts.map(p => p.productDefinitionId);
    return Array.from(new Set(ids));
  }, [project, allProducts]);

  // Fetch compositions for operations (toimenpiteet) - must be before allItemIdsForWork
  const { data: compositionsByParentId = {} } = useQuery<Record<string, Array<{
    id: string;
    parentItemId: string;
    childItemId: string;
    quantityFactorFormula: string;
    label?: string;
    sortOrder: number;
    childItem?: CatalogItem;
  }>>>({
    queryKey: ['catalog_composition', catalogItemIds],
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
            unitPrice: Number(childItemData.unit_price),
            vatRate: Number(childItemData.vat_rate),
            defaultParameters: childItemData.default_parameters || [],
            quantityFormula: childItemData.quantity_formula || undefined,
            nameFormula: childItemData.name_formula || undefined,
            priceFormula: childItemData.price_formula || undefined,
            markerStyle: childItemData.marker_style || { color: '#505050', shape: 'circle', size: 24 },
            measureType: childItemData.measure_type,
            allowedGeometries: childItemData.allowed_geometries,
            isActive: childItemData.is_active,
            sortOrder: childItemData.sort_order,
            category: childItemData.category || undefined,
            createdAt: new Date(childItemData.created_at),
            updatedAt: new Date(childItemData.updated_at),
          } : undefined,
        };

        if (!grouped[composition.parentItemId]) grouped[composition.parentItemId] = [];
        grouped[composition.parentItemId].push(composition);
      }
      return grouped;
    },
  });

  // Collect all item IDs (parent + child) for work requirements fetch
  const allItemIdsForWork = useMemo(() => {
    const ids = new Set(catalogItemIds);
    // Add child item IDs from compositions
    Object.values(compositionsByParentId).forEach(compositions => {
      compositions.forEach(comp => {
        if (comp.childItemId) {
          ids.add(comp.childItemId);
        }
      });
    });
    return Array.from(ids);
  }, [catalogItemIds, compositionsByParentId]);

  // Fetch work requirements for all catalog items INCLUDING child items
  const { data: workReqsByItemId = {} } = useQuery<Record<string, CatalogItemWork[]>>({
    queryKey: ['catalog_item_work', allItemIdsForWork],
    enabled: allItemIdsForWork.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_item_work')
        .select('*')
        .in('catalog_item_id', allItemIdsForWork);

      if (error) throw error;

      const grouped: Record<string, CatalogItemWork[]> = {};
      for (const row of (data ?? []) as any[]) {
        const req: CatalogItemWork = {
          id: row.id,
          catalogItemId: row.catalog_item_id,
          workTypeId: row.work_type_id,
          hoursPerUnit: Number(row.hours_per_unit),
          hoursFormula: row.hours_formula ?? undefined,
          description: row.description ?? undefined,
        };

        if (!grouped[req.catalogItemId]) grouped[req.catalogItemId] = [];
        grouped[req.catalogItemId].push(req);
      }
      return grouped;
    },
  });

  // Chainage is now resolved via useProductChainages hook

  const costSummary = useMemo(() => {
    if (!project) return null;

    const vatPercentage = typeof project.vatPercentage === 'number' ? project.vatPercentage : 25.5;

    let totalMaterialCost = 0;
    let totalWorkCost = 0;
    let totalWorkHours = 0;

    // Group by category AND resolved name (for dynamic naming)
    const categorizedItems: Map<string, Array<{
      id: string;
      resolvedName: string;
      productName: string;
      quantity: number;
      unit: string;
      materialCost: number;
      unitPriceExclVat: number;
      unitPriceInclVat: number;
      chainage: string; // Paaluväli or paalupiste
      childDetails: Array<{ name: string; quantity: number; unit: string; cost: number; unitPrice: number }>;
      workDetails: Array<{ name: string; hours: number; cost: number; hourlyRate: number }>;
      workHours: number;
      workCost: number;
      total: number;
    }>> = new Map();

    // First pass: calculate individual items with resolved names
    const itemsWithResolvedNames = allProducts.map(productInstance => {
      const catalogItem = getItemById(productInstance.productDefinitionId);
      if (!catalogItem) return null;

      const category = catalogItem.category || 'Muut';

      // Calculate base quantity
      let quantity = 1;
      let length = 0;
      // Resolve chainage from hook
      const resolved = chainageMap[productInstance.id];
      let chainageStart = resolved?.chainageStart ?? 0;
      let chainageEnd = resolved?.chainageEnd ?? 0;
      const params = buildEffectiveParameters(productInstance.parameters, catalogItem.defaultParameters);
      
      if (productInstance.geometry.type === 'line') {
        const coords = productInstance.geometry.coordinates;
        
        for (let i = 1; i < coords.length; i++) {
          const [lat1, lon1] = coords[i - 1];
          const [lat2, lon2] = coords[i];
          length += calculateDistance(lat1, lon1, lat2, lon2);
        }
        quantity = length;

        // Apply parameters based on unit type
        const width = params.leveys_m ?? 1;
        const thickness = params.paksuus_m ?? 1;
        
        if (catalogItem.unit === 'm³rtr') {
          quantity = length * width * thickness;
        } else if (catalogItem.unit === 'm²') {
          quantity = length * width;
        }
      }

      // Build variables for formula evaluation
      const formulaVariables: Record<string, number> = {
        ...params,
        length,
        pituus: length,
        quantity,
      };

      if (formulaVariables.pituus_m === undefined && length > 0) {
        formulaVariables.pituus_m = length;
      }

      // Build string variables for if(param()) support
      const stringVars: Record<string, string> = productInstance.stringParameters ?? {};

      // If there's a quantity formula, use it first
      if (catalogItem.quantityFormula) {
        quantity = evaluateFormula(catalogItem.quantityFormula, formulaVariables, stringVars);
        formulaVariables.quantity = quantity;
      }

      // Evaluate dynamic name formula
      const resolvedName = evaluateNameFormula(
        catalogItem.nameFormula,
        catalogItem.name,
        formulaVariables
      );

      // Evaluate dynamic price formula (pass stringVars so if(param()) works)
      const unitPrice = evaluatePriceFormula(
        catalogItem.priceFormula,
        catalogItem.unitPrice,
        formulaVariables,
        stringVars
      );

      // Calculate material cost
      let materialCost = 0;
      const childDetails: Array<{ name: string; quantity: number; unit: string; cost: number; unitPrice: number }> = [];

      // Calculate work cost - needed for both product and operation
      let workHours = 0;
      let workCost = 0;
      const workDetails: Array<{ name: string; hours: number; cost: number; hourlyRate: number }> = [];

      if (catalogItem.type === 'operation') {
        const compositions = compositionsByParentId[catalogItem.id] || [];
        
        compositions.forEach(comp => {
          if (!comp.childItem) return;
          
          const childQuantity = evaluateFormula(comp.quantityFactorFormula, formulaVariables, stringVars);
          const childUnitPrice = evaluatePriceFormula(
            comp.childItem.priceFormula,
            comp.childItem.unitPrice,
            { ...formulaVariables, quantity: childQuantity },
            stringVars
          );
          
          const childCost = childQuantity * childUnitPrice;
          materialCost += childCost;
          
          const childResolvedName = evaluateNameFormula(comp.label, comp.childItem.name, { ...formulaVariables, quantity: childQuantity });

          // Only include child in details if non-zero
          if (childQuantity > 0 || childCost > 0) {
            childDetails.push({
              name: childResolvedName,
              quantity: childQuantity,
              unit: comp.childItem.unit,
              cost: childCost,
              unitPrice: childUnitPrice,
            });
          }

          // Calculate child item work requirements
          const childWorkReqs = workReqsByItemId[comp.childItem.id] || [];
          const childFormulaVars = { ...formulaVariables, quantity: childQuantity };
          
          childWorkReqs.forEach(req => {
            const workType = workTypes.find(wt => wt.id === req.workTypeId);
            if (!workType) return;

            const hours = calculateWorkHours(childQuantity, req, childFormulaVars, stringVars);
            const cost = hours * workType.hourlyRate;

            if (hours > 0 || cost > 0) {
              workDetails.push({ 
                name: `${childResolvedName}: ${workType.name}`, 
                hours, 
                cost, 
                hourlyRate: workType.hourlyRate 
              });
            }

            workHours += hours;
            workCost += cost;
          });
        });

        // Also add operation's own work requirements (if any)
        const parentWorkReqs = workReqsByItemId[catalogItem.id] || [];
        parentWorkReqs.forEach(req => {
          const workType = workTypes.find(wt => wt.id === req.workTypeId);
          if (!workType) return;

          const hours = calculateWorkHours(quantity, req, formulaVariables, stringVars);
          const cost = hours * workType.hourlyRate;

          if (hours > 0 || cost > 0) {
            workDetails.push({ name: workType.name, hours, cost, hourlyRate: workType.hourlyRate });
          }

          workHours += hours;
          workCost += cost;
        });
      } else {
        materialCost = quantity * unitPrice;

        // Calculate work cost for regular products
        const workReqs = workReqsByItemId[catalogItem.id] || [];
        workReqs.forEach(req => {
          const workType = workTypes.find(wt => wt.id === req.workTypeId);
          if (!workType) return;

          const hours = calculateWorkHours(quantity, req, formulaVariables, stringVars);
          const cost = hours * workType.hourlyRate;

          if (hours > 0 || cost > 0) {
            workDetails.push({ name: workType.name, hours, cost, hourlyRate: workType.hourlyRate });
          }

          workHours += hours;
          workCost += cost;
        });
      }

      totalMaterialCost += materialCost;
      totalWorkCost += workCost;
      totalWorkHours += workHours;

      // Build chainage string using resolved values
      const isLine = productInstance.geometry.type === 'line';
      const chainageStr = formatChainageDisplay(chainageStart, chainageEnd, isLine);

      return {
        id: productInstance.id,
        category,
        resolvedName,
        productName: catalogItem.name,
        quantity,
        unit: catalogItem.unit,
        materialCost,
        unitPriceExclVat: unitPrice,
        unitPriceInclVat: unitPrice * (1 + vatPercentage / 100),
        chainage: chainageStr,
        childDetails,
        workDetails,
        workHours,
        workCost,
        total: materialCost + workCost,
      };
    }).filter(Boolean) as Array<{
      id: string;
      category: string;
      resolvedName: string;
      productName: string;
      quantity: number;
      unit: string;
      materialCost: number;
      unitPriceExclVat: number;
      unitPriceInclVat: number;
      chainage: string;
      childDetails: Array<{ name: string; quantity: number; unit: string; cost: number; unitPrice: number }>;
      workDetails: Array<{ name: string; hours: number; cost: number; hourlyRate: number }>;
      workHours: number;
      workCost: number;
      total: number;
    }>;

    // Second pass: group by category, aggregate by resolved name, merge chainages
    itemsWithResolvedNames.forEach(item => {
      const existing = categorizedItems.get(item.category) || [];
      const existingIndex = existing.findIndex(e => e.resolvedName === item.resolvedName);
      
      if (existingIndex >= 0) {
        // Aggregate quantities and costs
        existing[existingIndex].quantity += item.quantity;
        existing[existingIndex].materialCost += item.materialCost;
        existing[existingIndex].workHours += item.workHours;
        existing[existingIndex].workCost += item.workCost;
        existing[existingIndex].total += item.total;
        // Merge chainages
        if (existing[existingIndex].chainage && item.chainage) {
          existing[existingIndex].chainage += ', ' + item.chainage;
        }
        // Aggregate child details
        item.childDetails.forEach(child => {
          const existingChild = existing[existingIndex].childDetails.find(c => c.name === child.name);
          if (existingChild) {
            existingChild.quantity += child.quantity;
            existingChild.cost += child.cost;
          } else {
            existing[existingIndex].childDetails.push({ ...child });
          }
        });
        // Aggregate work details
        item.workDetails.forEach(work => {
          const existingWork = existing[existingIndex].workDetails.find(w => w.name === work.name);
          if (existingWork) {
            existingWork.hours += work.hours;
            existingWork.cost += work.cost;
          } else {
            existing[existingIndex].workDetails.push({ ...work });
          }
        });
      } else {
        existing.push({
          id: item.id,
          resolvedName: item.resolvedName,
          productName: item.productName,
          quantity: item.quantity,
          unit: item.unit,
          materialCost: item.materialCost,
          unitPriceExclVat: item.unitPriceExclVat,
          unitPriceInclVat: item.unitPriceInclVat,
          chainage: item.chainage,
          childDetails: [...item.childDetails],
          workDetails: [...item.workDetails],
          workHours: item.workHours,
          workCost: item.workCost,
          total: item.total,
        });
      }
      
      categorizedItems.set(item.category, existing);
    });

    // Add custom costs
    const totalCustomCostsExclVat = customCosts.reduce((sum, c) => sum + c.amount, 0);
    const customCostsVat = totalCustomCostsExclVat * (vatPercentage / 100);
    const totalCustomCostsInclVat = totalCustomCostsExclVat + customCostsVat;

    const totalExclVat = totalMaterialCost + totalWorkCost + totalCustomCostsExclVat;
    const vatAmount = totalExclVat * (vatPercentage / 100);
    const totalInclVat = totalExclVat + vatAmount;

    return {
      categorizedItems,
      totalMaterialCost,
      totalWorkCost,
      totalWorkHours,
      totalCustomCostsExclVat,
      customCostsVat,
      totalCustomCostsInclVat,
      totalExclVat,
      vatAmount,
      totalInclVat,
      vatPercentage,
    };
  }, [project, items, workTypes, customCosts, workReqsByItemId, compositionsByParentId, chainageMap]);

  const exportToCSV = () => {
    if (!project || !costSummary) return;

    const headers = ['Kategoria', 'Tuote', 'Paaluväli', 'Määrä', 'Yksikkö', 'Yksikköhinta alv 0%', 'Yksikköhinta sis. alv', 'Hinta yhteensä sis. alv'];
    const rows: string[][] = [];

    costSummary.categorizedItems.forEach((items, category) => {
      items.forEach(item => {
        const totalInclVat = item.total * (1 + costSummary.vatPercentage / 100);
        rows.push([
          category,
          item.resolvedName,
          item.chainage,
          item.quantity.toFixed(2),
          item.unit,
          item.unitPriceExclVat.toFixed(2),
          item.unitPriceInclVat.toFixed(2),
          totalInclVat.toFixed(2),
        ]);
      });
    });

    customCosts.forEach(cost => {
      const vatAmount = cost.amount * (costSummary.vatPercentage / 100);
      rows.push(['Lisäkulut', cost.description, '', '', '', cost.amount.toFixed(2), '', (cost.amount + vatAmount).toFixed(2)]);
    });

    rows.push([]);
    rows.push(['Kustannukset yhteensä:', '', '', '', '', '', '', costSummary.totalInclVat.toFixed(2) + ' €']);

    const csv = [headers, ...rows].map(row => row.join(';')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project.name}-kustannusarvio.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const printEstimate = () => {
    if (!project || !costSummary) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const currentDate = new Date().toLocaleDateString('fi-FI');
    const roadLength = project.roadGeometry ? project.roadGeometry.totalLength.toFixed(2) : '0,00';
    const vatRate = costSummary.vatPercentage;

    // Build cost table rows
    let tableRows = '';
    
    costSummary.categorizedItems.forEach((items, category) => {
      // Category header row
      tableRows += `
        <tr class="category-row">
          <td colspan="7" style="font-weight:700;background:#f0f4f8;padding:10px 8px;">${category}</td>
        </tr>
      `;
      
      items.forEach(item => {
        const totalInclVat = item.total * (1 + vatRate / 100);
        
        // Main item row
        tableRows += `
          <tr>
            <td style="padding-left:16px;">- ${item.resolvedName}</td>
            <td class="center">${item.chainage || ''}</td>
            <td class="right">${item.quantity.toFixed(2)}</td>
            <td class="center">${item.unit}</td>
            <td class="right">${item.unitPriceExclVat > 0 ? item.unitPriceExclVat.toFixed(2) + ' €' : '-'}</td>
            <td class="right">${item.unitPriceInclVat > 0 ? item.unitPriceInclVat.toFixed(2) + ' €' : '-'}</td>
            <td class="right">${item.materialCost > 0 ? (item.materialCost * (1 + vatRate / 100)).toFixed(2) + ' €' : '-'}</td>
          </tr>
        `;
        
         // Child product rows (materials for operations) - as separate rows after parent
         item.childDetails.forEach(child => {
           const childInclVat = child.cost * (1 + vatRate / 100);
           tableRows += `
             <tr class="child-row">
               <td style="padding-left:32px;color:#666;">– ${child.name}</td>
               <td class="center"></td>
               <td class="right">${child.quantity.toFixed(2)}</td>
               <td class="center">${child.unit}</td>
               <td class="right">${child.unitPrice.toFixed(2)} €</td>
               <td class="right">${(child.unitPrice * (1 + vatRate / 100)).toFixed(2)} €</td>
               <td class="right">${childInclVat.toFixed(2)} €</td>
             </tr>
           `;
         });
 
        // Work rows (indented)
        item.workDetails.forEach(work => {
          const workInclVat = work.cost * (1 + vatRate / 100);
          tableRows += `
            <tr class="work-row">
              <td style="padding-left:32px;color:#666;">- ${work.name}</td>
              <td class="center"></td>
              <td class="right">${work.hours.toFixed(2)}</td>
              <td class="center">h</td>
              <td class="right">${work.hourlyRate.toFixed(2)} €</td>
              <td class="right">${(work.hourlyRate * (1 + vatRate / 100)).toFixed(2)} €</td>
              <td class="right">${workInclVat.toFixed(2)} €</td>
            </tr>
          `;
        });
      });
    });

    // Custom costs
    if (customCosts.length > 0) {
      tableRows += `
        <tr class="category-row">
          <td colspan="7" style="font-weight:700;background:#fef3c7;padding:10px 8px;">Lisäkulut</td>
        </tr>
      `;
      
      customCosts.forEach(cost => {
        const vatAmount = cost.amount * (vatRate / 100);
        const inclVat = cost.amount + vatAmount;
        tableRows += `
          <tr>
            <td style="padding-left:16px;">- ${cost.description}</td>
            <td class="center"></td>
            <td class="right">1,00</td>
            <td class="center">kpl</td>
            <td class="right">${cost.amount.toFixed(2)} €</td>
            <td class="right">${inclVat.toFixed(2)} €</td>
            <td class="right">${inclVat.toFixed(2)} €</td>
          </tr>
        `;
      });
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${project.name} - Kustannusarvio</title>
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
          
          .cost-section h2 {
            font-size: 13px;
            color: #505050;
            margin-bottom: 12px;
            font-weight: 600;
          }
          
          .cost-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
            margin-bottom: 20px;
          }
          
          .cost-table th {
            background: #505050;
            color: white;
            padding: 8px 6px;
            text-align: left;
            font-weight: 600;
            font-size: 9px;
          }
          
          .cost-table th.right { text-align: right; }
          .cost-table th.center { text-align: center; }
          
          .cost-table td {
            padding: 6px;
            border-bottom: 1px solid #e5e7eb;
            vertical-align: top;
          }
          
          .cost-table td.right { text-align: right; }
          .cost-table td.center { text-align: center; }
          
          .work-row td {
            font-size: 9px;
            background: #fefce8;
          }
           
           .child-row td {
             font-size: 9px;
             background: #f0f9ff;
           }
          
          .total-row {
            background: #22C3F3;
            color: white;
            font-weight: 700;
            font-size: 14px;
          }
          
          .total-row td {
            padding: 12px 6px;
            border: none;
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
              <div class="header-title">HANKKEEN KUSTANNUSARVIO</div>
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
                <span class="project-info-label">Tien pituus:</span>
                <span class="project-info-value">${roadLength} metriä</span>
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
          
          <div class="cost-section">
            <h2>Projektin kustannukset</h2>
            <table class="cost-table">
              <thead>
                <tr>
                  <th style="width:30%;">Tehtävät työt -selite</th>
                  <th class="center" style="width:15%;">Sijainti tiellä<br/>Paaluväli, pvl</th>
                  <th class="right" style="width:10%;">Suoritemäärä</th>
                  <th class="center" style="width:8%;">Suoriteyksikkö</th>
                  <th class="right" style="width:12%;">Yksikköhinta €<br/>alv 0%</th>
                  <th class="right" style="width:12%;">Yksikköhinta €<br/>alv ${vatRate}%</th>
                  <th class="right" style="width:13%;">Hinta yhteensä €<br/>sis. alv</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
                <tr class="total-row">
                  <td colspan="6">Kustannukset yhteensä:</td>
                  <td class="right">${costSummary.totalInclVat.toFixed(2)} €</td>
                </tr>
              </tbody>
            </table>
          </div>
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

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  if (!project) {
    return (
      <div className="p-4 text-sidebar-foreground/70 text-sm">
        Luo projekti nähdäksesi kustannusarvion.
      </div>
    );
  }

  if (!costSummary || (costSummary.categorizedItems.size === 0 && customCosts.length === 0)) {
    return (
      <div className="p-4 text-sidebar-foreground/70 text-sm">
        Lisää tuotteita projektiin nähdäksesi kustannusarvion.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {/* Header with export buttons */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-sidebar-foreground">Kustannusarvio</h3>
        <div className="flex gap-1.5 shrink-0">
          <Button 
            size="sm" 
            className="h-7 px-2.5 gap-1 text-xs bg-primary hover:bg-primary/90 text-primary-foreground" 
            title="Tulosta PDF" 
            onClick={printEstimate}
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

      {/* Categorized items list */}
      <div>
        <div className="space-y-2">
          {Array.from(costSummary.categorizedItems.entries()).map(([category, items]) => {
            const isExpanded = expandedCategories.includes(category);
            const categoryTotal = items.reduce((sum, item) => sum + item.total, 0);
            
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
                    <span className="text-xs font-semibold text-sidebar-foreground">
                      {category}
                    </span>
                    <span className="text-xs text-sidebar-foreground/50">
                      ({items.length})
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-primary">
                    {categoryTotal.toFixed(0)} €
                  </span>
                </button>

                {/* Category items */}
                {isExpanded && (
                  <div className="px-2 pb-2 space-y-1">
                    {items.map((item, itemIndex) => {
                      const itemVat = item.total * (costSummary.vatPercentage / 100);
                      const itemTotalInclVat = item.total + itemVat;
                      
                      return (
                        <div
                          key={`${item.id}-${itemIndex}`}
                          className="bg-sidebar-accent/30 rounded p-2 text-xs"
                        >
                          {/* Header row */}
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-medium text-sidebar-foreground">{item.resolvedName}</span>
                            <div className="text-right">
                              <div className="font-semibold text-sidebar-foreground">
                                {itemTotalInclVat.toFixed(0)} €
                              </div>
                              <div className="text-[10px] text-sidebar-foreground/50">
                                (alv 0%: {item.total.toFixed(0)} €)
                              </div>
                            </div>
                          </div>
                          
                          <div className="text-sidebar-foreground/60 mb-1 space-y-0.5">
                            <div className="whitespace-nowrap">{item.quantity.toFixed(1)} {item.unit}</div>
                            {item.chainage && <div className="font-mono text-[10px] break-all">PL {item.chainage}</div>}
                          </div>
                          
                          {/* Child products breakdown (for operations) */}
                          {item.childDetails && item.childDetails.length > 0 && (
                            <div className="mt-1 pt-1 border-t border-sidebar-border/50">
                              <div className="text-sidebar-foreground/50 text-[10px] uppercase tracking-wide mb-0.5">Materiaalit</div>
                              {item.childDetails.map((child, idx) => (
                                <div key={idx} className="flex justify-between text-sidebar-foreground/70">
                                  <span>{child.name} ({child.quantity.toFixed(1)} {child.unit})</span>
                                  <span>{child.cost.toFixed(0)} €</span>
                                </div>
                              ))}
                              <div className="flex justify-between text-sidebar-foreground/80 font-medium mt-0.5 pt-0.5 border-t border-sidebar-border/30">
                                <span>Materiaalit yht.</span>
                                <span>{item.materialCost.toFixed(0)} €</span>
                              </div>
                            </div>
                          )}
                          
                          {/* Simple material cost (for regular products without child details) */}
                          {(!item.childDetails || item.childDetails.length === 0) && item.materialCost > 0 && (
                            <div className="flex justify-between text-sidebar-foreground/60">
                              <span>Materiaalit</span>
                              <span>{item.materialCost.toFixed(0)} €</span>
                            </div>
                          )}
                          
                          {/* Work details with hourly rates */}
                          {item.workDetails.length > 0 && (
                            <div className="mt-1 pt-1 border-t border-sidebar-border/50">
                              <div className="text-sidebar-foreground/50 text-[10px] uppercase tracking-wide mb-0.5">Työ</div>
                              {item.workDetails.map((work, idx) => (
                                <div key={idx} className="flex justify-between text-sidebar-foreground/70">
                                  <span>
                                    {work.name} ({work.hours.toFixed(1)} h × {work.hourlyRate.toFixed(0)} €/h)
                                  </span>
                                  <span>{work.cost.toFixed(0)} €</span>
                                </div>
                              ))}
                              <div className="flex justify-between text-sidebar-foreground/80 font-medium mt-0.5 pt-0.5 border-t border-sidebar-border/30">
                                <span>Työ yht.</span>
                                <span>{item.workCost.toFixed(0)} €</span>
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

          {/* Custom Costs Section */}
          {customCosts.length > 0 && (
            <div className="bg-primary/5 rounded-md overflow-hidden">
              <button
                onClick={() => toggleCategory('__custom__')}
                className="w-full flex items-center justify-between p-2 hover:bg-primary/10 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {expandedCategories.includes('__custom__') ? (
                    <ChevronDown className="w-4 h-4 text-primary/50" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-primary/50" />
                  )}
                  <span className="text-xs font-semibold text-primary">
                    Lisäkulut
                  </span>
                  <span className="text-xs text-primary/60">
                    ({customCosts.length})
                  </span>
                </div>
                <span className="text-xs font-semibold text-primary">
                  {costSummary.totalCustomCostsExclVat.toFixed(0)} €
                </span>
              </button>

              {expandedCategories.includes('__custom__') && (
                <div className="px-2 pb-2 space-y-1">
                  {customCosts.map((cost) => (
                    <div
                      key={cost.id}
                      className="bg-primary/10 rounded p-2 text-xs flex justify-between items-center"
                    >
                      <span className="font-medium text-sidebar-foreground">{cost.description}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sidebar-foreground">
                          {cost.amount.toFixed(0)} €
                        </span>
                        {canEdit() && (
                          <button
                            onClick={() => removeCustomCost(cost.id)}
                            className="p-1 hover:bg-destructive/20 rounded"
                            title="Poista"
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add custom cost form - only for editors */}
      {canEdit() && (
        <div className="p-3 border-t border-sidebar-border bg-sidebar-accent/10">
          <p className="text-xs text-sidebar-foreground/60 mb-2">Lisää muu kulu (alv 0%)</p>
          <div className="flex gap-2">
            <Input
              value={newCostDescription}
              onChange={e => setNewCostDescription(e.target.value)}
              placeholder="Kuvaus..."
              className="flex-1 h-8 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/40"
            />
            <Input
              type="number"
              value={newCostAmount}
              onChange={e => setNewCostAmount(e.target.value)}
              placeholder="€"
              className="w-20 h-8 text-xs bg-sidebar-accent border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/40"
            />
            <Button
              size="sm"
              className="h-8 px-2"
              onClick={handleAddCustomCost}
              disabled={!newCostDescription || !newCostAmount}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="p-3 border-t border-sidebar-border bg-sidebar-accent/30">
        <div className="space-y-1 text-xs">
          <div className="flex justify-between text-sidebar-foreground/70">
            <span>Materiaalit</span>
            <span>{costSummary.totalMaterialCost.toFixed(0)} €</span>
          </div>
          <div className="flex justify-between text-sidebar-foreground/70">
            <span>Työt ({costSummary.totalWorkHours.toFixed(1)} h)</span>
            <span>{costSummary.totalWorkCost.toFixed(0)} €</span>
          </div>
          {costSummary.totalCustomCostsExclVat > 0 && (
            <div className="flex justify-between text-sidebar-foreground/70">
              <span>Lisäkulut</span>
              <span>{costSummary.totalCustomCostsExclVat.toFixed(0)} €</span>
            </div>
          )}
          <div className="flex justify-between text-sidebar-foreground/70 pt-1 border-t border-sidebar-border/50">
            <span>Yhteensä (alv 0%)</span>
            <span>{costSummary.totalExclVat.toFixed(0)} €</span>
          </div>
          <div className="flex justify-between text-sidebar-foreground/70">
            <span>ALV {costSummary.vatPercentage}%</span>
            <span>{costSummary.vatAmount.toFixed(0)} €</span>
          </div>
          <div className="flex justify-between font-semibold text-primary pt-1 border-t border-sidebar-border">
            <span>Yhteensä (sis. alv)</span>
            <span>{costSummary.totalInclVat.toFixed(0)} €</span>
          </div>
        </div>
      </div>
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
