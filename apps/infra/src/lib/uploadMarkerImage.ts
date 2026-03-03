import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * Upload a marker image to Supabase storage and return the public URL
 */
export async function uploadMarkerImage(file: File): Promise<string | null> {
  try {
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
    const fileName = `${uuidv4()}.${fileExt}`;
    const filePath = `markers/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('marker-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('Error uploading marker image:', uploadError);
      return null;
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('marker-images')
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (err) {
    console.error('Error in uploadMarkerImage:', err);
    return null;
  }
}

/**
 * Delete a marker image from Supabase storage
 */
export async function deleteMarkerImage(url: string): Promise<boolean> {
  try {
    // Extract path from URL
    const match = url.match(/marker-images\/(.+)$/);
    if (!match) return false;
    
    const filePath = match[1];
    
    const { error } = await supabase.storage
      .from('marker-images')
      .remove([filePath]);

    if (error) {
      console.error('Error deleting marker image:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error in deleteMarkerImage:', err);
    return false;
  }
}
