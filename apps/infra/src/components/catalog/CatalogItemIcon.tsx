import React from 'react';
import { Circle, Square, Triangle, Layers } from 'lucide-react';
import { CatalogItem } from '@/types/catalog';
import { resolveMarkerImage } from '@/assets/markers';
import { cn } from '@/lib/utils';

type IconSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CONFIG: Record<IconSize, { container: string; icon: number; img: string }> = {
  xs: { container: 'w-4 h-4', icon: 12, img: 'w-4 h-4' },
  sm: { container: 'w-5 h-5', icon: 14, img: 'w-5 h-5' },
  md: { container: 'w-6 h-6', icon: 16, img: 'w-6 h-6' },
  lg: { container: 'w-8 h-8', icon: 20, img: 'w-8 h-8' },
};

interface CatalogItemIconProps {
  item: CatalogItem;
  customImage?: string | null;
  colorOverride?: string;
  size?: IconSize;
  className?: string;
}

/**
 * Renders the appropriate icon for a catalog item.
 * Handles: custom images, builtin markers, shape icons, and operation icons.
 */
export function CatalogItemIcon({
  item,
  customImage,
  colorOverride,
  size = 'md',
  className,
}: CatalogItemIconProps) {
  const cfg = SIZE_CONFIG[size];
  const color = colorOverride || item.markerStyle?.color || '#22C3F3';
  
  // Check for custom image (instance override or from marker style)
  const rawImage = customImage || item.markerStyle?.image;
  const resolvedImage = resolveMarkerImage(rawImage);

  // If it's an operation with no image, show layers icon
  if (item.type === 'operation' && !resolvedImage) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded flex-shrink-0',
          cfg.container,
          className
        )}
        style={{ backgroundColor: color }}
      >
        <Layers className="text-white" style={{ width: cfg.icon, height: cfg.icon }} />
      </div>
    );
  }

  // If there's an image (builtin or custom), show it
  if (resolvedImage) {
    return (
      <img
        src={resolvedImage}
        alt=""
        className={cn('object-contain flex-shrink-0', cfg.img, className)}
      />
    );
  }

  // Shape-based icons
  const shape = item.markerStyle?.shape || 'circle';
  const iconStyle = { color };

  if (shape === 'square') {
    return (
      <Square
        className={cn('flex-shrink-0', className)}
        style={iconStyle}
        size={cfg.icon + 4}
        fill={color}
      />
    );
  }

  if (shape === 'triangle') {
    return (
      <Triangle
        className={cn('flex-shrink-0', className)}
        style={iconStyle}
        size={cfg.icon + 4}
        fill={color}
      />
    );
  }

  // Default: circle
  return (
    <Circle
      className={cn('flex-shrink-0', className)}
      style={iconStyle}
      size={cfg.icon + 4}
      fill={color}
    />
  );
}
