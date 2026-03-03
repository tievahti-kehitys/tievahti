 import React, { useState, useRef } from 'react';
 import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Plus, Trash2, ImageIcon } from 'lucide-react';
 import { cn } from '@/lib/utils';
 import { Button } from '@/components/ui/button';
 
 export interface GalleryImage {
   id: string;
   url: string;
   description?: string;
   isDefault?: boolean;
 }
 
 interface ImageGalleryProps {
   images: GalleryImage[];
   onAddImages?: (files: File[]) => void;
   onRemoveImage?: (id: string) => void;
   uploading?: boolean;
   editable?: boolean;
   className?: string;
 }
 
 export function ImageGallery({
   images,
   onAddImages,
   onRemoveImage,
   uploading = false,
   editable = true,
   className,
 }: ImageGalleryProps) {
   const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
   const [zoom, setZoom] = useState(1);
   const fileInputRef = useRef<HTMLInputElement>(null);
 
   const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
     const files = e.target.files;
     if (files && files.length > 0 && onAddImages) {
       onAddImages(Array.from(files));
     }
     // Reset input
     if (fileInputRef.current) {
       fileInputRef.current.value = '';
     }
   };
 
   const openLightbox = (index: number) => {
     setLightboxIndex(index);
     setZoom(1);
   };
 
   const closeLightbox = () => {
     setLightboxIndex(null);
     setZoom(1);
   };
 
   const goToPrevious = () => {
     if (lightboxIndex === null) return;
     setLightboxIndex(lightboxIndex > 0 ? lightboxIndex - 1 : images.length - 1);
     setZoom(1);
   };
 
   const goToNext = () => {
     if (lightboxIndex === null) return;
     setLightboxIndex(lightboxIndex < images.length - 1 ? lightboxIndex + 1 : 0);
     setZoom(1);
   };
 
   const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.5, 4));
   const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.5, 0.5));
 
   // Separate default images and user photos
   const defaultImages = images.filter(img => img.isDefault);
   const userPhotos = images.filter(img => !img.isDefault);
 
   return (
     <div className={cn('space-y-3', className)}>
       {/* Default images section */}
       {defaultImages.length > 0 && (
         <div>
           <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1">
             <ImageIcon className="w-3 h-3" />
             Ohjekuvat
           </div>
           <div className="flex flex-wrap gap-2">
             {defaultImages.map((img, index) => {
               const globalIndex = images.indexOf(img);
               return (
                 <div
                   key={img.id}
                   className="relative group cursor-pointer"
                   onClick={() => openLightbox(globalIndex)}
                 >
                   <img
                     src={img.url}
                     alt={img.description || 'Ohjekuva'}
                     className="w-16 h-16 object-cover rounded-md border-2 border-primary/30 hover:border-primary transition-colors"
                   />
                   <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-md flex items-center justify-center">
                     <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                   </div>
                 </div>
               );
             })}
           </div>
         </div>
       )}
 
       {/* User photos section */}
       <div>
         {defaultImages.length > 0 && (
           <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
             Omat kuvat
           </div>
         )}
         <div className="flex flex-wrap gap-2">
           {userPhotos.map((img) => {
             const globalIndex = images.indexOf(img);
             return (
               <div
                 key={img.id}
                 className="relative group cursor-pointer"
                 onClick={() => openLightbox(globalIndex)}
               >
                 <img
                   src={img.url}
                   alt={img.description || 'Kuva'}
                   className="w-16 h-16 object-cover rounded-md border border-border hover:border-foreground/50 transition-colors"
                 />
                 <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-md flex items-center justify-center">
                   <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                 </div>
                 {editable && onRemoveImage && (
                   <button
                     onClick={(e) => {
                       e.stopPropagation();
                       onRemoveImage(img.id);
                     }}
                     className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                   >
                     <X className="w-3 h-3" />
                   </button>
                 )}
               </div>
             );
           })}
 
           {/* Add button */}
           {editable && onAddImages && (
             <button
               onClick={() => fileInputRef.current?.click()}
               disabled={uploading}
               className="w-16 h-16 border-2 border-dashed border-border hover:border-primary rounded-md flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
             >
               {uploading ? (
                 <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
               ) : (
                 <>
                   <Plus className="w-4 h-4" />
                   <span className="text-[9px]">Lisää</span>
                 </>
               )}
             </button>
           )}
         </div>
 
         <input
           ref={fileInputRef}
           type="file"
           accept="image/*"
           multiple
           onChange={handleFileSelect}
           className="hidden"
         />
       </div>
 
       {/* Lightbox */}
       {lightboxIndex !== null && images[lightboxIndex] && (
         <div 
           className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
           onClick={closeLightbox}
         >
           {/* Close button */}
           <button
             onClick={closeLightbox}
             className="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
           >
             <X className="w-6 h-6" />
           </button>
 
           {/* Navigation arrows */}
           {images.length > 1 && (
             <>
               <button
                 onClick={(e) => { e.stopPropagation(); goToPrevious(); }}
                 className="absolute left-4 top-1/2 -translate-y-1/2 p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
               >
                 <ChevronLeft className="w-6 h-6" />
               </button>
               <button
                 onClick={(e) => { e.stopPropagation(); goToNext(); }}
                 className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors z-10"
               >
                 <ChevronRight className="w-6 h-6" />
               </button>
             </>
           )}
 
           {/* Zoom controls */}
           <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
             <button
               onClick={(e) => { e.stopPropagation(); handleZoomOut(); }}
               className="p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
             >
               <ZoomOut className="w-5 h-5" />
             </button>
             <span className="px-3 py-2 text-white/80 text-sm bg-white/10 rounded-full">
               {Math.round(zoom * 100)}%
             </span>
             <button
               onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}
               className="p-2 text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-colors"
             >
               <ZoomIn className="w-5 h-5" />
             </button>
           </div>
 
           {/* Image counter */}
           <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-white/10 px-3 py-1.5 rounded-full">
             {lightboxIndex + 1} / {images.length}
             {images[lightboxIndex].isDefault && (
               <span className="ml-2 text-primary text-xs">(Ohjekuva)</span>
             )}
           </div>
 
           {/* Main image */}
           <div 
             className="max-w-[90vw] max-h-[85vh] overflow-auto"
             onClick={(e) => e.stopPropagation()}
           >
             <img
               src={images[lightboxIndex].url}
               alt={images[lightboxIndex].description || 'Kuva'}
               style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
               className="max-w-full max-h-[85vh] object-contain transition-transform duration-200"
             />
           </div>
 
           {/* Description */}
           {images[lightboxIndex].description && (
             <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-white/90 text-sm bg-black/50 px-4 py-2 rounded-lg max-w-md text-center">
               {images[lightboxIndex].description}
             </div>
           )}
         </div>
       )}
     </div>
   );
 }