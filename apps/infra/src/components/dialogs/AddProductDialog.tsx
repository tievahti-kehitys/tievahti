import React, { useState, useMemo } from 'react';
import { useCatalog } from '@/context/CatalogContext';
import { X, Search, ChevronDown, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { CatalogItemIcon } from '@/components/catalog/CatalogItemIcon';
import { cn } from '@/lib/utils';

interface AddProductDialogProps {
  onSelect: (catalogItemId: string) => void;
  onClose: () => void;
  geometryType: 'point' | 'line' | 'polygon';
}

export function AddProductDialog({ onSelect, onClose, geometryType }: AddProductDialogProps) {
  const { items, getCategories } = useCatalog();
  const [searchQuery, setSearchQuery] = useState('');
  const categories = getCategories();
  const [expandedCategories, setExpandedCategories] = useState<string[]>(categories);

  // Map geometry type to allowed geometries
  const allowedGeometries: string[] = geometryType === 'point'
    ? ['point']
    : geometryType === 'polygon'
    ? ['polygon']
    : ['line_free', 'line_tied'];

  const filteredItems = useMemo(() => {
    let filtered = items.filter(item =>
      item.allowedGeometries.some(g => allowedGeometries.includes(g))
    );

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        item => item.name.toLowerCase().includes(query) || (item.category || '').toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [items, searchQuery, allowedGeometries]);

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, typeof items>();
    filteredItems.forEach(item => {
      const category = item.category || 'Muut';
      const existing = map.get(category) || [];
      map.set(category, [...existing, item]);
    });
    return map;
  }, [filteredItems]);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev =>
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg shadow-elevated border border-border w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted">
          <h2 className="font-bold text-foreground">Valitse tuote tai toimenpide</h2>
          <button onClick={onClose} className="p-2 hover:bg-background rounded-md">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Hae tuotteita tai toimenpiteitä..."
              className="pl-8"
              autoFocus
            />
          </div>
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-auto">
          {Array.from(itemsByCategory.entries()).map(([category, categoryItems]) => {
            if (!categoryItems || categoryItems.length === 0) return null;

            const isExpanded = expandedCategories.includes(category);

            return (
              <div key={category} className="border-b border-border/50">
                <button
                  onClick={() => toggleCategory(category)}
                  className="flex items-center justify-between w-full px-4 py-2.5 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span className="text-sm font-bold">{category}</span>
                  </div>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {categoryItems.length}
                  </span>
                </button>

                {isExpanded && (
                  <div className="pb-1">
                    {categoryItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => onSelect(item.id)}
                        className="flex items-center gap-3 w-full px-4 py-2.5 pl-10 hover:bg-primary/10 transition-colors text-left"
                      >
                        {/* Icon from catalog item */}
                        <CatalogItemIcon item={item} size="md" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium block truncate">{item.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {item.unit} • {item.type === 'operation'
                              ? 'Toimenpide'
                              : item.priceFormula
                                ? 'Hinta: kaava'
                                : `${item.unitPrice.toFixed(0)} €`}
                          </span>
                        </div>
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-medium",
                          item.type === 'operation'
                            ? "bg-primary/20 text-primary"
                            : item.measureType === 1
                            ? "bg-info/20 text-info"
                            : "bg-success/20 text-success"
                        )}>
                          {item.type === 'operation' ? 'Toimenpide' : item.measureType === 1 ? 'Tieväli' : 'Paikallinen'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
