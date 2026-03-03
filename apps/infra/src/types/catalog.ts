// Catalog types for the unified Products & Operations schema

export type CatalogItemType = 'product' | 'operation';

export type CatalogParameterType = 'number' | 'string' | 'select' | 'boolean';

export interface CatalogParameter {
  slug: string;
  label: string;
  unit?: string;
  type?: CatalogParameterType; // defaults to 'number' if omitted (backwards compat)
  default: number;
  stringDefault?: string; // used when type is 'string' or 'select'
  min?: number;
  max?: number;
  step?: number;
  options?: number[]; // for number dropdowns
  stringOptions?: string[]; // for select type
  required?: boolean;
  description?: string;
}

export interface MarkerStyle {
  color: string;
  shape: 'circle' | 'square' | 'triangle' | 'custom';
  size: number;
  image?: string;
  lineWidth?: number;
  dashArray?: string;
  opacity?: number;
  strokeOffset?: number;
  /** Render order: lower = behind other layers. 0 = behind roads, 1 = default, 2+ = on top */
  renderOrder?: number;
  /** Lucide icon name to repeat as fill pattern inside the line area */
  fillIcon?: string;
}

// Default image for catalog items (instruction images)
export interface CatalogDefaultImage {
  id: string;
  url: string;
  description?: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  type: CatalogItemType;
  unit: string;
  unitPrice: number; // 0 for Operations
  vatRate: number;
  defaultParameters: CatalogParameter[];
  quantityFormula?: string;
  nameFormula?: string; // Dynamic name formula, e.g., "'Rumpu Ø' + leveys + 'mm'"
  priceFormula?: string; // Dynamic price formula using parameters
  markerStyle: MarkerStyle;
  measureType: 1 | 2; // 1=road segment, 2=local/point
  allowedGeometries: ('point' | 'line_tied' | 'line_free' | 'polygon')[];
  isActive: boolean;
  sortOrder: number;
  category?: string;
  defaultImages?: CatalogDefaultImage[]; // Default instruction/guide images
  defaultInstructionText?: string; // Default instruction/guide text for this item
  createdAt: Date;
  updatedAt: Date;
}

export interface CatalogComposition {
  id: string;
  parentItemId: string;
  childItemId: string;
  quantityFactorFormula: string;
  label?: string;
  sortOrder: number;
  // Joined data
  childItem?: CatalogItem;
}

export interface CatalogItemWork {
  id: string;
  catalogItemId: string;
  workTypeId: string;
  hoursPerUnit: number;
  hoursFormula?: string; // Dynamic formula for work hours, e.g., "(0.2 / length) + (width / 8000)"
  description?: string;
  // Joined data
  workType?: WorkType;
}

export interface WorkType {
  id: string;
  name: string;
  hourlyRate: number;
  vatRate: number;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectItem {
  id: string;
  projectId: string;
  catalogItemId: string;
  geometry: ProjectItemGeometry;
  userParameters: Record<string, number>;
  notes?: string;
  photos: ProjectItemPhoto[];
  visible: boolean;
  locked: boolean;
  styleOverrides?: Partial<MarkerStyle>;
  chainageStart?: number;
  chainageEnd?: number;
  offsetM: number;
  createdAt: Date;
  updatedAt: Date;
  // Joined data
  catalogItem?: CatalogItem;
}

export type ProjectItemGeometry =
  | { type: 'point'; coordinates: [number, number] }
  | { type: 'line'; coordinates: [number, number][] }
  | { type: 'polygon'; coordinates: [number, number][] };

export interface ProjectItemPhoto {
  id: string;
  url: string;
  description?: string;
  createdAt: Date;
}

// Calculated values for project items
export interface ProjectItemCalculatedValues {
  quantity: number;
  materialCost: number;
  workHours: number;
  workCost: number;
  totalExclVat: number;
  totalInclVat: number;
  // For Operations: breakdown of child items
  children?: {
    itemId: string;
    name: string;
    quantity: number;
    materialCost: number;
    workCost: number;
    total: number;
  }[];
}

// Full catalog item with all relations
export interface CatalogItemWithRelations extends CatalogItem {
  compositions: CatalogComposition[];
  workRequirements: CatalogItemWork[];
}

// Database row types (snake_case from Supabase)
export interface CatalogItemRow {
  id: string;
  name: string;
  type: string;
  unit: string;
  unit_price: number;
  vat_rate: number;
  default_parameters: any;
  quantity_formula: string | null;
  name_formula: string | null;
  price_formula: string | null;
  marker_style: any;
  measure_type: number;
  allowed_geometries: string[];
  is_active: boolean;
  sort_order: number;
  category: string | null;
  default_images: any;
  default_instruction_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface CatalogCompositionRow {
  id: string;
  parent_item_id: string;
  child_item_id: string;
  quantity_factor_formula: string;
  label: string | null;
  sort_order: number;
}

export interface CatalogItemWorkRow {
  id: string;
  catalog_item_id: string;
  work_type_id: string;
  hours_per_unit: number;
  hours_formula: string | null;
  description: string | null;
}

export interface ProjectItemRow {
  id: string;
  project_id: string;
  catalog_item_id: string;
  geometry: any;
  user_parameters: any;
  notes: string | null;
  photos: any;
  visible: boolean;
  locked: boolean;
  style_overrides: any;
  chainage_start: number | null;
  chainage_end: number | null;
  offset_m: number | null;
  created_at: string;
  updated_at: string;
}

export interface WorkTypeRow {
  id: string;
  name: string;
  hourly_rate: number;
  vat_rate: number;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// Conversion functions
export function catalogItemFromRow(row: CatalogItemRow): CatalogItem {
  return {
    id: row.id,
    name: row.name,
    type: row.type as CatalogItemType,
    unit: row.unit,
    unitPrice: Number(row.unit_price),
    vatRate: Number(row.vat_rate),
    defaultParameters: Array.isArray(row.default_parameters) ? row.default_parameters : [],
    quantityFormula: row.quantity_formula || undefined,
    nameFormula: row.name_formula || undefined,
    priceFormula: row.price_formula || undefined,
    markerStyle: row.marker_style || { color: '#505050', shape: 'circle', size: 24 },
    measureType: row.measure_type as 1 | 2,
    allowedGeometries: row.allowed_geometries as CatalogItem['allowedGeometries'],
    isActive: row.is_active,
    sortOrder: row.sort_order,
    category: row.category || undefined,
    defaultImages: Array.isArray(row.default_images) ? row.default_images : [],
    defaultInstructionText: row.default_instruction_text || undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function catalogCompositionFromRow(row: CatalogCompositionRow): CatalogComposition {
  return {
    id: row.id,
    parentItemId: row.parent_item_id,
    childItemId: row.child_item_id,
    quantityFactorFormula: row.quantity_factor_formula,
    label: row.label || undefined,
    sortOrder: row.sort_order,
  };
}

export function catalogItemWorkFromRow(row: CatalogItemWorkRow): CatalogItemWork {
  return {
    id: row.id,
    catalogItemId: row.catalog_item_id,
    workTypeId: row.work_type_id,
    hoursPerUnit: Number(row.hours_per_unit),
    hoursFormula: row.hours_formula || undefined,
    description: row.description || undefined,
  };
}

export function workTypeFromRow(row: WorkTypeRow): WorkType {
  return {
    id: row.id,
    name: row.name,
    hourlyRate: Number(row.hourly_rate),
    vatRate: Number(row.vat_rate),
    description: row.description || undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function projectItemFromRow(row: ProjectItemRow): ProjectItem {
  return {
    id: row.id,
    projectId: row.project_id,
    catalogItemId: row.catalog_item_id,
    geometry: row.geometry,
    userParameters: row.user_parameters || {},
    notes: row.notes || undefined,
    photos: Array.isArray(row.photos) ? row.photos : [],
    visible: row.visible,
    locked: row.locked,
    styleOverrides: row.style_overrides || undefined,
    chainageStart: row.chainage_start != null ? Number(row.chainage_start) : undefined,
    chainageEnd: row.chainage_end != null ? Number(row.chainage_end) : undefined,
    offsetM: row.offset_m != null ? Number(row.offset_m) : 0,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
