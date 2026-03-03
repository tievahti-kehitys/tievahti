// Hankekartta Project Types

export interface CustomCost {
  id: string;
  description: string;
  amount: number; // Base amount (excl. VAT)
}

// Project text section for editable general text (Puustonpoisto, etc.)
export interface ProjectTextSection {
  id: string;
  projectId: string;
  sectionKey: string;
  title: string;
  content: string;
  sortOrder: number;
  isEnabled: boolean;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  roadGeometry: RoadGeometry | null;
  stakingOrigin: [number, number] | null; // [lat, lon] for chainage 0+000
  vatPercentage: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  products: ProductInstance[];
  customCosts: CustomCost[]; // Manual additional costs
  
  // Extended project details for Tievahti documents
  projectType?: string;
  tiekunta?: string;
  kayttooikeusyksikkotunnus?: string;
  kunta?: string;
  kohdeosoite?: string;
  osakasCount?: number;
  yksikkoCount?: number;
  vastuuhenkiloName?: string;
  vastuuhenkiloPhone?: string;
  vastuuhenkiloEmail?: string;
}

export interface RoadGeometry {
  id: string;
  name: string;
  coordinates: [number, number][]; // Legacy: flat coords (first segment for compat)
  segments: [number, number][][]; // MultiLineString: array of coordinate arrays
  source: 'search' | 'drawn';
  totalLength: number; // meters
}

// Product category types
export type MeasureType = 1 | 2; // 1 = tievälillinen (road segment), 2 = paikallinen (local)
export type GeometryType = 'line_tied' | 'line_free' | 'point' | 'polygon';

// Parameter definition with Finnish names
export interface ParameterDefinition {
  key: string; // Internal key (e.g., 'width_m')
  label: string; // Finnish label (e.g., 'Leveys (m)')
  unit: string; // e.g., 'm', 'mm', 'kpl'
  defaultValue: number;
  min?: number;
  max?: number;
  step?: number;
}

// Line style for map rendering
export interface LineStyle {
  strokeWidth: number; // Line width in pixels
  strokeOffset: number; // Offset from centerline in meters
  dashArray?: string; // e.g., '8, 4' for dashed lines
  opacity?: number;
}

// Cost calculation formula
export interface CostFormula {
  quantityFormula: string; // e.g., 'pituus * leveys * paksuus'
  unitConversion?: {
    coefficient: number; // e.g., 2.4 for m³ to tons
    targetUnit: string; // e.g., 'tn'
  };
  priceFormula: string; // e.g., 'määrä * yksikköhinta'
}

// Work type definition
export interface WorkType {
  id: string;
  name: string; // e.g., 'Levitys', 'Asennus'
  hourlyRate: number;
}

// Work requirement for a product
export interface WorkRequirement {
  workTypeId: string;
  hoursPerUnit: number; // Hours per unit of product
  description?: string;
}

// Sub-product configuration
export interface SubProductConfig {
  productId: string; // Reference to another ProductDefinition
  parameterOverrides: Record<string, number>; // Override default parameters
  label?: string; // Custom label for this sub-product instance
  factor?: number; // Multiplier for calculating sub-product quantity from parent quantity
}

// Default image for product
export interface DefaultImage {
  id: string;
  url: string;
  description: string;
  type: 'instruction' | 'example' | 'diagram';
}

export interface ProductDefinition {
  id: string;
  name: string;
  category: string;
  measureType: MeasureType;
  allowedGeometries: GeometryType[];
  unit: string;
  unitPrice: number | string; // number or formula reference
  includesWork: boolean;
  hoursPerUnit: number; // Legacy - use workRequirements instead
  workTypes: WorkType[]; // Legacy - use global work types
  
  // Enhanced parameters with Finnish labels
  parameters: ParameterDefinition[];
  defaultParameters: Record<string, number>; // Legacy support
  
  // Cost calculation
  costFormula?: CostFormula;
  
  // Work requirements
  workRequirements: WorkRequirement[];
  
  // Sub-products with parameter overrides
  subProducts?: SubProductConfig[];
  
  // Visual styling
  color: string;
  lineStyle?: LineStyle;
  
  // Marker configuration for point products
  defaultIcon?: string; // 'circle', 'square', 'triangle', 'custom'
  customMarkerImage?: string; // URL or data URI for custom marker
  markerSize?: number; // Size in pixels
  
  // Default images (instruction diagrams, etc.)
  defaultImages?: DefaultImage[];
}

export interface ProductInstance {
  id: string;
  productDefinitionId: string;
  geometry: ProductGeometry;
  parameters: Record<string, number>;
  stringParameters?: Record<string, string>; // string/select parameter values
  photos: ProductPhoto[];
  notes: string;
  visible: boolean;
  locked: boolean;
  colorOverride?: string;
  lineStyleOverride?: Partial<LineStyle>;
  customMarkerImage?: string;
  offsetM?: number; // For road segment products
  chainageStart?: number; // meters from staking origin
  chainageEnd?: number;
  calculatedValues?: CalculatedValues;
  subProductInstances?: ProductInstance[];
  categoryId?: string | null; // FK to project_categories
}

export type ProductGeometry =
  | { type: 'point'; coordinates: [number, number] }
  | { type: 'line'; coordinates: [number, number][] }
  | { type: 'polygon'; coordinates: [number, number][] };

export interface ProductPhoto {
  id: string;
  url: string;
  description?: string;
  createdAt: Date;
}

export interface CalculatedValues {
  quantity: number;
  convertedQuantity?: number;
  convertedUnit?: string;
  materialCost: number;
  workHours: number;
  workCost: number;
  totalExclVat: number;
  totalInclVat: number;
}

// Save status for autosave
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// Map layer types
export interface MapLayer {
  id: string;
  name: string;
  type: 'base' | 'overlay';
  visible: boolean;
  url?: string;
}

// Global work types library
export interface GlobalWorkType {
  id: string;
  name: string;
  hourlyRate: number;
  description?: string;
}
