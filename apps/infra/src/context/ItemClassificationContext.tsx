/**
 * ItemClassificationContext
 *
 * Manages "focus mode" for classifying a single product item.
 * When active:
 *  - Only the target item (and its existing segments) are shown on the map
 *  - The polygon drawing tool is activated
 *  - On polygon completion, the same split/merge engine is used as in area classification,
 *    but restricted to the activeItemId
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

interface ItemClassificationState {
  /** ID of the product being classified. null = not in focus mode */
  activeItemId: string | null;
  /** Whether the polygon draw tool should be activated */
  isClassificationMode: boolean;
}

interface ItemClassificationContextType {
  state: ItemClassificationState;
  /** Enter focus mode for a specific item */
  startClassification: (itemId: string) => void;
  /** Exit focus mode, restore normal map view */
  stopClassification: () => void;
}

const ItemClassificationContext = createContext<ItemClassificationContextType | null>(null);

export function ItemClassificationProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ItemClassificationState>({
    activeItemId: null,
    isClassificationMode: false,
  });

  const startClassification = useCallback((itemId: string) => {
    setState({ activeItemId: itemId, isClassificationMode: true });
    // Signal MapContainer to switch to polygon drawing mode
    window.dispatchEvent(
      new CustomEvent('drawing-mode-change', { detail: { mode: 'polygon' } })
    );
  }, []);

  const stopClassification = useCallback(() => {
    setState({ activeItemId: null, isClassificationMode: false });
    // Ensure drawing mode is cleared
    window.dispatchEvent(
      new CustomEvent('drawing-mode-change', { detail: { mode: 'none' } })
    );
  }, []);

  return (
    <ItemClassificationContext.Provider value={{ state, startClassification, stopClassification }}>
      {children}
    </ItemClassificationContext.Provider>
  );
}

const FALLBACK: ItemClassificationContextType = {
  state: { activeItemId: null, isClassificationMode: false },
  startClassification: () => {},
  stopClassification: () => {},
};

export function useItemClassification() {
  const ctx = useContext(ItemClassificationContext);
  return ctx ?? FALLBACK;
}
