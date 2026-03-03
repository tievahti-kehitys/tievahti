import React, { useState } from 'react';
import { useProject } from '@/context/ProjectContext';
import { ProductInstance } from '@/types/project';
import { useCatalog } from '@/context/CatalogContext';
import { useRole } from '@/context/RoleContext';
import { Eye, EyeOff, Trash2, MapPin, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CatalogItemIcon } from '@/components/catalog/CatalogItemIcon';
import { cn } from '@/lib/utils';

export function ProjectItemsPanel() {
  const { project, allProducts, updateProduct, removeProduct, setSelectedProductId, selectedProductId } = useProject();
  const { items } = useCatalog();
  const { canEdit } = useRole();
  const isReadOnly = !canEdit();
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['Toimenpiteet', 'Tuotteet']);

  if (!project) {
    return (
      <div className="p-4 text-center text-sidebar-foreground/60">
        <p className="text-sm">Valitse ensin projekti</p>
      </div>
    );
  }

  if (allProducts.length === 0) {
    return (
      <div className="p-4 text-center text-sidebar-foreground/60">
        <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Ei vielä kohteita</p>
        <p className="text-xs mt-1">Piirrä tuotteita tai toimenpiteitä kartalle</p>
      </div>
    );
  }

  // Group products by type (operations vs products)
  const operations = allProducts.filter(p => {
    const def = items.find(i => i.id === p.productDefinitionId);
    return def?.type === 'operation';
  });

  const products = allProducts.filter(p => {
    const def = items.find(i => i.id === p.productDefinitionId);
    return def?.type === 'product';
  });

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Haluatko varmasti poistaa tämän kohteen?')) {
      removeProduct(id);
    }
  };

  const handleToggleVisibility = (id: string, visible: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    updateProduct(id, { visible: !visible });
  };

  const renderItem = (productInstance: ProductInstance) => {
    const definition = items.find(i => i.id === productInstance.productDefinitionId);
    if (!definition) return null;

    const isSelected = selectedProductId === productInstance.id;

    return (
      <div
        key={productInstance.id}
        onClick={() => setSelectedProductId(productInstance.id)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors",
          isSelected
            ? "bg-primary/20 border border-primary/30"
            : "hover:bg-sidebar-accent/50"
        )}
      >
        {/* Marker icon */}
        <CatalogItemIcon
          item={definition}
          customImage={productInstance.customMarkerImage}
          colorOverride={productInstance.colorOverride}
          size="sm"
        />

        {/* Name and info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-sidebar-foreground truncate">
            {definition.name}
          </p>
          <p className="text-xs text-sidebar-foreground/60">
            {productInstance.geometry.type === 'point' ? 'Piste' : 
             productInstance.geometry.type === 'line' ? 'Viiva' : 'Alue'}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={(e) => handleToggleVisibility(productInstance.id, productInstance.visible, e)}
            className="p-1.5 rounded hover:bg-sidebar-accent"
          >
            {productInstance.visible ? (
              <Eye className="w-3.5 h-3.5 text-sidebar-foreground/60" />
            ) : (
              <EyeOff className="w-3.5 h-3.5 text-sidebar-foreground/40" />
            )}
          </button>
          {!isReadOnly && (
            <button
              onClick={(e) => handleDelete(productInstance.id, e)}
              className="p-1.5 rounded hover:bg-destructive/20"
            >
              <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderCategory = (title: string, itemList: ProductInstance[]) => {
    if (itemList.length === 0) return null;

    const isExpanded = expandedCategories.includes(title);

    return (
      <div key={title} className="border-b border-sidebar-border last:border-b-0">
        <button
          onClick={() => toggleCategory(title)}
          className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-sidebar-accent/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-sidebar-foreground/60" />
            ) : (
              <ChevronRight className="w-4 h-4 text-sidebar-foreground/60" />
            )}
            <span className="text-sm font-bold text-sidebar-foreground">{title}</span>
          </div>
          <span className="text-xs text-sidebar-foreground/60 bg-sidebar-accent px-2 py-0.5 rounded-full">
            {itemList.length}
          </span>
        </button>

        {isExpanded && (
          <div className="pb-2 px-2 space-y-1">
            {itemList.map(renderItem)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="overflow-auto flex-1">
      <div className="p-3 border-b border-sidebar-border">
        <h2 className="text-sm font-bold text-sidebar-foreground">Projektin kohteet</h2>
        <p className="text-xs text-sidebar-foreground/60 mt-0.5">
          {allProducts.length} kohdetta kartalla
        </p>
      </div>
      
      {renderCategory('Toimenpiteet', operations)}
      {renderCategory('Tuotteet', products)}
    </div>
  );
}
