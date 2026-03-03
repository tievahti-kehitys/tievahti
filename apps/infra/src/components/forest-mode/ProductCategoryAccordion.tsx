import React from 'react';
import { ChevronDown } from 'lucide-react';
import { CatalogItem } from '@/context/CatalogContext';
import { CatalogItemIcon } from '@/components/catalog/CatalogItemIcon';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';

interface ProductCategoryAccordionProps {
  items: CatalogItem[];
  selectedItemId?: string;
  onSelect: (item: CatalogItem) => void;
  geometryType: 'point' | 'line' | 'polygon';
}

export function ProductCategoryAccordion({
  items,
  selectedItemId,
  onSelect,
  geometryType,
}: ProductCategoryAccordionProps) {
  // Filter items by allowed geometry
  const filteredItems = items.filter(item => {
    if (geometryType === 'point') {
      return item.allowedGeometries.includes('point');
    }
    if (geometryType === 'line') {
      return item.allowedGeometries.includes('line_tied') || 
             item.allowedGeometries.includes('line_free');
    }
    if (geometryType === 'polygon') {
      return item.allowedGeometries.includes('polygon');
    }
    return true;
  });

  // Group items by category
  const categories = filteredItems.reduce((acc, item) => {
    const category = item.category || 'Muut';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, CatalogItem[]>);

  const categoryNames = Object.keys(categories).sort((a, b) => {
    if (a === 'Muut') return 1;
    if (b === 'Muut') return -1;
    return a.localeCompare(b, 'fi');
  });

  if (categoryNames.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Ei tuotteita tälle geometriatyypille
      </div>
    );
  }

  // If only one category, open it by default
  const defaultValue = categoryNames.length === 1 ? [categoryNames[0]] : [];

  return (
    <Accordion type="multiple" defaultValue={defaultValue} className="w-full">
      {categoryNames.map(category => (
        <AccordionItem key={category} value={category} className="border-b-0">
          <AccordionTrigger className="py-3 px-4 hover:bg-muted/50 text-base font-bold">
            <span className="flex items-center gap-2">
              {category}
              <span className="text-xs font-normal text-muted-foreground">
                ({categories[category].length})
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-0">
            <div className="flex flex-col">
              {categories[category].map(item => (
                <button
                  key={item.id}
                  onClick={() => onSelect(item)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-4 text-left transition-colors border-b border-border/50 last:border-b-0',
                    'hover:bg-muted/50 active:bg-muted',
                    selectedItemId === item.id && 'bg-primary/10 border-l-4 border-l-primary'
                  )}
                >
                  <CatalogItemIcon item={item} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.unit} • {item.type === 'operation' ? 'Toimenpide' : 'Tuote'}
                    </p>
                  </div>
                  <ChevronDown className="w-5 h-5 text-muted-foreground -rotate-90" />
                </button>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
