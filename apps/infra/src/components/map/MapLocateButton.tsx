import React from 'react';
import { Locate } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MapLocateButtonProps {
  onClick: () => void;
  loading?: boolean;
  hasPosition?: boolean;
  className?: string;
}

export function MapLocateButton({
  onClick,
  loading = false,
  hasPosition = false,
  className,
}: MapLocateButtonProps) {
  return (
    <Button
      variant="secondary"
      size="icon"
      onClick={onClick}
      className={cn(
        'shadow-lg w-11 h-11 md:w-10 md:h-10',
        hasPosition && 'ring-2 ring-primary',
        className,
      )}
      title="Näytä sijaintini"
    >
      <Locate
        className={cn(
          'w-5 h-5',
          loading && 'animate-spin',
          hasPosition && 'text-primary',
        )}
      />
    </Button>
  );
}
