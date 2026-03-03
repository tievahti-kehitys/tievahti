import React, { useState, useEffect, useRef } from "react";
import {
  useCatalog,
  CatalogItem,
  CatalogComposition,
  CatalogItemWork,
  CatalogParameter,
  MarkerStyle,
} from "@/context/CatalogContext";
import { useProject } from "@/context/ProjectContext";
import { useRole } from "@/context/RoleContext";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Trash2,
  Edit2,
  Save,
  X,
  ChevronDown,
  ChevronRight,
  Package,
  Layers,
  ImagePlus,
  Check,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { v4 as uuidv4 } from "uuid";
import { BUILTIN_MARKERS, resolveMarkerImage } from "@/assets/markers";
import { uploadMarkerImage } from "@/lib/uploadMarkerImage";
import { CatalogItemIcon } from "@/components/catalog/CatalogItemIcon";
import { useProductImages, ProductImage } from "@/hooks/useProductImages";
import { ImageGallery, GalleryImage } from "@/components/ui/ImageGallery";
import { CatalogExcelDialog } from "@/components/catalog/CatalogExcelDialog";

export function CatalogSettingsPanel() {
  const { project, updateProject } = useProject();
  const {
    items,
    workTypes,
    getCategories,
    addItem,
    updateItem,
    deleteItem,
    getCompositions,
    saveCompositions,
    getItemWork,
    saveItemWork,
    addWorkType,
    updateWorkType,
    deleteWorkType,
    getProducts,
  } = useCatalog();

  const { isAdmin } = useRole();
  const [activeTab, setActiveTab] = useState<"project" | "catalog" | "work">("catalog");
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [editingCompositions, setEditingCompositions] = useState<CatalogComposition[]>([]);
  const [editingWorkReqs, setEditingWorkReqs] = useState<CatalogItemWork[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [filter, setFilter] = useState<"all" | "product" | "operation">("all");
  const [excelDialogOpen, setExcelDialogOpen] = useState(false);

  const categories = getCategories();
  const products = getProducts();

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  };

  // Filter items by type
  const filteredItems = items.filter((item) => {
    if (filter === "all") return true;
    return item.type === filter;
  });

  // Group items by category
  const itemsByCategory = new Map<string, CatalogItem[]>();
  filteredItems.forEach((item) => {
    const category = item.category || "Muut";
    const existing = itemsByCategory.get(category) || [];
    itemsByCategory.set(category, [...existing, item]);
  });

  const handleEditItem = async (item: CatalogItem) => {
    const [compositions, workReqs] = await Promise.all([getCompositions(item.id), getItemWork(item.id)]);
    setEditingItem(item);
    setEditingCompositions(compositions);
    setEditingWorkReqs(workReqs);
  };

  const createNewItem = (type: "product" | "operation") => {
    const newItem: CatalogItem = {
      id: "",
      name: type === "product" ? "Uusi tuote" : "Uusi toimenpide",
      type,
      unit: "kpl",
      unitPrice: type === "product" ? 0 : 0, // Operations always have 0 unit price
      vatRate: 25.5,
      defaultParameters: [],
      markerStyle: { color: "#505050", shape: "circle", size: 24 },
      measureType: 2,
      allowedGeometries: ["point"],
      isActive: true,
      sortOrder: items.length,
      category: categories[0] || "Muut",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setEditingItem(newItem);
    setEditingCompositions([]);
    setEditingWorkReqs([]);
  };

  const handleSaveItem = async () => {
    if (!editingItem) return;

    // Ensure Operations have 0 unit price
    const itemToSave = {
      ...editingItem,
      unitPrice: editingItem.type === "operation" ? 0 : editingItem.unitPrice,
    };

    let savedItem: CatalogItem | null = null;

    if (editingItem.id) {
      // Update existing
      await updateItem(editingItem.id, itemToSave);
      savedItem = { ...itemToSave, updatedAt: new Date() };
    } else {
      // Create new
      savedItem = await addItem(itemToSave);
    }

    if (savedItem) {
      // Save compositions (for Operations)
      if (editingCompositions.length > 0 || editingItem.type === "operation") {
        await saveCompositions(
          savedItem.id,
          editingCompositions.map((c) => ({
            parentItemId: savedItem!.id,
            childItemId: c.childItemId,
            quantityFactorFormula: c.quantityFactorFormula,
            label: c.label,
            sortOrder: c.sortOrder,
          })),
        );
      }

      // Save work requirements
      await saveItemWork(
        savedItem.id,
        editingWorkReqs.map((w) => ({
          catalogItemId: savedItem!.id,
          workTypeId: w.workTypeId,
          hoursPerUnit: w.hoursPerUnit,
          hoursFormula: w.hoursFormula,
          description: w.description,
        })),
      );
    }

    setEditingItem(null);
    setEditingCompositions([]);
    setEditingWorkReqs([]);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-sidebar-border">
        <button
          onClick={() => setActiveTab("project")}
          className={cn(
            "flex-1 px-3 py-2 text-xs font-medium transition-colors",
            activeTab === "project"
              ? "text-sidebar-foreground border-b-2 border-primary"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
          )}
        >
          Projekti
        </button>
        <button
          onClick={() => setActiveTab("catalog")}
          className={cn(
            "flex-1 px-3 py-2 text-xs font-medium transition-colors",
            activeTab === "catalog"
              ? "text-sidebar-foreground border-b-2 border-primary"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
          )}
        >
          Tuoteluettelo
        </button>
        <button
          onClick={() => setActiveTab("work")}
          className={cn(
            "flex-1 px-3 py-2 text-xs font-medium transition-colors",
            activeTab === "work"
              ? "text-sidebar-foreground border-b-2 border-primary"
              : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
          )}
        >
          Työtyypit
        </button>
      </div>

      {/* Admin Excel tools bar */}
      {isAdmin() && activeTab === "catalog" && !editingItem && (
        <div className="flex items-center justify-end px-3 py-1.5 border-b border-sidebar-border bg-sidebar-accent/20">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExcelDialogOpen(true)}
            className="text-xs gap-1.5 text-sidebar-foreground/70 hover:text-sidebar-foreground"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Excel-vienti / -tuonti
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "project" && <ProjectSettings project={project} updateProject={updateProject} />}

        {activeTab === "work" && (
          <WorkTypesSettings
            workTypes={workTypes}
            addWorkType={addWorkType}
            updateWorkType={updateWorkType}
            deleteWorkType={deleteWorkType}
          />
        )}

        {activeTab === "catalog" && !editingItem && (
          <CatalogList
            itemsByCategory={itemsByCategory}
            expandedCategories={expandedCategories}
            toggleCategory={toggleCategory}
            filter={filter}
            setFilter={setFilter}
            onEdit={handleEditItem}
            onDelete={deleteItem}
            onCreate={createNewItem}
          />
        )}

        {activeTab === "catalog" && editingItem && (
          <CatalogItemEditor
            item={editingItem}
            compositions={editingCompositions}
            workReqs={editingWorkReqs}
            allItems={items}
            allProducts={products}
            workTypes={workTypes}
            onChange={setEditingItem}
            onChangeCompositions={setEditingCompositions}
            onChangeWorkReqs={setEditingWorkReqs}
            onSave={handleSaveItem}
            onCancel={() => {
              setEditingItem(null);
              setEditingCompositions([]);
              setEditingWorkReqs([]);
            }}
          />
        )}
      </div>

      {/* Excel dialog */}
      <CatalogExcelDialog
        open={excelDialogOpen}
        onClose={() => setExcelDialogOpen(false)}
        onImportComplete={() => setExcelDialogOpen(false)}
      />
    </div>
  );
}

// Project Settings Component
function ProjectSettings({ project, updateProject }: { project: any; updateProject: (updates: any) => void }) {
  return (
    <div className="p-4 space-y-4">
      <div>
        <Label className="text-xs text-sidebar-foreground/70">ALV %</Label>
        <Input
          type="number"
          value={project?.vatPercentage || 25.5}
          onChange={(e) => updateProject({ vatPercentage: parseFloat(e.target.value) || 0 })}
          className="mt-1 bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
        />
      </div>
      <div>
        <Label className="text-xs text-sidebar-foreground/70">Valuutta</Label>
        <Input
          value={project?.currency || "EUR"}
          onChange={(e) => updateProject({ currency: e.target.value })}
          className="mt-1 bg-sidebar-accent border-sidebar-border text-sidebar-foreground"
        />
      </div>
    </div>
  );
}

// Work Types Settings Component
function WorkTypesSettings({
  workTypes,
  addWorkType,
  updateWorkType,
  deleteWorkType,
}: {
  workTypes: any[];
  addWorkType: (wt: any) => Promise<any>;
  updateWorkType: (id: string, updates: any) => Promise<void>;
  deleteWorkType: (id: string) => Promise<void>;
}) {
  const [newWorkType, setNewWorkType] = useState({ name: "", hourlyRate: 65 });

  const handleAdd = async () => {
    if (newWorkType.name.trim()) {
      await addWorkType({
        name: newWorkType.name.trim(),
        hourlyRate: newWorkType.hourlyRate,
        vatRate: 25.5,
        description: undefined,
      });
      setNewWorkType({ name: "", hourlyRate: 65 });
    }
  };

  return (
    <div className="p-3 space-y-3">
      <p className="text-xs text-sidebar-foreground/60">
        Määritä työtyypit ja niiden tuntihinnat. Näitä käytetään tuotteiden ja toimenpiteiden työkustannusten
        laskennassa.
      </p>

      <div className="space-y-2">
        {workTypes.map((wt) => (
          <div key={wt.id} className="flex items-center gap-2 bg-sidebar-accent/30 rounded px-2 py-1.5">
            <span className="text-sm text-sidebar-foreground flex-1">{wt.name}</span>
            <Input
              type="number"
              value={wt.hourlyRate}
              onChange={(e) => updateWorkType(wt.id, { hourlyRate: parseFloat(e.target.value) || 0 })}
              className="w-20 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs"
            />
            <span className="text-xs text-sidebar-foreground/60">€/h</span>
            <button onClick={() => deleteWorkType(wt.id)} className="p-1 hover:bg-destructive/20 rounded">
              <X className="w-3 h-3 text-destructive" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={newWorkType.name}
          onChange={(e) => setNewWorkType((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="Uusi työtyyppi..."
          className="flex-1 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm"
        />
        <Input
          type="number"
          value={newWorkType.hourlyRate}
          onChange={(e) => setNewWorkType((prev) => ({ ...prev, hourlyRate: parseFloat(e.target.value) || 0 }))}
          className="w-16 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm"
        />
        <Button size="sm" onClick={handleAdd} disabled={!newWorkType.name.trim()}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// Catalog List Component
function CatalogList({
  itemsByCategory,
  expandedCategories,
  toggleCategory,
  filter,
  setFilter,
  onEdit,
  onDelete,
  onCreate,
}: {
  itemsByCategory: Map<string, CatalogItem[]>;
  expandedCategories: string[];
  toggleCategory: (cat: string) => void;
  filter: "all" | "product" | "operation";
  setFilter: (f: "all" | "product" | "operation") => void;
  onEdit: (item: CatalogItem) => void;
  onDelete: (id: string) => Promise<void>;
  onCreate: (type: "product" | "operation") => void;
}) {
  return (
    <div className="p-3">
      {/* Filter buttons */}
      <div className="flex gap-1.5 mb-3 flex-wrap">
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          className={cn("text-xs px-3", filter !== "all" && "bg-sidebar-accent hover:bg-sidebar-accent/80 border-sidebar-border text-sidebar-foreground")}
          onClick={() => setFilter("all")}
        >
          Kaikki
        </Button>
        <Button
          size="sm"
          variant={filter === "product" ? "default" : "outline"}
          className={cn("text-xs gap-1 px-3", filter !== "product" && "bg-sidebar-accent hover:bg-sidebar-accent/80 border-sidebar-border text-sidebar-foreground")}
          onClick={() => setFilter("product")}
        >
          <Package className="w-3 h-3 shrink-0" />
          <span className="truncate">Tuotteet</span>
        </Button>
        <Button
          size="sm"
          variant={filter === "operation" ? "default" : "outline"}
          className={cn("text-xs gap-1 px-3", filter !== "operation" && "bg-sidebar-accent hover:bg-sidebar-accent/80 border-sidebar-border text-sidebar-foreground")}
          onClick={() => setFilter("operation")}
        >
          <Layers className="w-3 h-3 shrink-0" />
          <span className="truncate">Toimenpiteet</span>
        </Button>
      </div>

      {/* Create buttons */}
      <div className="flex gap-2 mb-3">
        <Button variant="outline" size="sm" className="flex-1 min-w-0 bg-sidebar-accent hover:bg-sidebar-accent/80 border-sidebar-border text-sidebar-foreground text-xs" onClick={() => onCreate("product")}>
          <Plus className="w-3.5 h-3.5 mr-1 shrink-0" />
          <span className="truncate">Uusi tuote</span>
        </Button>
        <Button variant="outline" size="sm" className="flex-1 min-w-0 bg-sidebar-accent hover:bg-sidebar-accent/80 border-sidebar-border text-sidebar-foreground text-xs" onClick={() => onCreate("operation")}>
          <Plus className="w-3.5 h-3.5 mr-1 shrink-0" />
          <span className="truncate">Uusi toimenpide</span>
        </Button>
      </div>

      {/* Items by category */}
      {Array.from(itemsByCategory.entries()).map(([category, categoryItems]) => {
        const isExpanded = expandedCategories.includes(category);

        return (
          <div key={category} className="mb-2">
            <button
              onClick={() => toggleCategory(category)}
              className="flex items-center justify-between w-full px-2 py-1.5 hover:bg-sidebar-accent/50 rounded transition-colors"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-sidebar-foreground/50" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-sidebar-foreground/50" />
                )}
                <span className="text-xs font-medium text-sidebar-foreground">{category}</span>
              </div>
              <span className="text-xs text-sidebar-foreground/50">{categoryItems.length}</span>
            </button>

            {isExpanded && (
              <div className="ml-4 space-y-1 mt-1">
                {categoryItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-2 py-1 hover:bg-sidebar-accent/30 rounded group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <CatalogItemIcon item={item} size="sm" />
                      <span className="text-xs text-sidebar-foreground truncate">{item.name}</span>
                      {item.type === "operation" && (
                        <span className="text-[10px] text-primary/70 bg-primary/10 px-1 rounded">Toimenpide</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onEdit(item)}
                        className="p-1 hover:bg-sidebar-accent rounded"
                        title="Muokkaa"
                      >
                        <Edit2 className="w-3 h-3 text-sidebar-foreground/70" />
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm("Haluatko varmasti poistaa tämän?")) {
                            await onDelete(item.id);
                          }
                        }}
                        className="p-1 hover:bg-destructive/20 rounded"
                        title="Poista"
                      >
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Catalog Item Editor Component
function CatalogItemEditor({
  item,
  compositions,
  workReqs,
  allItems,
  allProducts,
  workTypes,
  onChange,
  onChangeCompositions,
  onChangeWorkReqs,
  onSave,
  onCancel,
}: {
  item: CatalogItem;
  compositions: CatalogComposition[];
  workReqs: CatalogItemWork[];
  allItems: CatalogItem[];
  allProducts: CatalogItem[];
  workTypes: any[];
  onChange: (item: CatalogItem) => void;
  onChangeCompositions: (comps: CatalogComposition[]) => void;
  onChangeWorkReqs: (reqs: CatalogItemWork[]) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [activeSection, setActiveSection] = useState<"basic" | "params" | "formula" | "style" | "work" | "composition">(
    "basic",
  );

  const sections =
    item.type === "operation"
      ? [
          { id: "basic", label: "Perustiedot" },
          { id: "params", label: "Parametrit" },
          { id: "composition", label: "Koostumus" },
          { id: "work", label: "Työ" },
          { id: "style", label: "Tyyli" },
        ]
      : [
          { id: "basic", label: "Perustiedot" },
          { id: "params", label: "Parametrit" },
          { id: "formula", label: "Kaava" },
          { id: "work", label: "Työ" },
          { id: "style", label: "Tyyli" },
        ];

  const handleAddParameter = () => {
    const newParam: CatalogParameter = {
      slug: `param_${Date.now()}`,
      label: "Uusi parametri",
      unit: "m",
      default: 0,
    };
    onChange({
      ...item,
      defaultParameters: [...item.defaultParameters, newParam],
    });
  };

  const handleUpdateParameter = (index: number, updates: Partial<CatalogParameter>) => {
    const newParams = [...item.defaultParameters];
    newParams[index] = { ...newParams[index], ...updates };
    onChange({ ...item, defaultParameters: newParams });
  };

  const handleRemoveParameter = (index: number) => {
    onChange({
      ...item,
      defaultParameters: item.defaultParameters.filter((_, i) => i !== index),
    });
  };

  const handleAddComposition = () => {
    const firstProduct = allProducts.find((p) => p.id !== item.id);
    if (!firstProduct) return;

    const newComp: CatalogComposition = {
      id: uuidv4(),
      parentItemId: item.id,
      childItemId: firstProduct.id,
      quantityFactorFormula: "1",
      sortOrder: compositions.length,
    };
    onChangeCompositions([...compositions, newComp]);
  };

  const handleAddWorkReq = () => {
    if (workTypes.length === 0) return;

    const newReq: CatalogItemWork = {
      id: uuidv4(),
      catalogItemId: item.id,
      workTypeId: workTypes[0].id,
      hoursPerUnit: 0.1,
    };
    onChangeWorkReqs([...workReqs, newReq]);
  };

  const geometryOptions = [
    { value: "point", label: "Piste" },
    { value: "line_tied", label: "Viiva (tiehen sidottu)" },
    { value: "line_free", label: "Viiva (vapaa)" },
    { value: "polygon", label: "Alue" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          {item.type === "operation" ? (
            <Layers className="w-4 h-4 text-primary" />
          ) : (
            <Package className="w-4 h-4 text-sidebar-foreground/70" />
          )}
          <h3 className="text-sm font-medium text-sidebar-foreground truncate">
            {item.name || (item.type === "operation" ? "Uusi toimenpide" : "Uusi tuote")}
          </h3>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={onCancel} className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent">
            <X className="w-4 h-4" />
          </Button>
          <Button size="sm" onClick={onSave}>
            <Save className="w-4 h-4 mr-1" />
            Tallenna
          </Button>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex overflow-x-auto border-b border-sidebar-border px-1">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id as any)}
            className={cn(
              "px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
              activeSection === section.id
                ? "text-primary border-b-2 border-primary"
                : "text-sidebar-foreground/60 hover:text-sidebar-foreground",
            )}
          >
            {section.label}
          </button>
        ))}
      </div>

      {/* Section content */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {/* Basic section */}
        {activeSection === "basic" && (
          <>
            <div>
              <Label className="text-xs text-sidebar-foreground/70">Nimi</Label>
              <Input
                value={item.name}
                onChange={(e) => onChange({ ...item, name: e.target.value })}
                className="mt-0.5 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm"
              />
            </div>

            {/* Name formula */}
            <div>
              <Label className="text-xs text-sidebar-foreground/70">
                Nimikaava
                <span className="text-[10px] text-sidebar-foreground/50 ml-1">(dynaaminen nimi)</span>
              </Label>
              <Input
                value={item.nameFormula || ""}
                onChange={(e) => onChange({ ...item, nameFormula: e.target.value || undefined })}
                placeholder="esim. 'Rumpu Ø' + leveys + ' mm'"
                className="mt-0.5 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm font-mono"
              />
              <p className="text-[10px] text-sidebar-foreground/50 mt-1">
                Kaava nimelle parametrien perusteella. Tyhjä = staattinen nimi.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-sidebar-foreground/70">Kategoria</Label>
                <Input
                  value={item.category || ""}
                  onChange={(e) => onChange({ ...item, category: e.target.value })}
                  placeholder="Kategoria..."
                  className="mt-0.5 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-sidebar-foreground/70">Tyyppi</Label>
                <select
                  value={item.measureType}
                  onChange={(e) => onChange({ ...item, measureType: parseInt(e.target.value) as 1 | 2 })}
                  className="w-full mt-0.5 px-3 py-2 bg-sidebar-accent border border-sidebar-border text-sidebar-foreground text-sm rounded-md"
                >
                  <option value={1}>Tievälillinen</option>
                  <option value={2}>Paikallinen</option>
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs text-sidebar-foreground/70">Sallitut geometriat</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {geometryOptions.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-1 text-xs text-sidebar-foreground">
                    <input
                      type="checkbox"
                      checked={item.allowedGeometries.includes(opt.value as any)}
                      onChange={(e) => {
                        const newGeoms = e.target.checked
                          ? [...item.allowedGeometries, opt.value as any]
                          : item.allowedGeometries.filter((g) => g !== opt.value);
                        onChange({ ...item, allowedGeometries: newGeoms });
                      }}
                      className="rounded"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-sidebar-foreground/70">Yksikkö</Label>
                <Input
                  value={item.unit}
                  onChange={(e) => onChange({ ...item, unit: e.target.value })}
                  className="mt-0.5 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-sidebar-foreground/70">
                  Yksikköhinta (luku tai kaava)
                  {item.type === "operation" && (
                    <span className="text-[10px] text-primary ml-1">(lasketaan koostumuksesta)</span>
                  )}
                </Label>
                <Input
                  value={
                    item.type === "operation"
                      ? String(item.unitPrice ?? 0)
                      : (item.priceFormula ?? String(item.unitPrice ?? 0))
                  }
                  onChange={(e) => {
                    const raw = e.target.value;
                    const trimmed = raw.trim();

                    if (item.type === "operation") return;

                    if (trimmed === "") {
                      onChange({ ...item, unitPrice: 0, priceFormula: undefined });
                      return;
                    }

                    const isNumeric = /^-?\d+(?:[\.,]\d+)?$/.test(trimmed);
                    if (isNumeric) {
                      const num = parseFloat(trimmed.replace(",", "."));
                      onChange({
                        ...item,
                        unitPrice: Number.isFinite(num) ? num : 0,
                        priceFormula: undefined,
                      });
                      return;
                    }

                    // Kaava: jätä unitPrice ennalleen (käytetään vain kun kaava tyhjä)
                    onChange({ ...item, priceFormula: raw });
                  }}
                  placeholder="esim. 15 tai leveys_m * 0.5"
                  disabled={item.type === "operation"}
                  className="mt-0.5 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm font-mono disabled:opacity-50"
                />
                {item.type !== "operation" && (
                  <p className="text-[10px] text-sidebar-foreground/50 mt-1">
                    Kirjoita joko kiinteä hinta (luku) tai kaava parametreilla. Desimaalipilkku toimii.
                  </p>
                )}
              </div>
            </div>

            {item.type === "operation" && (
              <div className="bg-primary/10 border border-primary/20 rounded p-2 text-xs text-primary">
                <strong>Toimenpide:</strong> Kustannus lasketaan automaattisesti koostumuksen (toimenpiteen sisältämät
                tuotteet + työ) perusteella. Yksikköhinta on aina 0 €.
              </div>
            )}

            {/* Default Instruction Text */}
            <div>
              <Label className="text-xs text-sidebar-foreground/70 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                Oletusohjeet
              </Label>
              <p className="text-[10px] text-sidebar-foreground/50 mt-0.5 mb-1">
                Asennusohjeet tai toimintaohjeet jotka näkyvät automaattisesti kaikille tämän tyypin kohteille.
              </p>
              <textarea
                value={(item as any).defaultInstructionText || ''}
                onChange={(e) => onChange({ ...item, defaultInstructionText: e.target.value || undefined } as any)}
                placeholder="Esim. Asenna rumpu ohjeen mukaisesti..."
                rows={3}
                className="w-full px-2 py-1.5 bg-sidebar-accent border border-sidebar-border text-sidebar-foreground text-xs rounded resize-none"
              />
            </div>

            {/* Default Images Section */}
            <DefaultImagesEditor
              images={(item as any).defaultImages || []}
              onChange={(newImages) => onChange({ ...item, defaultImages: newImages } as any)}
            />
          </>
        )}

        {/* Parameters section */}
        {activeSection === "params" && (
          <>
            <p className="text-xs text-sidebar-foreground/60">
              Määritä parametrit, joita käyttäjä syöttää piirtäessä. Nämä vaikuttavat määrälaskentaan.
              String- ja select-parametreja voi käyttää kaavoissa <code className="font-mono">if(param("avain") == "arvo", ...)</code> -ehdolla.
            </p>

            <div className="space-y-2">
              {item.defaultParameters.map((param, index) => {
                const paramType = (param as any).type || 'number';
                return (
                <div key={param.slug} className="bg-sidebar-accent/30 rounded p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input
                      value={param.label}
                      onChange={(e) => handleUpdateParameter(index, { label: e.target.value })}
                      placeholder="Näyttönimi (esim. Leveys)"
                      className="flex-1 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs"
                    />
                    <button
                      onClick={() => handleRemoveParameter(index)}
                      className="p-1 hover:bg-destructive/20 rounded"
                    >
                      <X className="w-3 h-3 text-destructive" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <div>
                      <label className="text-[10px] text-sidebar-foreground/50">Avain (slug)</label>
                      <ParameterSlugInput
                        value={param.slug}
                        onChange={(newSlug) => handleUpdateParameter(index, { slug: newSlug })}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-sidebar-foreground/50">Tyyppi</label>
                      <select
                        value={paramType}
                        onChange={(e) => handleUpdateParameter(index, { type: e.target.value as any })}
                        className="w-full px-2 py-1 bg-sidebar-accent border border-sidebar-border text-sidebar-foreground text-xs rounded"
                      >
                        <option value="number">Numero</option>
                        <option value="select">Valinta (select)</option>
                        <option value="string">Teksti (vapaa)</option>
                        <option value="boolean">Kyllä/Ei</option>
                      </select>
                    </div>
                  </div>

                  {/* Number type controls */}
                  {paramType === 'number' && (
                    <>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <label className="text-[10px] text-sidebar-foreground/50">Yksikkö</label>
                          <Input
                            value={param.unit || ""}
                            onChange={(e) => handleUpdateParameter(index, { unit: e.target.value })}
                            className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-sidebar-foreground/50">Oletus</label>
                          <Input
                            type="number"
                            step="0.01"
                            value={param.default}
                            onChange={(e) => handleUpdateParameter(index, { default: parseFloat(e.target.value) || 0 })}
                            className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <label className="text-[10px] text-sidebar-foreground/50">Min</label>
                          <Input
                            type="number"
                            step="0.01"
                            value={param.min ?? ""}
                            onChange={(e) =>
                              handleUpdateParameter(index, { min: e.target.value ? parseFloat(e.target.value) : undefined })
                            }
                            className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-sidebar-foreground/50">Max</label>
                          <Input
                            type="number"
                            step="0.01"
                            value={param.max ?? ""}
                            onChange={(e) =>
                              handleUpdateParameter(index, { max: e.target.value ? parseFloat(e.target.value) : undefined })
                            }
                            className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-sidebar-foreground/50">Väli (step)</label>
                          <Input
                            type="number"
                            step="0.01"
                            value={param.step ?? ""}
                            onChange={(e) =>
                              handleUpdateParameter(index, { step: e.target.value ? parseFloat(e.target.value) : undefined })
                            }
                            className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs"
                          />
                        </div>
                      </div>
                      <p className="text-[10px] text-sidebar-foreground/40">
                        Min/Max/Väli → dropdown-valikko. Tyhjät = automaattinen arvaus tai vapaa kenttä.
                      </p>
                    </>
                  )}

                  {/* Select type controls */}
                  {paramType === 'select' && (
                    <div>
                      <label className="text-[10px] text-sidebar-foreground/50">
                        Oletusarvo & vaihtoehdot (yksi per rivi)
                      </label>
                      <Input
                        value={(param as any).stringDefault || ""}
                        onChange={(e) => handleUpdateParameter(index, { stringDefault: e.target.value } as any)}
                        placeholder="Oletusarvo (esim. uusi)"
                        className="mb-1 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs"
                      />
                      <textarea
                        defaultValue={((param as any).stringOptions || []).join('\n')}
                        onBlur={(e) => {
                          const opts = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
                          handleUpdateParameter(index, { stringOptions: opts } as any);
                        }}
                        placeholder={"vanha\nuusi\nkunnostus"}
                        rows={4}
                        className="w-full px-2 py-1.5 bg-sidebar-accent border border-sidebar-border text-sidebar-foreground text-xs rounded font-mono resize-none"
                      />
                      <p className="text-[10px] text-sidebar-foreground/40 mt-0.5">
                        Käytä kaavoissa: <code className="font-mono">if(param("{param.slug}") == "arvo", 10, 5)</code>
                      </p>
                    </div>
                  )}

                  {/* String type controls */}
                  {paramType === 'string' && (
                    <div>
                      <label className="text-[10px] text-sidebar-foreground/50">Oletusteksti</label>
                      <Input
                        value={(param as any).stringDefault || ""}
                        onChange={(e) => handleUpdateParameter(index, { stringDefault: e.target.value } as any)}
                        placeholder="Oletusteksti"
                        className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs"
                      />
                      <p className="text-[10px] text-sidebar-foreground/40 mt-0.5">
                        Käytä kaavoissa: <code className="font-mono">if(param("{param.slug}") == "teksti", 10, 5)</code>
                      </p>
                    </div>
                  )}

                  {/* Boolean type controls */}
                  {paramType === 'boolean' && (
                    <div>
                      <label className="text-[10px] text-sidebar-foreground/50">Oletusarvo</label>
                      <select
                        value={(param as any).stringDefault || "ei"}
                        onChange={(e) => handleUpdateParameter(index, { stringDefault: e.target.value } as any)}
                        className="w-full px-2 py-1 bg-sidebar-accent border border-sidebar-border text-sidebar-foreground text-xs rounded"
                      >
                        <option value="kylla">Kyllä</option>
                        <option value="ei">Ei</option>
                      </select>
                      <p className="text-[10px] text-sidebar-foreground/40 mt-0.5">
                        Käytä kaavoissa: <code className="font-mono">if(param("{param.slug}") == "kylla", 10, 0)</code>
                      </p>
                    </div>
                  )}
                </div>
              )})}
            </div>

            <Button size="sm" variant="outline" className="w-full" onClick={handleAddParameter}>
              <Plus className="w-4 h-4 mr-1" />
              Lisää parametri
            </Button>
          </>
        )}

        {/* Formula section (for Products only) */}
        {activeSection === "formula" && item.type === "product" && (
          <>
            <p className="text-xs text-sidebar-foreground/60">
              Määritä kaava, jolla lasketaan tuotteen määrä. (Yksikköhinta asetetaan Perustiedot-osiossa.)
            </p>

            <div>
              <Label className="text-xs text-sidebar-foreground/70">Määräkaava</Label>
              <Input
                value={item.quantityFormula || ""}
                onChange={(e) => onChange({ ...item, quantityFormula: e.target.value })}
                placeholder="esim. pituus * leveys * paksuus"
                className="mt-0.5 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm font-mono"
              />
              <p className="text-[10px] text-sidebar-foreground/50 mt-1">
                Käytettävissä: {item.defaultParameters.map((p) => p.slug).join(", ") || "ei parametreja"} + pituus
                (geometriasta)
              </p>
            </div>
          </>
        )}

        {/* Composition section (for Operations only) */}
        {activeSection === "composition" && item.type === "operation" && (
          <>
            <p className="text-xs text-sidebar-foreground/60">
              Määritä toimenpiteen koostumus. Kustannus lasketaan näiden alituotteiden summana.
            </p>

            <div className="space-y-2">
              {compositions.map((comp, index) => {
                const childItem = allItems.find((i) => i.id === comp.childItemId);
                return (
                  <div key={comp.id} className="bg-sidebar-accent/30 rounded p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={comp.childItemId}
                        onChange={(e) => {
                          const newComps = [...compositions];
                          newComps[index] = { ...comp, childItemId: e.target.value };
                          onChangeCompositions(newComps);
                        }}
                        className="flex-1 px-2 py-1.5 bg-sidebar-accent border border-sidebar-border text-sidebar-foreground text-xs rounded"
                      >
                        {allProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => onChangeCompositions(compositions.filter((_, i) => i !== index))}
                        className="p-1 hover:bg-destructive/20 rounded"
                      >
                        <X className="w-3 h-3 text-destructive" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-sidebar-foreground/50">Määräkerroin (kaava)</label>
                        <Input
                          value={comp.quantityFactorFormula}
                          onChange={(e) => {
                            const newComps = [...compositions];
                            newComps[index] = { ...comp, quantityFactorFormula: e.target.value };
                            onChangeCompositions(newComps);
                          }}
                          placeholder="esim. parent.area * 0.1"
                          className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-sidebar-foreground/50">Otsikko (valinnainen)</label>
                        <Input
                          value={comp.label || ""}
                          onChange={(e) => {
                            const newComps = [...compositions];
                            newComps[index] = { ...comp, label: e.target.value };
                            onChangeCompositions(newComps);
                          }}
                          placeholder="esim. 'Rumpu Ø' + leveys"
                          className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button size="sm" variant="outline" className="w-full" onClick={handleAddComposition}>
              <Plus className="w-4 h-4 mr-1" />
              Lisää alituote
            </Button>
          </>
        )}

        {/* Work section */}
        {activeSection === "work" && (
          <>
            <p className="text-xs text-sidebar-foreground/60">
              Määritä työvaatimukset. Työkustannus = määrä × tuntia/yksikkö × tuntihinta.
            </p>

            <div className="space-y-2">
              {workReqs.map((req, index) => {
                const workType = workTypes.find((wt) => wt.id === req.workTypeId);
                return (
                  <div key={req.id} className="bg-sidebar-accent/30 rounded px-2 py-1.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <select
                        value={req.workTypeId}
                        onChange={(e) => {
                          const newReqs = [...workReqs];
                          newReqs[index] = { ...req, workTypeId: e.target.value };
                          onChangeWorkReqs(newReqs);
                        }}
                        className="flex-1 px-2 py-1 bg-sidebar-accent border border-sidebar-border text-sidebar-foreground text-xs rounded"
                      >
                        {workTypes.map((wt) => (
                          <option key={wt.id} value={wt.id}>
                            {wt.name} ({wt.hourlyRate} €/h)
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => onChangeWorkReqs(workReqs.filter((_, i) => i !== index))}
                        className="p-1 hover:bg-destructive/20 rounded"
                      >
                        <X className="w-3 h-3 text-destructive" />
                      </button>
                    </div>
                    <div>
                      <label className="text-[10px] text-sidebar-foreground/50">Tunnit / yks (luku tai kaava)</label>
                      <Input
                        value={req.hoursFormula ?? String(req.hoursPerUnit ?? 0)}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const trimmed = raw.trim();

                          const newReqs = [...workReqs];

                          if (trimmed === "") {
                            newReqs[index] = { ...req, hoursPerUnit: 0, hoursFormula: undefined };
                            onChangeWorkReqs(newReqs);
                            return;
                          }

                          const isNumeric = /^-?\d+(?:[\.,]\d+)?$/.test(trimmed);
                          if (isNumeric) {
                            const num = parseFloat(trimmed.replace(",", "."));
                            newReqs[index] = {
                              ...req,
                              hoursPerUnit: Number.isFinite(num) ? num : 0,
                              hoursFormula: undefined,
                            };
                          } else {
                            newReqs[index] = { ...req, hoursPerUnit: 0, hoursFormula: raw };
                          }

                          onChangeWorkReqs(newReqs);
                        }}
                        placeholder="esim. 0.8 tai 0.2 + (pituus_m / 10)"
                        className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs font-mono"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={handleAddWorkReq}
              disabled={workTypes.length === 0}
            >
              <Plus className="w-4 h-4 mr-1" />
              Lisää työvaatimus
            </Button>
          </>
        )}

        {/* Style section */}
        {activeSection === "style" && (
          <MarkerStyleEditor
            markerStyle={item.markerStyle}
            onChange={(newStyle) => onChange({ ...item, markerStyle: newStyle })}
          />
        )}
      </div>
    </div>
  );
}

// Parameter slug input with local state to prevent cursor jumping
function ParameterSlugInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  return (
    <Input
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value.replace(/\s/g, "_"))}
      onBlur={() => onChange(localValue)}
      className="bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-xs"
    />
  );
}

// Marker Style Editor Component with image selection
function MarkerStyleEditor({
  markerStyle,
  onChange,
}: {
  markerStyle: MarkerStyle;
  onChange: (style: MarkerStyle) => void;
}) {
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const builtinMarkerKeys = Object.keys(BUILTIN_MARKERS);
  const resolvedImage = resolveMarkerImage(markerStyle.image);

  const handleSelectBuiltin = (key: string) => {
    onChange({ ...markerStyle, shape: "custom", image: key });
    setShowImagePicker(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const url = await uploadMarkerImage(file);
      if (url) {
        onChange({ ...markerStyle, shape: "custom", image: url });
        setShowImagePicker(false);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveImage = () => {
    onChange({ ...markerStyle, shape: "circle", image: undefined });
  };

  return (
    <>
      <p className="text-xs text-sidebar-foreground/60">Määritä, miltä tuote/toimenpide näyttää kartalla.</p>

      {/* Current marker preview */}
      <div className="flex items-center gap-3 p-3 bg-sidebar-accent/30 rounded-lg">
        <div
          className="w-12 h-12 rounded-lg border border-sidebar-border flex items-center justify-center"
          style={{ backgroundColor: markerStyle.color + "20" }}
        >
          {markerStyle.shape === "custom" && resolvedImage ? (
            <img src={resolvedImage} alt="Marker" className="w-10 h-10 object-contain" />
          ) : markerStyle.shape === "circle" ? (
            <div className="w-8 h-8 rounded-full" style={{ backgroundColor: markerStyle.color }} />
          ) : markerStyle.shape === "square" ? (
            <div className="w-8 h-8 rounded-sm" style={{ backgroundColor: markerStyle.color }} />
          ) : (
            <div
              className="w-0 h-0 border-l-[16px] border-r-[16px] border-b-[28px] border-l-transparent border-r-transparent"
              style={{ borderBottomColor: markerStyle.color }}
            />
          )}
        </div>
        <div className="flex-1">
          <p className="text-xs font-medium text-sidebar-foreground">
            {markerStyle.shape === "custom"
              ? "Mukautettu kuva"
              : markerStyle.shape === "circle"
                ? "Ympyrä"
                : markerStyle.shape === "square"
                  ? "Neliö"
                  : "Kolmio"}
          </p>
          <p className="text-[10px] text-sidebar-foreground/50">
            Koko: {markerStyle.size}px • Väri: {markerStyle.color}
          </p>
        </div>
        {markerStyle.shape === "custom" && markerStyle.image && (
          <button onClick={handleRemoveImage} className="p-1.5 hover:bg-destructive/20 rounded" title="Poista kuva">
            <X className="w-4 h-4 text-destructive" />
          </button>
        )}
      </div>

      {/* Shape selector */}
      <div>
        <Label className="text-xs text-sidebar-foreground/70">Muoto</Label>
        <div className="grid grid-cols-4 gap-2 mt-1">
          {(["circle", "square", "triangle", "custom"] as const).map((shape) => (
            <button
              key={shape}
              onClick={() => {
                if (shape === "custom") {
                  setShowImagePicker(true);
                } else {
                  onChange({ ...markerStyle, shape, image: undefined });
                }
              }}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-md border transition-colors",
                markerStyle.shape === shape
                  ? "border-primary bg-primary/10"
                  : "border-sidebar-border hover:bg-sidebar-accent/50",
              )}
            >
              {shape === "circle" && <div className="w-5 h-5 rounded-full bg-sidebar-foreground/50" />}
              {shape === "square" && <div className="w-5 h-5 rounded-sm bg-sidebar-foreground/50" />}
              {shape === "triangle" && (
                <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-b-[18px] border-l-transparent border-r-transparent border-b-sidebar-foreground/50" />
              )}
              {shape === "custom" && <ImagePlus className="w-5 h-5 text-sidebar-foreground/50" />}
              <span className="text-[10px] text-sidebar-foreground/70">
                {shape === "circle"
                  ? "Ympyrä"
                  : shape === "square"
                    ? "Neliö"
                    : shape === "triangle"
                      ? "Kolmio"
                      : "Kuva"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Color and size */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-sidebar-foreground/70">Väri</Label>
          <div className="flex gap-2 mt-0.5">
            <input
              type="color"
              value={markerStyle.color}
              onChange={(e) => onChange({ ...markerStyle, color: e.target.value })}
              className="w-10 h-9 rounded border border-sidebar-border cursor-pointer"
            />
            <Input
              value={markerStyle.color}
              onChange={(e) => onChange({ ...markerStyle, color: e.target.value })}
              className="flex-1 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm font-mono"
            />
          </div>
        </div>
        <div>
          <Label className="text-xs text-sidebar-foreground/70">Koko (px)</Label>
          <Input
            type="number"
            value={markerStyle.size}
            onChange={(e) => onChange({ ...markerStyle, size: parseInt(e.target.value) || 24 })}
            className="mt-0.5 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm"
          />
        </div>
      </div>

      {/* Line style options (for line geometries) */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs text-sidebar-foreground/70">Viivan leveys (px)</Label>
          <Input
            type="number"
            step="1"
            min="1"
            value={markerStyle.lineWidth ?? 3}
            onChange={(e) => onChange({ ...markerStyle, lineWidth: parseInt(e.target.value) || 3 })}
            className="mt-0.5 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-sidebar-foreground/70">Offset (m)</Label>
          <Input
            type="number"
            step="0.5"
            value={markerStyle.strokeOffset ?? 0}
            onChange={(e) => onChange({ ...markerStyle, strokeOffset: parseFloat(e.target.value) || 0 })}
            className="mt-0.5 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm"
          />
          <p className="text-[10px] text-sidebar-foreground/50 mt-0.5">
            Negatiivinen = vasemmalle, positiivinen = oikealle
          </p>
        </div>
      </div>

      {/* Dash pattern */}
      <div>
        <Label className="text-xs text-sidebar-foreground/70">Katkoviiva (pattern)</Label>
        <Input
          value={markerStyle.dashArray || ""}
          onChange={(e) => onChange({ ...markerStyle, dashArray: e.target.value || undefined })}
          placeholder="esim. 10, 5 tai tyhjä = yhtenäinen"
          className="mt-0.5 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm font-mono"
        />
        <p className="text-[10px] text-sidebar-foreground/50 mt-0.5">
          Muoto: viiva, väli (px). Tyhjä = yhtenäinen viiva
        </p>
      </div>

      {/* Opacity */}
      <div>
        <Label className="text-xs text-sidebar-foreground/70">Läpinäkyvyys ({Math.round((markerStyle.opacity ?? 1) * 100)}%)</Label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={markerStyle.opacity ?? 1}
          onChange={(e) => onChange({ ...markerStyle, opacity: parseFloat(e.target.value) })}
          className="mt-1 w-full h-2 rounded-full appearance-none bg-sidebar-accent cursor-pointer accent-primary"
        />
      </div>

      {/* Render order / Z-index */}
      <div>
        <Label className="text-xs text-sidebar-foreground/70">Piirtojärjestys (taso)</Label>
        <Select
          value={String(markerStyle.renderOrder ?? 1)}
          onValueChange={(v) => onChange({ ...markerStyle, renderOrder: parseInt(v) })}
        >
          <SelectTrigger className="mt-0.5 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">0 – Tien taakse</SelectItem>
            <SelectItem value="1">1 – Normaali (oletus)</SelectItem>
            <SelectItem value="2">2 – Muiden päällä</SelectItem>
            <SelectItem value="3">3 – Päällimmäisenä</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[10px] text-sidebar-foreground/50 mt-0.5">
          0 = tien alapuolella, 1 = normaali, 2-3 = muiden päällä
        </p>
      </div>

      {/* Fill icon */}
      <div>
        <Label className="text-xs text-sidebar-foreground/70">Täyttökuvio (ikoni)</Label>
        <Select
          value={markerStyle.fillIcon || "__none__"}
          onValueChange={(v) => onChange({ ...markerStyle, fillIcon: v === "__none__" ? undefined : v })}
        >
          <SelectTrigger className="mt-0.5 bg-sidebar-accent border-sidebar-border text-sidebar-foreground text-sm">
            <SelectValue placeholder="Ei täyttökuviota" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Ei täyttökuviota</SelectItem>
            <SelectItem value="trees">🌲 Puut (trees)</SelectItem>
            <SelectItem value="tree-pine">🌲 Kuusi (tree-pine)</SelectItem>
            <SelectItem value="droplets">💧 Pisarat (droplets)</SelectItem>
            <SelectItem value="droplet">💧 Pisara (droplet)</SelectItem>
            <SelectItem value="waves">🌊 Aallot (waves)</SelectItem>
            <SelectItem value="zap">⚡ Salama (zap)</SelectItem>
            <SelectItem value="shovel">🪏 Lapio (shovel)</SelectItem>
            <SelectItem value="pickaxe">⛏️ Hakku (pickaxe)</SelectItem>
            <SelectItem value="mountain">⛰️ Vuori (mountain)</SelectItem>
            <SelectItem value="fence">🏗️ Aita (fence)</SelectItem>
            <SelectItem value="construction">🚧 Rakennustyö (construction)</SelectItem>
            <SelectItem value="hash">## Ristikko (hash)</SelectItem>
            <SelectItem value="x">✕ Rasti (x)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[10px] text-sidebar-foreground/50 mt-0.5">
          Haaleana toistuva kuvio viivan sisällä (aluemainen efekti).
        </p>
      </div>

      {/* Image picker modal */}
      {showImagePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-lg shadow-elevated border border-border w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-foreground">Valitse kuvake</h3>
              <button onClick={() => setShowImagePicker(false)} className="p-1 hover:bg-muted rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-4">
              {/* Upload custom */}
              <div>
                <Label className="text-xs text-muted-foreground">Lataa oma kuva</Label>
                <div className="mt-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    <ImagePlus className="w-4 h-4 mr-2" />
                    {uploading ? "Ladataan..." : "Valitse tiedosto"}
                  </Button>
                </div>
              </div>

              {/* Builtin markers */}
              <div>
                <Label className="text-xs text-muted-foreground">Valmiit kuvakkeet</Label>
                <div className="grid grid-cols-5 gap-2 mt-2">
                  {builtinMarkerKeys.map((key) => {
                    const imgSrc = BUILTIN_MARKERS[key];
                    const isSelected = markerStyle.image === key;
                    return (
                      <button
                        key={key}
                        onClick={() => handleSelectBuiltin(key)}
                        className={cn(
                          "relative p-1 rounded-md border transition-colors hover:border-primary",
                          isSelected ? "border-primary bg-primary/10" : "border-border",
                        )}
                        title={key.replace("builtin:", "")}
                      >
                        <img src={imgSrc} alt={key} className="w-10 h-10 object-contain mx-auto" />
                        {isSelected && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                            <Check className="w-3 h-3 text-primary-foreground" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Default Images Editor Component for catalog items
function DefaultImagesEditor({
  images,
  onChange,
}: {
  images: ProductImage[];
  onChange: (images: ProductImage[]) => void;
}) {
  const { uploading, uploadCatalogImages } = useProductImages();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const newImages = await uploadCatalogImages(Array.from(files));
      onChange([...images, ...newImages]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemove = (id: string) => {
    onChange(images.filter((img) => img.id !== id));
  };

  const galleryImages: GalleryImage[] = images.map((img) => ({
    id: img.id,
    url: img.url,
    description: img.description,
    isDefault: true,
  }));

  return (
    <div className="mt-4">
      <Label className="text-xs text-sidebar-foreground/70 flex items-center gap-1.5 mb-2">
        <ImagePlus className="w-3.5 h-3.5" />
        Oletuskuvat (ohjekuvat)
      </Label>
      <p className="text-[10px] text-sidebar-foreground/50 mb-2">
        Lisää asennusohjeita, piirustuksia tai mallikuvia jotka näkyvät automaattisesti kaikille tämän tyypin kohteille.
      </p>

      {galleryImages.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-2">
          {galleryImages.map((img) => (
            <div key={img.id} className="relative group">
              <img
                src={img.url}
                alt={img.description || "Ohjekuva"}
                className="w-14 h-14 object-cover rounded border border-border"
              />
              <button
                onClick={() => handleRemove(img.id)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-sidebar-foreground/50 mb-2">Ei oletuskuvia</div>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} className="hidden" />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full text-xs"
      >
        <Plus className="w-3.5 h-3.5 mr-1.5" />
        {uploading ? "Ladataan..." : "Lisää oletuskuvia"}
      </Button>
    </div>
  );
}
