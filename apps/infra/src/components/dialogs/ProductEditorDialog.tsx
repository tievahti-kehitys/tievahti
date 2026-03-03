import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useProject } from "@/context/ProjectContext";
import { useCatalog, CatalogItem, CatalogComposition, CatalogItemWork } from "@/context/CatalogContext";
import { useForestMode } from "@/context/ForestModeContext";
import { useCategoryFilter } from "@/context/CategoryFilterContext";
import { useRole } from "@/context/RoleContext";
import { useItemClassification } from "@/context/ItemClassificationContext";
import {
  X,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Save,
  Calculator,
  Package,
  Wrench,
  ChevronDown,
  ChevronRight,
  MapPin,
  Navigation,
  Camera,
  Pencil,
  Scissors,
  LocateFixed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CatalogItemIcon } from "@/components/catalog/CatalogItemIcon";
import { cn } from "@/lib/utils";
import { evaluateFormula, evaluatePriceFormula, calculateWorkHours, evaluateNameFormula } from "@/lib/costCalculator";
import { extractRoadSegment } from "@/lib/roadGeometryUtils";
import { toast } from "sonner";
import { buildEffectiveParameters, stripToCatalogParameterSlugs } from "@/lib/parameterUtils";
import { generateParameterOptions } from "@/lib/parameterOptions";
import { ParameterCombobox } from "@/components/ui/ParameterCombobox";
import { ImageGallery, GalleryImage } from "@/components/ui/ImageGallery";
import { useProductImages } from "@/hooks/useProductImages";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tag } from "lucide-react";

interface ProductEditorDialogProps {
  productId: string;
  onClose: () => void;
}

export function ProductEditorDialog({ productId, onClose }: ProductEditorDialogProps) {
  const { project, allProducts, updateProduct, removeProduct } = useProject();
  const { items, workTypes, getCompositions, getItemWork, getItemById } = useCatalog();
  const { state: forestState, setEditingGeometryItemId, enterEditGeometry } = useForestMode();
  const { categories } = useCategoryFilter();
  const { canEdit } = useRole();
  const { startClassification } = useItemClassification();
  const isReadOnly = !canEdit();

  const product = allProducts.find((p) => p.id === productId);
  const definition = product ? items.find((item) => item.id === product.productDefinitionId) : null;

  const [parameters, setParameters] = useState<Record<string, number>>(product?.parameters || {});
  const [stringParameters, setStringParameters] = useState<Record<string, string>>(product?.stringParameters || {});
  const [notes, setNotes] = useState(product?.notes || "");
  const [photos, setPhotos] = useState(product?.photos || []);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(product?.categoryId || "");
  const [isEditingGeometry, setIsEditingGeometry] = useState(false);
  const [isEditingCoords, setIsEditingCoords] = useState(false);
  const [coordInputStart, setCoordInputStart] = useState("");
  const [coordInputEnd, setCoordInputEnd] = useState("");

  // Loaded compositions and work for this item
  const [compositions, setCompositions] = useState<CatalogComposition[]>([]);
  const [itemWork, setItemWork] = useState<CatalogItemWork[]>([]);
  const [childItemWork, setChildItemWork] = useState<Record<string, CatalogItemWork[]>>({});
  const [showCompositions, setShowCompositions] = useState(true);
  const [showWork, setShowWork] = useState(true);

  // Image upload hook
  const { uploading, uploadImages } = useProductImages();

  // Calculate chainage from road geometry
  const calculateChainageForPoint = (coordinates: [number, number]): number => {
    if (!project?.roadGeometry || !project.stakingOrigin) return 0;

    const roadCoords = project.roadGeometry.coordinates;
    let totalDistance = 0;
    let nearestDistance = Infinity;
    let chainageAtNearest = 0;

    for (let i = 0; i < roadCoords.length - 1; i++) {
      const segmentStart = roadCoords[i];
      const segmentEnd = roadCoords[i + 1];
      const segmentLength = calculateDistance(segmentStart[0], segmentStart[1], segmentEnd[0], segmentEnd[1]);

      const distToStart = calculateDistance(coordinates[0], coordinates[1], segmentStart[0], segmentStart[1]);
      if (distToStart < nearestDistance) {
        nearestDistance = distToStart;
        chainageAtNearest = totalDistance;
      }

      totalDistance += segmentLength;
    }

    return chainageAtNearest;
  };

  // Get location info (coordinates and chainage)
  const locationInfo = React.useMemo(() => {
    if (!product) return null;

    if (product.geometry.type === "point") {
      const coords = product.geometry.coordinates;
      const chainage = calculateChainageForPoint(coords);
      return {
        type: "point" as const,
        startCoords: coords,
        startChainage: chainage,
      };
    } else if (product.geometry.type === "line" || product.geometry.type === "polygon") {
      const coords = product.geometry.coordinates;
      const startCoords = coords[0];
      const endCoords = coords[coords.length - 1];
      const startChainage = calculateChainageForPoint(startCoords);
      const endChainage = calculateChainageForPoint(endCoords);
      return {
        type: "line" as const,
        startCoords,
        endCoords,
        startChainage,
        endChainage,
      };
    }
    return null;
  }, [product?.geometry, project?.roadGeometry, project?.stakingOrigin]);

  // Load compositions and work when definition changes
  useEffect(() => {
    if (!definition) return;

    const loadData = async () => {
      const [comps, work] = await Promise.all([getCompositions(definition.id), getItemWork(definition.id)]);
      setCompositions(comps);
      setItemWork(work);

      // Load work requirements for each child item (for operations)
      if (definition.type === "operation" && comps.length > 0) {
        const childWorkMap: Record<string, CatalogItemWork[]> = {};
        await Promise.all(
          comps.map(async (comp) => {
            const childId = comp.childItem?.id || comp.childItemId;
            if (childId) {
              const childWork = await getItemWork(childId);
              childWorkMap[childId] = childWork;
            }
          }),
        );
        setChildItemWork(childWorkMap);
      }
    };

    loadData();
  }, [definition?.id, definition?.type, getCompositions, getItemWork]);

  // Parse "lat, lng" string to coordinate tuple
  const parseCoordInput = useCallback((input: string): [number, number] | null => {
    const parts = input
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return [parts[0], parts[1]];
    }
    return null;
  }, []);

  // Apply coordinates from text input
  const handleApplyCoordinates = useCallback(() => {
    if (!product || !definition) return;

    if (product.geometry.type === "point") {
      const coords = parseCoordInput(coordInputStart);
      if (!coords) {
        toast.error("Virheellinen koordinaattimuoto. Käytä muotoa: lat, lng");
        return;
      }
      updateProduct(productId, {
        geometry: { type: "point" as const, coordinates: coords },
      });
      toast.success("Sijainti päivitetty");
    } else if (product.geometry.type === "line") {
      const startCoords = parseCoordInput(coordInputStart);
      const endCoords = parseCoordInput(coordInputEnd);
      if (!startCoords || !endCoords) {
        toast.error("Virheellinen koordinaattimuoto. Käytä muotoa: lat, lng");
        return;
      }

      // Try road-snap if road geometry exists
      let lineCoordinates: [number, number][] = [startCoords, endCoords];
      if (project?.roadGeometry) {
        const allSegments = project.roadGeometry.segments;
        const roadCoords =
          allSegments && allSegments.length > 0 ? allSegments.flat() : project.roadGeometry.coordinates;
        if (roadCoords && roadCoords.length >= 2) {
          const snapped = extractRoadSegment(startCoords, endCoords, roadCoords as [number, number][]);
          if (snapped.length >= 2) {
            lineCoordinates = snapped;
          }
        }
      }

      updateProduct(productId, {
        geometry: { type: "line" as const, coordinates: lineCoordinates },
      });
      toast.success("Sijainti päivitetty (tien geometriaa pitkin)");
    }
    setIsEditingCoords(false);
  }, [
    product,
    definition,
    coordInputStart,
    coordInputEnd,
    project?.roadGeometry,
    updateProduct,
    productId,
    parseCoordInput,
  ]);

  if (!product || !definition) {
    return null;
  }

  // Build gallery images: combine default images from catalog + user photos
  const defaultImages: GalleryImage[] = ((definition as any).defaultImages || []).map((img: any) => ({
    id: img.id || img.url,
    url: img.url,
    description: img.description,
    isDefault: true,
  }));

  const userPhotos: GalleryImage[] = photos.map((photo: any) => ({
    id: photo.id || photo.url,
    url: photo.url,
    description: photo.description,
    isDefault: false,
  }));

  const allImages: GalleryImage[] = [...defaultImages, ...userPhotos];

  const handleAddPhotos = async (files: File[]) => {
    const newPhotos = await uploadImages(files);
    setPhotos((prev) => [
      ...prev,
      ...newPhotos.map((p) => ({
        id: p.id,
        url: p.url,
        description: p.description,
        createdAt: p.createdAt,
      })),
    ]);
  };

  const handleRemovePhoto = (photoId: string) => {
    setPhotos((prev) => prev.filter((p: any) => (p.id || p.url) !== photoId));
  };

  // Ensure formula evaluation always sees canonical slugs even if old projects
  // still have legacy keys (e.g. l/m). We also use this for input values.
  const effectiveParameters = buildEffectiveParameters(parameters, definition.defaultParameters);

  const handleSave = () => {
    const cleanedParameters = stripToCatalogParameterSlugs(parameters, definition.defaultParameters);
    // Build cleaned string parameters
    const cleanedStringParameters: Record<string, string> = {};
    for (const param of definition.defaultParameters) {
      const pt = (param as any).type || "number";
      if (pt === "string" || pt === "select" || pt === "boolean") {
        const val = stringParameters[param.slug];
        if (val !== undefined) cleanedStringParameters[param.slug] = val;
        else if ((param as any).stringDefault) cleanedStringParameters[param.slug] = (param as any).stringDefault;
      }
    }
    const newCategoryId = selectedCategoryId || null;
    updateProduct(productId, {
      parameters: cleanedParameters,
      stringParameters: cleanedStringParameters,
      notes,
      photos,
      categoryId: newCategoryId,
    });
    onClose();
  };

  const handleDelete = () => {
    if (confirm("Haluatko varmasti poistaa tämän kohteen?")) {
      removeProduct(productId);
      onClose();
    }
  };

  const handleToggleVisibility = () => {
    updateProduct(productId, { visible: !product.visible });
  };

  const handleToggleLock = () => {
    updateProduct(productId, { locked: !product.locked });
  };

  // Calculate geometry length if line
  let geometryLength = 0;
  if (product.geometry.type === "line") {
    const coords = product.geometry.coordinates;
    for (let i = 1; i < coords.length; i++) {
      const [lat1, lon1] = coords[i - 1];
      const [lat2, lon2] = coords[i];
      geometryLength += calculateDistance(lat1, lon1, lat2, lon2);
    }
  }

  // Build variables for formula evaluation - use actual parameters directly
  // IMPORTANT: don't overwrite user parameter pituus_m on point items (e.g. culverts).
  const baseVariables: Record<string, number> = {
    ...effectiveParameters,
    // Geometry-derived length (line only)
    length: geometryLength,
  };

  // Legacy aliasing for line geometry
  if (geometryLength > 0) {
    baseVariables.pituus = geometryLength;
    if (baseVariables.pituus_m === undefined) {
      baseVariables.pituus_m = geometryLength;
    }
  }

  // Build effective string parameters (merge saved + defaults)
  const effectiveStringParameters: Record<string, string> = {};
  for (const param of definition.defaultParameters) {
    const pt = (param as any).type || "number";
    if (pt === "string" || pt === "select" || pt === "boolean") {
      effectiveStringParameters[param.slug] = stringParameters[param.slug] ?? (param as any).stringDefault ?? "";
    }
  }

  // Calculate quantity using quantityFormula if defined
  let quantity = 1;

  if (definition.quantityFormula && definition.quantityFormula.trim() !== "") {
    quantity = evaluateFormula(definition.quantityFormula, baseVariables, effectiveStringParameters);
  } else if (product.geometry.type === "line") {
    // If no formula is defined, line geometry quantity = length
    quantity = geometryLength;
  }

  const variables: Record<string, number> = {
    ...baseVariables,
    quantity,
  };

  // Calculate unit price - use priceFormula if defined, otherwise use static unitPrice
  const unitPrice = definition.priceFormula
    ? evaluatePriceFormula(definition.priceFormula, definition.unitPrice, variables)
    : definition.unitPrice || 0;
  const materialCost = quantity * unitPrice;

  // Calculate work cost
  let workHours = 0;
  let workCost = 0;
  itemWork.forEach((work) => {
    const workType = work.workType || workTypes.find((wt) => wt.id === work.workTypeId);
    if (workType) {
      const hours = calculateWorkHours(quantity, work, variables, effectiveStringParameters);
      workHours += hours;
      workCost += hours * workType.hourlyRate;
    }
  });

  // Calculate child products cost and work (for operations)
  // Use the same formula variables for child product evaluation
  const parentVariables: Record<string, number> = {
    ...variables,
    quantity: quantity,
  };

  let childrenCost = 0;
  let childrenWorkHours = 0;
  let childrenWorkCost = 0;
  const childCalculations: Array<{
    name: string;
    quantity: number;
    cost: number;
    unit: string;
    workDetails: Array<{ workTypeName: string; hours: number; cost: number }>;
  }> = [];

  if (definition.type === "operation") {
    compositions.forEach((comp) => {
      const childItem = comp.childItem || getItemById(comp.childItemId);
      if (childItem) {
        // Evaluate the quantity formula using parent parameters + string params for if() support
        const childQty = evaluateFormula(comp.quantityFactorFormula, parentVariables, effectiveStringParameters);
        const childUnitPrice = evaluatePriceFormula(childItem.priceFormula, childItem.unitPrice || 0, {
          ...parentVariables,
          quantity: childQty,
        });
        const childCost = childQty * childUnitPrice;
        childrenCost += childCost;

        // Calculate child item work
        const childWorkReqs = childItemWork[childItem.id] || [];
        const childFormulaVars = { ...parentVariables, quantity: childQty };
        const workDetails: Array<{ workTypeName: string; hours: number; cost: number }> = [];

        childWorkReqs.forEach((work) => {
          const workType = work.workType || workTypes.find((wt) => wt.id === work.workTypeId);
          if (workType) {
            const hours = calculateWorkHours(childQty, work, childFormulaVars, effectiveStringParameters);
            const cost = hours * workType.hourlyRate;
            childrenWorkHours += hours;
            childrenWorkCost += cost;
            if (hours > 0 || cost > 0) {
              workDetails.push({
                workTypeName: workType.name,
                hours,
                cost,
              });
            }
          }
        });

        // Only include child if it has non-zero quantity or cost
        if (childQty > 0 || childCost > 0) {
          childCalculations.push({
            name: evaluateNameFormula(comp.label, childItem.name, { ...parentVariables, quantity: childQty }),
            quantity: childQty,
            cost: childCost,
            unit: childItem.unit,
            workDetails,
          });
        }
      }
    });
  }

  // Total work includes both parent work and child work
  const totalWorkHours = workHours + childrenWorkHours;
  const totalWorkCost = workCost + childrenWorkCost;

  const totalExclVat = materialCost + totalWorkCost + childrenCost;
  const vatRate = project?.vatPercentage || 25.5;
  const totalInclVat = totalExclVat * (1 + vatRate / 100);

  const isOperation = definition.type === "operation";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg shadow-elevated border border-border w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <CatalogItemIcon item={definition} size="lg" />
            <div>
              <h2 className="font-semibold text-foreground">
                {evaluateNameFormula(definition.nameFormula, definition.name, variables)}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isOperation ? "Toimenpide" : "Tuote"} • {definition.category || "Muut"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={handleToggleVisibility} className="p-2 hover:bg-muted rounded-md">
              {product.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button onClick={handleToggleLock} className="p-2 hover:bg-muted rounded-md">
              {product.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-muted rounded-md">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Location info - Coordinates and Chainage */}
          {locationInfo && (
            <div className="bg-muted/50 rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <MapPin className="w-4 h-4 text-primary" />
                  <span>Sijainti</span>
                </div>
                {!isReadOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (isEditingGeometry) {
                        setIsEditingGeometry(false);
                        setEditingGeometryItemId(null);
                      } else {
                        enterEditGeometry(productId, JSON.parse(JSON.stringify(product.geometry)));
                        onClose();
                      }
                    }}
                    className={cn(
                      "h-7 text-xs gap-1.5",
                      isEditingGeometry && "bg-primary text-primary-foreground hover:bg-primary/90",
                    )}
                  >
                    <Pencil className="w-3 h-3" />
                    {isEditingGeometry ? "Lopeta muokkaus" : "Muokkaa sijaintia"}
                  </Button>
                )}
              </div>

              {isEditingGeometry && (
                <div className="bg-info/10 border border-info/30 rounded p-2 text-xs text-info">
                  {product.geometry.type === "point"
                    ? "Vedä kartan merkkiä siirtääksesi sijaintia"
                    : "Vedä taitekohtia siirtääksesi niitä, tai napauta viivaa lisätäksesi uuden taitekohdan"}
                </div>
              )}

              {isEditingCoords ? (
                <div className="space-y-2">
                  {locationInfo.type === "point" ? (
                    <div className="space-y-1">
                      <Label className="text-xs">Koordinaatit (lat, lng)</Label>
                      <Input
                        value={coordInputStart}
                        onChange={(e) => setCoordInputStart(e.target.value)}
                        placeholder="61.4978, 23.7610"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Alkupiste (lat, lng)</Label>
                        <Input
                          value={coordInputStart}
                          onChange={(e) => setCoordInputStart(e.target.value)}
                          placeholder="61.4978, 23.7610"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Loppupiste (lat, lng)</Label>
                        <Input
                          value={coordInputEnd}
                          onChange={(e) => setCoordInputEnd(e.target.value)}
                          placeholder="61.5012, 23.7680"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    </div>
                  )}
                  {locationInfo.type === "line" && project?.roadGeometry && (
                    <p className="text-[10px] text-muted-foreground">
                      Reitti kulkee automaattisesti tien geometriaa pitkin
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="success" size="sm" className="h-7 text-xs flex-1" onClick={handleApplyCoordinates}>
                      Aseta sijainti
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setIsEditingCoords(false)}
                    >
                      Peruuta
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {locationInfo.type === "point" ? (
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground">Koordinaatit:</span>
                        <div className="font-mono text-foreground">
                          {locationInfo.startCoords[0].toFixed(5)}, {locationInfo.startCoords[1].toFixed(5)}
                        </div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Paalupiste:</span>
                        <div className="font-medium text-foreground">PL {Math.round(locationInfo.startChainage)}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-muted-foreground">Alkukoordinaatit:</span>
                          <div className="font-mono text-foreground">
                            {locationInfo.startCoords[0].toFixed(5)}, {locationInfo.startCoords[1].toFixed(5)}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Loppukoordinaatit:</span>
                          <div className="font-mono text-foreground">
                            {locationInfo.endCoords[0].toFixed(5)}, {locationInfo.endCoords[1].toFixed(5)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Navigation className="w-3 h-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Paaluväli:</span>
                        <span className="font-medium text-foreground">
                          PL {Math.round(locationInfo.startChainage)} – PL {Math.round(locationInfo.endChainage)}
                        </span>
                      </div>
                    </div>
                  )}
                  {!isReadOnly && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] gap-1 px-2 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setCoordInputStart(
                          `${locationInfo.startCoords[0].toFixed(5)}, ${locationInfo.startCoords[1].toFixed(5)}`,
                        );
                        if (locationInfo.type === "line" && locationInfo.endCoords) {
                          setCoordInputEnd(
                            `${locationInfo.endCoords[0].toFixed(5)}, ${locationInfo.endCoords[1].toFixed(5)}`,
                          );
                        }
                        setIsEditingCoords(true);
                      }}
                    >
                      <LocateFixed className="w-3 h-3" />
                      Syötä koordinaatit
                    </Button>
                  )}
                </>
              )}
            </div>
          )}

          {/* "Rajaa & luokittele" button - always visible for line products when user can edit */}
          {!isReadOnly && product.geometry.type === "line" && (
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs gap-1.5"
              onClick={() => {
                startClassification(productId);
                onClose();
              }}
            >
              <Scissors className="w-3 h-3" />
              Rajaa &amp; luokittele
            </Button>
          )}

          {/* Category selector */}
          {categories.length > 0 && (
            <div className="bg-muted/50 rounded-md p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <Tag className="w-4 h-4 text-primary" />
                  <span>Kategoria</span>
                </div>
              </div>
              <Select
                value={selectedCategoryId || "none"}
                onValueChange={(v) => !isReadOnly && setSelectedCategoryId(v === "none" ? "" : v)}
                disabled={isReadOnly}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Luokittelematon" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Luokittelematon</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <span className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: cat.color }} />
                        {cat.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Parameters */}
          {definition.defaultParameters.length > 0 && (
            <div>
              <Label className="text-xs">Parametrit</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {definition.defaultParameters.map((param) => {
                  const paramType = (param as any).type || "number";
                  const stringOptions: string[] = (param as any).stringOptions || [];
                  const currentStringVal = effectiveStringParameters[param.slug] ?? (param as any).stringDefault ?? "";

                  // Select type → dropdown
                  if (paramType === "select" && stringOptions.length > 0) {
                    return (
                      <div key={param.slug}>
                        <label className="text-xs text-muted-foreground">{param.label}</label>
                        <select
                          value={currentStringVal}
                          onChange={(e) =>
                            !isReadOnly && setStringParameters((prev) => ({ ...prev, [param.slug]: e.target.value }))
                          }
                          disabled={isReadOnly}
                          className="w-full mt-0.5 px-2 py-1.5 bg-background border border-input text-foreground text-sm rounded-md disabled:opacity-50"
                        >
                          {stringOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  }

                  // Boolean type → kyllä/ei toggle
                  if (paramType === "boolean") {
                    return (
                      <div key={param.slug}>
                        <label className="text-xs text-muted-foreground">{param.label}</label>
                        <select
                          value={currentStringVal || "ei"}
                          onChange={(e) =>
                            !isReadOnly && setStringParameters((prev) => ({ ...prev, [param.slug]: e.target.value }))
                          }
                          disabled={isReadOnly}
                          className="w-full mt-0.5 px-2 py-1.5 bg-background border border-input text-foreground text-sm rounded-md disabled:opacity-50"
                        >
                          <option value="kylla">Kyllä</option>
                          <option value="ei">Ei</option>
                        </select>
                      </div>
                    );
                  }

                  // String type → text input
                  if (paramType === "string") {
                    return (
                      <div key={param.slug}>
                        <label className="text-xs text-muted-foreground">{param.label}</label>
                        <Input
                          value={currentStringVal}
                          onChange={(e) =>
                            !isReadOnly && setStringParameters((prev) => ({ ...prev, [param.slug]: e.target.value }))
                          }
                          className="mt-0.5"
                          readOnly={isReadOnly}
                          disabled={isReadOnly}
                        />
                      </div>
                    );
                  }

                  // Number type (default) → existing logic
                  const options = generateParameterOptions(param);
                  return (
                    <div key={param.slug}>
                      <label className="text-xs text-muted-foreground">
                        {param.label} {param.unit ? `(${param.unit})` : ""}
                      </label>
                      {options ? (
                        <ParameterCombobox
                          options={options}
                          value={effectiveParameters[param.slug] ?? param.default}
                          onChange={(val) => !isReadOnly && setParameters((prev) => ({ ...prev, [param.slug]: val }))}
                          className="mt-0.5"
                          disabled={isReadOnly}
                        />
                      ) : (
                        <Input
                          type="number"
                          step={param.step || 0.01}
                          min={param.min}
                          max={param.max}
                          value={effectiveParameters[param.slug] ?? param.default}
                          onChange={(e) =>
                            !isReadOnly &&
                            setParameters((prev) => ({ ...prev, [param.slug]: parseFloat(e.target.value) || 0 }))
                          }
                          className="mt-0.5"
                          readOnly={isReadOnly}
                          disabled={isReadOnly}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Work requirements - only show if total work hours > 0 */}
          {itemWork.length > 0 && workHours > 0 && (
            <div className="bg-amber-500/10 rounded-md overflow-hidden border border-amber-500/20">
              <button
                onClick={() => setShowWork(!showWork)}
                className="flex items-center justify-between w-full px-3 py-2 hover:bg-amber-500/5"
              >
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium">Työ</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {workHours.toFixed(1)} h • {workCost.toFixed(0)} €
                  </span>
                  {showWork ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
              </button>
              {showWork && (
                <div className="px-3 pb-3 space-y-1.5">
                  {itemWork.map((work) => {
                    const workType = work.workType || workTypes.find((wt) => wt.id === work.workTypeId);
                    if (!workType) return null;
                    const hours = calculateWorkHours(quantity, work, variables, effectiveStringParameters);
                    const cost = hours * workType.hourlyRate;
                    if (hours === 0 && cost === 0) return null;
                    return (
                      <div key={work.id} className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">{workType.name}</span>
                        <span className="font-medium">
                          {hours.toFixed(1)} h = {cost.toFixed(0)} €
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Child products (compositions) - for operations */}
          {isOperation && compositions.length > 0 && (
            <div className="bg-primary/5 rounded-md overflow-hidden border border-primary/20">
              <button
                onClick={() => setShowCompositions(!showCompositions)}
                className="flex items-center justify-between w-full px-3 py-2 hover:bg-primary/5"
              >
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium">Tuotteet</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {compositions.length} kpl • {childrenCost.toFixed(0)} €
                  </span>
                  {showCompositions ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
              </button>
              {showCompositions && (
                <div className="px-3 pb-3 space-y-2">
                  {childCalculations.map((calc, idx) => {
                    const comp = compositions[idx];
                    const childItem = comp?.childItem || getItemById(comp?.childItemId);
                    return (
                      <div key={comp?.id || idx} className="space-y-1">
                        <div className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-2">
                            {childItem && <CatalogItemIcon item={childItem} size="xs" />}
                            <span className="text-muted-foreground">{calc.name}</span>
                          </div>
                          <span className="font-medium">
                            {calc.quantity.toFixed(1)} {calc.unit} = {calc.cost.toFixed(0)} €
                          </span>
                        </div>
                        {/* Child item work details */}
                        {calc.workDetails.length > 0 && (
                          <div className="ml-6 space-y-0.5">
                            {calc.workDetails.map((work, workIdx) => (
                              <div
                                key={workIdx}
                                className="flex justify-between items-center text-xs text-muted-foreground"
                              >
                                <span className="flex items-center gap-1">
                                  <Wrench className="w-3 h-3 text-amber-600" />
                                  {work.workTypeName}
                                </span>
                                <span>
                                  {work.hours.toFixed(1)} h = {work.cost.toFixed(0)} €
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Calculated values */}
          <div className="bg-muted/30 rounded-md overflow-hidden">
            <div className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-medium">Yhteenveto</h3>
            </div>
            <div className="p-3 space-y-2">
              {/* Show geometry length for line products */}
              {product.geometry.type === "line" && geometryLength > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm">Pituus (geometria)</span>
                  <span className="text-sm font-semibold">{geometryLength.toFixed(1)} m</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm">Määrä</span>
                <span className="text-sm font-semibold">
                  {quantity.toFixed(2)} {definition.unit}
                </span>
              </div>
              {!isOperation && (
                <div className="flex justify-between items-center">
                  <span className="text-sm">Materiaalikustannus</span>
                  <span className="text-sm font-medium">{materialCost.toFixed(0)} €</span>
                </div>
              )}
              {totalWorkCost > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm">Työkustannus</span>
                  <span className="text-sm font-medium">{totalWorkCost.toFixed(0)} €</span>
                </div>
              )}
              {childrenCost > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm">Tuotteet</span>
                  <span className="text-sm font-medium">{childrenCost.toFixed(0)} €</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-border">
                <span className="text-sm font-semibold">Yhteensä (alv 0%)</span>
                <span className="text-base font-bold text-primary">{totalExclVat.toFixed(0)} €</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label className="text-xs">Muistiinpanot</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isReadOnly ? "" : "Lisää muistiinpanoja..."}
              className="mt-1"
              rows={2}
              readOnly={isReadOnly}
              disabled={isReadOnly}
            />
          </div>

          {/* Photos & Images Gallery */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Camera className="w-4 h-4 text-muted-foreground" />
              <Label className="text-xs">Kuvat</Label>
            </div>
            <ImageGallery
              images={allImages}
              onAddImages={handleAddPhotos}
              onRemoveImage={handleRemovePhoto}
              uploading={uploading}
              editable={!product.locked && !isReadOnly}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
          {!isReadOnly ? (
            <Button variant="destructive" size="sm" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-1" />
              Poista
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              {isReadOnly ? "Sulje" : "Peruuta"}
            </Button>
            {!isReadOnly && (
              <Button size="sm" onClick={handleSave}>
                <Save className="w-4 h-4 mr-1" />
                Tallenna
              </Button>
            )}
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
