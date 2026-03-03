import React from 'react';
import { Circle, Square, Triangle } from 'lucide-react';

import { cn } from '@/lib/utils';
import { ProductDefinition } from '@/types/project';
import { resolveMarkerImage } from '@/assets/markers';
type MarkerIconSize = 'sm' | 'md' | 'lg';

const SIZE: Record<MarkerIconSize, { img: string; icon: number; swatchW: string; swatchH: string }> = {
  sm: { img: 'w-4 h-4', icon: 16, swatchW: 'w-6', swatchH: 'h-2' },
  md: { img: 'w-6 h-6', icon: 20, swatchW: 'w-8', swatchH: 'h-2.5' },
  lg: { img: 'w-8 h-8', icon: 26, swatchW: 'w-10', swatchH: 'h-3' },
};

export function ProductMarkerIcon({
  product,
  size = 'md',
  className,
}: {
  product: ProductDefinition;
  size?: MarkerIconSize;
  className?: string;
}) {
  const isLocal = product.measureType === 2;
  const cfg = SIZE[size];

  if (!isLocal) {
    return (
      <div
        className={cn('rounded flex-shrink-0', cfg.swatchW, cfg.swatchH, className)}
        style={{
          backgroundColor: product.color,
          opacity: product.lineStyle?.opacity ?? 1,
        }}
      />
    );
  }

  // Resolve marker image (handles builtin: prefix)
  const markerImage = resolveMarkerImage(product.customMarkerImage);
  
  if (markerImage) {
    return (
      <img
        src={markerImage}
        alt=""
        className={cn('object-contain flex-shrink-0', cfg.img, className)}
      />
    );
  }

  const base = cfg.icon;
  const iconSize = product.markerSize ? Math.min(Math.max(product.markerSize, base), base + 10) : base;

  const iconProps = {
    className: cn('flex-shrink-0', className),
    style: { color: product.color },
    size: iconSize,
  } as const;

  switch (product.defaultIcon) {
    case 'square':
      return <Square {...iconProps} fill={product.color} />;
    case 'triangle':
      return <Triangle {...iconProps} fill={product.color} />;
    case 'circle':
    default:
      return <Circle {...iconProps} fill={product.color} />;
  }
}
