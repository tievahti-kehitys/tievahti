import React, { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useCategoryFilter } from '@/context/CategoryFilterContext';
import { Filter, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useRole } from '@/context/RoleContext';

export function CategoryFilterDropdown() {
  const { filter, setFilter, categories, deleteCategoryWithMerge } = useCategoryFilter();
  const { canEdit } = useRole();
  const [deletingCat, setDeletingCat] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (categories.length === 0) return null;

  const handleDelete = async () => {
    if (!deletingCat) return;
    setIsDeleting(true);
    try {
      await deleteCategoryWithMerge(deletingCat.id);
      toast.success(`Kategoria "${deletingCat.name}" poistettu ja segmentit yhdistetty`);
    } catch (err) {
      console.error('Category delete failed:', err);
      toast.error('Kategorian poisto epäonnistui');
    } finally {
      setIsDeleting(false);
      setDeletingCat(null);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-7 text-xs w-[160px]">
            <SelectValue placeholder="Kaikki kohteet" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Kaikki kohteet</SelectItem>
            <SelectItem value="uncategorized">Luokittelemattomat</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                <span className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ background: cat.color }}
                  />
                  {cat.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Show delete button only for editors/admins when a specific category is selected */}
        {canEdit() && filter !== 'all' && filter !== 'uncategorized' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => {
              const cat = categories.find((c) => c.id === filter);
              if (cat) setDeletingCat({ id: cat.id, name: cat.name });
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      <AlertDialog open={!!deletingCat} onOpenChange={(open) => !open && setDeletingCat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Poista kategoria "{deletingCat?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Kategorian kohteet palautetaan luokittelemattomiksi ja vierekkäiset
              segmentit yhdistetään automaattisesti takaisin yhteen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Peruuta</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Poistetaan...' : 'Poista & Yhdistä'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
