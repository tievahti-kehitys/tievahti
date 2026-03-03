 import { useState, useCallback } from 'react';
 import { supabase } from '@/integrations/supabase/client';
 import { v4 as uuidv4 } from 'uuid';
 
 export interface ProductImage {
   id: string;
   url: string;
   description?: string;
   isDefault?: boolean; // true = from catalog, false = user uploaded
   createdAt: Date;
 }
 
 export function useProductImages() {
   const [uploading, setUploading] = useState(false);
 
   const uploadImages = useCallback(async (files: File[]): Promise<ProductImage[]> => {
     setUploading(true);
     const uploadedImages: ProductImage[] = [];
 
     try {
       for (const file of files) {
         const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
         const fileName = `${uuidv4()}.${fileExt}`;
         const filePath = `product-photos/${fileName}`;
 
         const { error: uploadError } = await supabase.storage
           .from('product-images')
           .upload(filePath, file, {
             cacheControl: '3600',
             upsert: false,
           });
 
         if (uploadError) {
           console.error('Upload error:', uploadError);
           continue;
         }
 
         const { data: { publicUrl } } = supabase.storage
           .from('product-images')
           .getPublicUrl(filePath);
 
         uploadedImages.push({
           id: uuidv4(),
           url: publicUrl,
           isDefault: false,
           createdAt: new Date(),
         });
       }
     } finally {
       setUploading(false);
     }
 
     return uploadedImages;
   }, []);
 
   const uploadCatalogImages = useCallback(async (files: File[]): Promise<ProductImage[]> => {
     setUploading(true);
     const uploadedImages: ProductImage[] = [];
 
     try {
       for (const file of files) {
         const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
         const fileName = `${uuidv4()}.${fileExt}`;
         const filePath = `catalog-defaults/${fileName}`;
 
         const { error: uploadError } = await supabase.storage
           .from('product-images')
           .upload(filePath, file, {
             cacheControl: '3600',
             upsert: false,
           });
 
         if (uploadError) {
           console.error('Upload error:', uploadError);
           continue;
         }
 
         const { data: { publicUrl } } = supabase.storage
           .from('product-images')
           .getPublicUrl(filePath);
 
         uploadedImages.push({
           id: uuidv4(),
           url: publicUrl,
           isDefault: true,
           createdAt: new Date(),
         });
       }
     } finally {
       setUploading(false);
     }
 
     return uploadedImages;
   }, []);
 
   const deleteImage = useCallback(async (url: string): Promise<boolean> => {
     try {
       // Extract path from URL
       const urlParts = url.split('/product-images/');
       if (urlParts.length < 2) return false;
       
       const filePath = urlParts[1];
       
       const { error } = await supabase.storage
         .from('product-images')
         .remove([filePath]);
 
       return !error;
     } catch (e) {
       console.error('Delete error:', e);
       return false;
     }
   }, []);
 
   return {
     uploading,
     uploadImages,
     uploadCatalogImages,
     deleteImage,
   };
 }