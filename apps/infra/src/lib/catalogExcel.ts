/**
 * Catalog Excel Export / Import
 *
 * Sheet layout:
 *  1. Tuotteet_Toimenpiteet  – catalog_items (both products & operations)
 *  2. Työtyypit              – work_types
 *  3. Koosteet               – catalog_composition (operation → child item links)
 *  4. Työmäärät              – catalog_item_work (item → work_type hours)
 *
 * Import creates NEW rows only (no update / delete).
 * Compositions & work-requirements are matched by item name → DB id after insert.
 */

import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import type { CatalogItem, WorkType, CatalogComposition, CatalogItemWork, CatalogParameter } from '@/types/catalog';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeJson(val: unknown): string {
  if (val === undefined || val === null || val === '') return '';
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
}

function parseJsonField<T>(val: unknown, fallback: T): T {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'object') return val as T;
  try { return JSON.parse(String(val)) as T; } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// EXPORT
// ---------------------------------------------------------------------------

export async function exportCatalogToExcel(
  items: CatalogItem[],
  workTypes: WorkType[],
): Promise<void> {
  // Fetch all compositions and work requirements in parallel
  const itemIds = items.map(i => i.id);

  // Guard: if no items, skip DB queries
  const [compRes, workReqRes] = itemIds.length > 0
    ? await Promise.all([
        supabase
          .from('catalog_composition')
          .select('*')
          .in('parent_item_id', itemIds),
        supabase
          .from('catalog_item_work')
          .select('*')
          .in('catalog_item_id', itemIds),
      ])
    : [{ data: [] }, { data: [] }];

  const compositions: any[] = compRes.data || [];
  const workReqs: any[] = workReqRes.data || [];

  const itemById = new Map(items.map(i => [i.id, i]));
  const wtById  = new Map(workTypes.map(w => [w.id, w]));

  // ---- Sheet 1: Items ----
  const itemRows = items.map(item => ({
    id:                   item.id,
    nimi:                 item.name,
    tyyppi:               item.type,
    yksikko:              item.unit,
    yksikkohinta:         item.unitPrice,
    alv_prosentti:        item.vatRate,
    kategoria:            item.category || '',
    mittaustyyppi:        item.measureType,
    sallitut_geometriat:  item.allowedGeometries.join(','),
    aktiivinen:           item.isActive ? 1 : 0,
    jarjestys:            item.sortOrder,
    maara_kaava:          item.quantityFormula || '',
    nimi_kaava:           item.nameFormula || '',
    hinta_kaava:          item.priceFormula || '',
    marker_vari:          item.markerStyle?.color || '',
    marker_muoto:         item.markerStyle?.shape || '',
    marker_koko:          item.markerStyle?.size || 24,
    marker_kuva:          item.markerStyle?.image || '',
    marker_viiva_leveys:  item.markerStyle?.lineWidth ?? '',
    marker_katkoviiva:    item.markerStyle?.dashArray || '',
    marker_opacity:       item.markerStyle?.opacity ?? '',
    marker_offset:        item.markerStyle?.strokeOffset ?? '',
    parametrit_json:      safeJson(item.defaultParameters),
  }));

  // ---- Sheet 2: Work types ----
  const wtRows = workTypes.map(wt => ({
    id:          wt.id,
    nimi:        wt.name,
    tuntihinta:  wt.hourlyRate,
    alv_prosentti: wt.vatRate,
    kuvaus:      wt.description || '',
  }));

  // ---- Sheet 3: Compositions ----
  const compRows = compositions.map(c => ({
    parent_id:          c.parent_item_id,
    parent_nimi:        itemById.get(c.parent_item_id)?.name || '',
    child_id:           c.child_item_id,
    child_nimi:         itemById.get(c.child_item_id)?.name || '',
    maara_kerroin_kaava: c.quantity_factor_formula,
    etiketti:           c.label || '',
    jarjestys:          c.sort_order,
  }));

  // ---- Sheet 4: Work requirements ----
  const wrRows = workReqs.map(w => ({
    item_id:      w.catalog_item_id,
    item_nimi:    itemById.get(w.catalog_item_id)?.name || '',
    tyotyyppi_id: w.work_type_id,
    tyotyyppi:    wtById.get(w.work_type_id)?.name || '',
    tunnit_per_yksikko: w.hours_per_unit,
    tunnit_kaava:       w.hours_formula || '',
    kuvaus:             w.description || '',
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows),  'Tuotteet_Toimenpiteet');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wtRows),    'Työtyypit');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(compRows),  'Koosteet');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wrRows),    'Työmäärät');

  XLSX.writeFile(wb, `tievahti-katalogi-${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ---------------------------------------------------------------------------
// IMPORT – parse & validate
// ---------------------------------------------------------------------------

export interface ImportPreview {
  newItems:    CatalogItemImportRow[];
  newWorkTypes: WorkTypeImportRow[];
  newCompositions: CompositionImportRow[];
  newWorkReqs:     WorkReqImportRow[];
  errors: string[];
}

export interface CatalogItemImportRow {
  name: string;
  type: 'product' | 'operation';
  unit: string;
  unitPrice: number;
  vatRate: number;
  category: string;
  measureType: 1 | 2;
  allowedGeometries: string[];
  isActive: boolean;
  sortOrder: number;
  quantityFormula?: string;
  nameFormula?: string;
  priceFormula?: string;
  markerStyle: {
    color: string; shape: string; size: number;
    image?: string; lineWidth?: number; dashArray?: string;
    opacity?: number; strokeOffset?: number;
  };
  defaultParameters: CatalogParameter[];
}

export interface WorkTypeImportRow {
  name: string;
  hourlyRate: number;
  vatRate: number;
  description?: string;
}

export interface CompositionImportRow {
  parentName: string;
  childName: string;
  quantityFactorFormula: string;
  label?: string;
  sortOrder: number;
}

export interface WorkReqImportRow {
  itemName: string;
  workTypeName: string;
  hoursPerUnit: number;
  hoursFormula?: string;
  description?: string;
}

export function parseCatalogExcel(file: File): Promise<ImportPreview> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const errors: string[] = [];
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });

      // ---- Items ----
      const itemSheet = wb.Sheets['Tuotteet_Toimenpiteet'];
      const rawItems: any[] = itemSheet ? XLSX.utils.sheet_to_json(itemSheet) : [];

      const newItems: CatalogItemImportRow[] = [];
      rawItems.forEach((row, i) => {
        const name = String(row.nimi || '').trim();
        if (!name) { errors.push(`Rivi ${i+2} (Tuotteet): nimi puuttuu`); return; }

        const type = String(row.tyyppi || '').trim();
        if (type !== 'product' && type !== 'operation') {
          errors.push(`Rivi ${i+2}: tyyppi pitää olla 'product' tai 'operation' (oli: ${type})`);
          return;
        }

        const geoStr = String(row.sallitut_geometriat || 'point');
        const allowedGeometries = geoStr.split(',').map(s => s.trim()).filter(Boolean);

        const params = parseJsonField<CatalogParameter[]>(row.parametrit_json, []);

        newItems.push({
          name,
          type: type as 'product' | 'operation',
          unit: String(row.yksikko || 'kpl'),
          unitPrice: Number(row.yksikkohinta) || 0,
          vatRate: Number(row.alv_prosentti) || 25.5,
          category: String(row.kategoria || 'Muut'),
          measureType: Number(row.mittaustyyppi) === 1 ? 1 : 2,
          allowedGeometries,
          isActive: Number(row.aktiivinen) !== 0,
          sortOrder: Number(row.jarjestys) || 0,
          quantityFormula: row.maara_kaava || undefined,
          nameFormula:     row.nimi_kaava  || undefined,
          priceFormula:    row.hinta_kaava || undefined,
          markerStyle: {
            color:       String(row.marker_vari  || '#505050'),
            shape:       String(row.marker_muoto || 'circle'),
            size:        Number(row.marker_koko)  || 24,
            image:       row.marker_kuva          || undefined,
            lineWidth:   row.marker_viiva_leveys !== '' ? Number(row.marker_viiva_leveys) : undefined,
            dashArray:   row.marker_katkoviiva    || undefined,
            opacity:     row.marker_opacity !== '' ? Number(row.marker_opacity) : undefined,
            strokeOffset:row.marker_offset  !== '' ? Number(row.marker_offset)  : undefined,
          },
          defaultParameters: params,
        });
      });

      // ---- Work types ----
      const wtSheet = wb.Sheets['Työtyypit'];
      const rawWt: any[] = wtSheet ? XLSX.utils.sheet_to_json(wtSheet) : [];
      const newWorkTypes: WorkTypeImportRow[] = rawWt
        .filter(r => String(r.nimi || '').trim())
        .map(r => ({
          name:        String(r.nimi).trim(),
          hourlyRate:  Number(r.tuntihinta) || 0,
          vatRate:     Number(r.alv_prosentti) || 25.5,
          description: r.kuvaus || undefined,
        }));

      // ---- Compositions ----
      const compSheet = wb.Sheets['Koosteet'];
      const rawComp: any[] = compSheet ? XLSX.utils.sheet_to_json(compSheet) : [];
      const newCompositions: CompositionImportRow[] = rawComp
        .filter(r => String(r.parent_nimi || '').trim() && String(r.child_nimi || '').trim())
        .map(r => ({
          parentName:           String(r.parent_nimi).trim(),
          childName:            String(r.child_nimi).trim(),
          quantityFactorFormula: String(r.maara_kerroin_kaava || '1'),
          label:                r.etiketti || undefined,
          sortOrder:            Number(r.jarjestys) || 0,
        }));

      // ---- Work requirements ----
      const wrSheet = wb.Sheets['Työmäärät'];
      const rawWr: any[] = wrSheet ? XLSX.utils.sheet_to_json(wrSheet) : [];
      const newWorkReqs: WorkReqImportRow[] = rawWr
        .filter(r => String(r.item_nimi || '').trim() && String(r.tyotyyppi || '').trim())
        .map(r => ({
          itemName:      String(r.item_nimi).trim(),
          workTypeName:  String(r.tyotyyppi).trim(),
          hoursPerUnit:  Number(r.tunnit_per_yksikko) || 0,
          hoursFormula:  r.tunnit_kaava || undefined,
          description:   r.kuvaus || undefined,
        }));

      resolve({ newItems, newWorkTypes, newCompositions, newWorkReqs, errors });
    };
    reader.readAsArrayBuffer(file);
  });
}

// ---------------------------------------------------------------------------
// IMPORT – commit to database
// ---------------------------------------------------------------------------

export async function commitCatalogImport(preview: ImportPreview): Promise<{ ok: boolean; error?: string }> {
  try {
    // 1. Insert work types
    const wtNameToId = new Map<string, string>();

    if (preview.newWorkTypes.length > 0) {
      const { data: wtData, error: wtErr } = await supabase
        .from('work_types')
        .insert(preview.newWorkTypes.map(w => ({
          name: w.name,
          hourly_rate: w.hourlyRate,
          vat_rate: w.vatRate,
          description: w.description ?? null,
        })))
        .select('id, name');
      if (wtErr) throw new Error(`Työtyypit: ${wtErr.message}`);
      (wtData || []).forEach((r: any) => wtNameToId.set(r.name, r.id));
    }

    // Also load existing work types so we can resolve names for work-req import
    const { data: existingWt } = await supabase.from('work_types').select('id, name');
    (existingWt || []).forEach((r: any) => { if (!wtNameToId.has(r.name)) wtNameToId.set(r.name, r.id); });

    // 2. Insert catalog items
    const itemNameToId = new Map<string, string>();

    if (preview.newItems.length > 0) {
      const { data: itemData, error: itemErr } = await supabase
        .from('catalog_items')
        .insert(preview.newItems.map(item => ({
          name:               item.name,
          type:               item.type,
          unit:               item.unit,
          unit_price:         item.unitPrice,
          vat_rate:           item.vatRate,
          category:           item.category,
          measure_type:       item.measureType,
          allowed_geometries: item.allowedGeometries,
          is_active:          item.isActive,
          sort_order:         item.sortOrder,
          quantity_formula:   item.quantityFormula ?? null,
          name_formula:       item.nameFormula ?? null,
          price_formula:      item.priceFormula ?? null,
          marker_style:       item.markerStyle,
          default_parameters: item.defaultParameters as any,
          default_images:     [],
        })))
        .select('id, name');
      if (itemErr) throw new Error(`Tuotteet: ${itemErr.message}`);
      (itemData || []).forEach((r: any) => itemNameToId.set(r.name, r.id));
    }

    // Also load existing items so compositions can reference them
    const { data: existingItems } = await supabase.from('catalog_items').select('id, name').eq('is_active', true);
    (existingItems || []).forEach((r: any) => { if (!itemNameToId.has(r.name)) itemNameToId.set(r.name, r.id); });

    // 3. Insert compositions
    if (preview.newCompositions.length > 0) {
      const compInsert = preview.newCompositions
        .map(c => {
          const parentId = itemNameToId.get(c.parentName);
          const childId  = itemNameToId.get(c.childName);
          if (!parentId || !childId) return null;
          return {
            parent_item_id:         parentId,
            child_item_id:          childId,
            quantity_factor_formula: c.quantityFactorFormula,
            label:                  c.label ?? null,
            sort_order:             c.sortOrder,
          };
        })
        .filter(Boolean) as any[];

      if (compInsert.length > 0) {
        const { error: compErr } = await supabase.from('catalog_composition').insert(compInsert);
        if (compErr) throw new Error(`Koosteet: ${compErr.message}`);
      }
    }

    // 4. Insert work requirements
    if (preview.newWorkReqs.length > 0) {
      const wrInsert = preview.newWorkReqs
        .map(w => {
          const itemId   = itemNameToId.get(w.itemName);
          const wtId     = wtNameToId.get(w.workTypeName);
          if (!itemId || !wtId) return null;
          return {
            catalog_item_id: itemId,
            work_type_id:    wtId,
            hours_per_unit:  w.hoursPerUnit,
            hours_formula:   w.hoursFormula ?? null,
            description:     w.description  ?? null,
          };
        })
        .filter(Boolean) as any[];

      if (wrInsert.length > 0) {
        const { error: wrErr } = await supabase.from('catalog_item_work').insert(wrInsert);
        if (wrErr) throw new Error(`Työmäärät: ${wrErr.message}`);
      }
    }

    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}
