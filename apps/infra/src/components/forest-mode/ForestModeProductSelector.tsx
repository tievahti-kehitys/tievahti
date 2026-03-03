import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useCatalog, CatalogItem } from '@/context/CatalogContext';
import { ProductCategoryAccordion } from './ProductCategoryAccordion';
import { ProductParameterForm } from './ProductParameterForm';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';

type ViewState = 'categories' | 'parameters';

interface ForestModeProductSelectorProps {
  open: boolean;
  onClose: () => void;
  geometryType: 'point' | 'line' | 'polygon';
  onProductSelected: (itemId: string, parameters: Record<string, number>) => void;
}

export function ForestModeProductSelector({
  open,
  onClose,
  geometryType,
  onProductSelected,
}: ForestModeProductSelectorProps) {
  const { items } = useCatalog();
  const [view, setView] = useState<ViewState>('categories');
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);

  // Filter only active items
  const activeItems = items.filter(item => item.isActive);

  const handleItemSelect = (item: CatalogItem) => {
    setSelectedItem(item);
    setView('parameters');
  };

  const handleSave = (parameters: Record<string, number>) => {
    if (selectedItem) {
      onProductSelected(selectedItem.id, parameters);
      handleClose();
    }
  };

  const handleBack = () => {
    setView('categories');
    setSelectedItem(null);
  };

  const handleClose = () => {
    setView('categories');
    setSelectedItem(null);
    onClose();
  };

  return (
    <Drawer open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DrawerContent className="h-[85vh] max-h-[85vh]">
        {view === 'categories' && (
          <>
            <DrawerHeader className="border-b border-border">
              <div className="flex items-center justify-between">
                <DrawerTitle className="text-lg font-bold">
                  Valitse {geometryType === 'point' ? 'pistetuote' : 'toimenpide'}
                </DrawerTitle>
                <DrawerClose className="p-2 -mr-2 rounded-lg hover:bg-muted">
                  <X className="w-5 h-5" />
                </DrawerClose>
              </div>
            </DrawerHeader>
            <div className="flex-1 overflow-auto">
              <ProductCategoryAccordion
                items={activeItems}
                selectedItemId={selectedItem?.id}
                onSelect={handleItemSelect}
                geometryType={geometryType}
              />
            </div>
          </>
        )}

        {view === 'parameters' && selectedItem && (
          <ProductParameterForm
            item={selectedItem}
            onSave={handleSave}
            onBack={handleBack}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}
