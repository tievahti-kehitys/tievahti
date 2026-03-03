import React, { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CatalogItem, CatalogParameter } from '@/context/CatalogContext';
import { CatalogItemIcon } from '@/components/catalog/CatalogItemIcon';
import { generateParameterOptions } from '@/lib/parameterOptions';

interface ProductParameterFormProps {
  item: CatalogItem;
  initialParameters?: Record<string, number>;
  onSave: (parameters: Record<string, number>) => void;
  onBack: () => void;
}

export function ProductParameterForm({
  item,
  initialParameters,
  onSave,
  onBack,
}: ProductParameterFormProps) {
  const [parameters, setParameters] = useState<Record<string, number>>({});

  useEffect(() => {
    const params: Record<string, number> = {};
    item.defaultParameters.forEach(p => {
      params[p.slug] = initialParameters?.[p.slug] ?? p.default;
    });
    setParameters(params);
  }, [item, initialParameters]);

  // Pre-compute options for each parameter
  const paramOptions = useMemo(() => {
    const map: Record<string, number[] | null> = {};
    item.defaultParameters.forEach(p => {
      map[p.slug] = generateParameterOptions(p);
    });
    return map;
  }, [item.defaultParameters]);

  const handleParameterChange = (slug: string, value: string) => {
    const numValue = parseFloat(value.replace(',', '.'));
    if (!isNaN(numValue)) {
      setParameters(prev => ({ ...prev, [slug]: numValue }));
    }
  };

  const handleSave = () => {
    onSave(parameters);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-border bg-muted/30">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-lg hover:bg-muted active:bg-muted/80 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <CatalogItemIcon item={item} size="md" />
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-foreground truncate">{item.name}</h3>
          <p className="text-sm text-muted-foreground">{item.unit}</p>
        </div>
      </div>

      {/* Parameters */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {item.defaultParameters.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            Ei muokattavia parametreja
          </div>
        ) : (
          item.defaultParameters.map((param: CatalogParameter) => {
            const options = paramOptions[param.slug];

            return (
              <div key={param.slug} className="space-y-2">
                <Label htmlFor={param.slug} className="text-base font-semibold">
                  {param.label}
                  {param.unit && (
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      ({param.unit})
                    </span>
                  )}
                </Label>

                {options ? (
                  <Select
                    value={String(parameters[param.slug] ?? param.default)}
                    onValueChange={(val) => handleParameterChange(param.slug, val)}
                  >
                    <SelectTrigger className="h-14 text-lg bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-[9999] max-h-60">
                      {options.map((opt) => (
                        <SelectItem key={opt} value={String(opt)} className="text-lg py-3">
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={param.slug}
                    type="number"
                    inputMode="decimal"
                    value={parameters[param.slug] ?? ''}
                    onChange={(e) => handleParameterChange(param.slug, e.target.value)}
                    min={param.min}
                    max={param.max}
                    step={param.step ?? 0.1}
                    className="h-14 text-lg"
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Save button */}
      <div className="p-4 border-t border-border bg-card safe-area-pb">
        <Button
          variant="success"
          size="lg"
          onClick={handleSave}
          className="w-full h-14 text-lg font-bold gap-2"
        >
          <Save className="w-5 h-5" />
          Tallenna
        </Button>
      </div>
    </div>
  );
}
