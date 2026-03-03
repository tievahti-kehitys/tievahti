import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCategoryFilter } from '@/context/CategoryFilterContext';
import { useProject } from '@/context/ProjectContext';
import { useItemClassification } from '@/context/ItemClassificationContext';
import { supabase } from '@/integrations/supabase/client';
import { analysePolygonSelection } from '@/lib/spatialPhasingService';
import { v4 as uuidv4 } from 'uuid';
import { Json } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { Scissors } from 'lucide-react';

interface CategoryAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  polygon: [number, number][] | null;
}

const PRESET_COLORS = [
  '#3B82F6', '#EF4444', '#22C55E', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316',
];

export function CategoryAssignmentDialog({
  open,
  onOpenChange,
  polygon,
}: CategoryAssignmentDialogProps) {
  const { categories, createCategory, refreshCategories } = useCategoryFilter();
  const { allProducts, updateProduct, removeProduct, project } = useProject();
  const itemClassification = useItemClassification();

  // In focus mode: analyse ALL segments of the same product definition
  // (not just the original item — prior splits create new IDs for outside segments)
  const focusItemId = itemClassification.state.activeItemId;
  const focusProductDefId = focusItemId
    ? allProducts.find(p => p.id === focusItemId)?.productDefinitionId
    : undefined;
  const productsToAnalyse = focusItemId && focusProductDefId
    ? allProducts.filter(p => p.productDefinitionId === focusProductDefId)
    : allProducts;

  // Build set of IDs that exist in project_items table (DB items)
  // Manual JSONB items are in project.products
  const manualProductIds = new Set((project?.products || []).map(p => p.id));

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(PRESET_COLORS[0]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');

  const handleAssignAndSlice = async () => {
    if (!polygon || !project) return;

    let categoryId = selectedCategoryId;

    // Create new category if needed
    if (mode === 'new' && newCategoryName.trim()) {
      const id = await createCategory(newCategoryName.trim(), newCategoryColor);
      if (!id) {
        toast.error('Kategorian luonti epäonnistui');
        return;
      }
      categoryId = id;
    }

    if (!categoryId) {
      toast.error('Valitse tai luo kategoria');
      return;
    }

    setIsProcessing(true);

    try {
      // Run spatial analysis — in focus mode, only analyse the active item
      const result = analysePolygonSelection(polygon, productsToAnalyse);

      const totalAffected =
        result.insideItems.length +
        result.newInsideSegments.length;

      console.log(`[CategoryAssign${focusItemId ? ' FOCUS' : ''}] insideItems: ${result.insideItems.length}, newInside: ${result.newInsideSegments.length}, updatedOutside: ${result.updatedOutsideSegments.length}, newOutside: ${result.newOutsideSegments.length}`);

      if (totalAffected === 0) {
        toast.info(focusItemId ? 'Valittu toimenpide ei osu tähän alueeseen' : 'Ei kohteita valitulla alueella');
        setIsProcessing(false);
        onOpenChange(false);
        return;
      }

      // Collect all item IDs that will be touched so we can do post-merge
      const touchedOriginalIds = new Set<string>([
        ...result.insideItems,
        ...result.updatedOutsideSegments.map((s) => s.id),
      ]);

      // 1. Update fully-inside items: set category_id
      for (const itemId of result.insideItems) {
        if (manualProductIds.has(itemId)) {
          const original = allProducts.find((p) => p.id === itemId);
          if (!original) continue;
          await supabase.from('project_items').insert({
            id: original.id,
            project_id: project.id,
            catalog_item_id: original.productDefinitionId,
            geometry: original.geometry as unknown as Json,
            user_parameters: original.parameters as unknown as Json,
            notes: original.notes || null,
            photos: (original.photos as unknown as Json) || null,
            visible: original.visible,
            locked: original.locked,
            source: 'manual',
            category_id: categoryId,
            offset_m: original.offsetM ?? null,
          });
          removeProduct(itemId);
        } else {
          await supabase
            .from('project_items')
            .update({ category_id: categoryId })
            .eq('id', itemId);
        }
      }

      // 2. Update original records with outside geometry
      for (const seg of result.updatedOutsideSegments) {
        if (manualProductIds.has(seg.id)) {
          const original = allProducts.find((p) => p.id === seg.id);
          if (!original) continue;
          await supabase.from('project_items').insert({
            id: original.id,
            project_id: project.id,
            catalog_item_id: original.productDefinitionId,
            geometry: seg.geometry as unknown as Json,
            user_parameters: original.parameters as unknown as Json,
            notes: original.notes || null,
            photos: (original.photos as unknown as Json) || null,
            visible: original.visible,
            locked: original.locked,
            source: 'manual',
            category_id: null,
            offset_m: original.offsetM ?? null,
          });
          removeProduct(seg.id);
        } else {
          await supabase
            .from('project_items')
            .update({ geometry: seg.geometry as unknown as Json })
            .eq('id', seg.id);
        }
      }

      // 3. Create new records for inside portions of split lines
      const newInsideIds: string[] = [];
      for (const seg of result.newInsideSegments) {
        const original = allProducts.find((p) => p.id === seg.originalId);
        if (!original) continue;
        const newId = uuidv4();
        newInsideIds.push(newId);
        await supabase.from('project_items').insert({
          id: newId,
          project_id: project.id,
          catalog_item_id: original.productDefinitionId,
          geometry: seg.geometry as unknown as Json,
          user_parameters: original.parameters as unknown as Json,
          notes: original.notes || null,
          photos: (original.photos as unknown as Json) || null,
          visible: original.visible,
          locked: original.locked,
          source: 'spatial_split',
          category_id: categoryId,
          offset_m: original.offsetM ?? null,
        });
      }

      // 4. Create new records for additional outside portions (uncategorized)
      const newOutsideIds: string[] = [];
      for (const seg of result.newOutsideSegments) {
        const original = allProducts.find((p) => p.id === seg.originalId);
        if (!original) continue;
        const newId = uuidv4();
        newOutsideIds.push(newId);
        await supabase.from('project_items').insert({
          id: newId,
          project_id: project.id,
          catalog_item_id: original.productDefinitionId,
          geometry: seg.geometry as unknown as Json,
          user_parameters: original.parameters as unknown as Json,
          notes: original.notes || null,
          photos: (original.photos as unknown as Json) || null,
          visible: original.visible,
          locked: original.locked,
          source: 'spatial_split',
          category_id: null,
          offset_m: original.offsetM ?? null,
        });
      }

      // 5. Post-split merge: merge any adjacent uncategorized segments that were
      //    created as outside parts — avoids leaving fragmented uncategorized stubs
      //    adjacent to each other. Re-fetch current state first.
      if (newOutsideIds.length > 0 || result.updatedOutsideSegments.length > 0) {
        const { data: freshItems } = await supabase
          .from('project_items')
          .select('*')
          .eq('project_id', project.id);

        if (freshItems) {
          const { mergeAdjacentSegments } = await import('@/lib/spatialPhasingService');
          const asPi = freshItems.map((row) => ({
            id: row.id,
            productDefinitionId: row.catalog_item_id,
            geometry: row.geometry as any,
            parameters: (row.user_parameters as Record<string, number>) || {},
            photos: Array.isArray(row.photos) ? (row.photos as any[]) : [],
            notes: row.notes || '',
            visible: row.visible ?? true,
            locked: row.locked ?? false,
            categoryId: (row as any).category_id ?? null,
            offsetM: row.offset_m != null ? Number(row.offset_m) : undefined,
          }));

          // Try merging each uncategorized outside segment with its neighbours
          const mergedAway = new Set<string>();
          const outsideCandidates = [
            ...result.updatedOutsideSegments.map((s) => s.id),
            ...newOutsideIds,
          ];
          for (const oid of outsideCandidates) {
            if (mergedAway.has(oid)) continue;
            const mergeResult = mergeAdjacentSegments(asPi, oid);
            if (!mergeResult) continue;
            // Only merge uncategorized neighbours that touch this segment
            await supabase
              .from('project_items')
              .update({ geometry: mergeResult.mergedGeometry as any })
              .eq('id', oid);
            for (const mid of mergeResult.mergedIds) {
              mergedAway.add(mid);
              await supabase.from('project_items').delete().eq('id', mid);
            }
            // Update in-memory for subsequent iterations
            const idx = asPi.findIndex((i) => i.id === oid);
            if (idx >= 0) asPi[idx] = { ...asPi[idx], geometry: mergeResult.mergedGeometry };
            for (const mid of mergeResult.mergedIds) {
              const mIdx = asPi.findIndex((i) => i.id === mid);
              if (mIdx >= 0) asPi.splice(mIdx, 1);
            }
          }
        }
      }

      // Refresh data so new segments appear (use project-items-refresh, NOT
      // mass-calc-complete, to avoid triggering the bearing-capacity navigation)
      window.dispatchEvent(new Event('project-items-refresh'));
      await refreshCategories();

      toast.success(
        focusItemId
          ? `Toimenpide rajattu ja liitetty kategoriaan`
          : `${totalAffected} kohdetta liitetty kategoriaan`
      );
      onOpenChange(false);

      // In focus mode: stay in focus mode and re-activate polygon drawing
      // so user can immediately classify another area. ESC is the only exit.
      if (focusItemId) {
        window.dispatchEvent(
          new CustomEvent('drawing-mode-change', { detail: { mode: 'polygon' } })
        );
      }
    } catch (err) {
      console.error('Spatial phasing failed:', err);
      toast.error('Alueen käsittely epäonnistui');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setSelectedCategoryId('');
    setNewCategoryName('');
    setNewCategoryColor(PRESET_COLORS[0]);
    setMode('existing');
    // Exit focus mode on cancel too
    if (focusItemId) {
      itemClassification.stopClassification();
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {focusItemId ? (
              <span className="flex items-center gap-2">
                <Scissors className="w-4 h-4" />
                Rajaa & luokittele toimenpide
              </span>
            ) : 'Liitä alue kategoriaan'}
          </DialogTitle>
          <DialogDescription>
            {focusItemId
              ? 'Piirrättysi alue rajaa valitun toimenpiteen. Muut toimenpiteet pysyvät ennallaan.'
              : 'Valitse olemassa oleva kategoria tai luo uusi. Alueen sisällä olevat kohteet liitetään kategoriaan ja viivamaiset kohteet leikataan automaattisesti rajoilla.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {categories.length > 0 && (
            <div className="space-y-2">
              <Label>Valitse kategoria</Label>
              <Select
                value={mode === 'existing' ? selectedCategoryId : ''}
                onValueChange={(v) => {
                  setSelectedCategoryId(v);
                  setMode('existing');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Valitse..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full inline-block"
                          style={{ background: cat.color }}
                        />
                        {cat.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="relative">
            {categories.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground my-2">
                <div className="flex-1 border-t" />
                <span>tai</span>
                <div className="flex-1 border-t" />
              </div>
            )}
            <Label>Uusi kategoria</Label>
            <div className="flex gap-2 mt-1">
              <Input
                placeholder='esim. "Rakentaminen 2026"'
                value={newCategoryName}
                onChange={(e) => {
                  setNewCategoryName(e.target.value);
                  if (e.target.value) setMode('new');
                }}
              />
              <div className="flex gap-1">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    className="w-7 h-7 rounded-full border-2 shrink-0 transition-transform"
                    style={{
                      background: color,
                      borderColor:
                        newCategoryColor === color ? 'hsl(var(--foreground))' : 'transparent',
                      transform: newCategoryColor === color ? 'scale(1.15)' : 'scale(1)',
                    }}
                    onClick={() => setNewCategoryColor(color)}
                    type="button"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isProcessing}>
            Peruuta
          </Button>
          <Button onClick={handleAssignAndSlice} disabled={isProcessing}>
            {isProcessing ? 'Käsitellään...' : 'Liitä & Leikkaa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
