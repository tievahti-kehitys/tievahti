// Marker images for products
import huomiomerkki from './huomiomerkki.png';
import huomiototsa from './huomiototsa.png';
import kaantopaikka from './kaantopaikka.png';
import kaivuri from './kaivuri.png';
import kuormaAuto from './kuorma-auto.png';
import laskuojankaivuu from './laskuojankaivuu.png';
import liittyma from './liittyma.png';
import maakivi from './maakivi.png';
import markerAihio from './marker-aihio.png';
import markerHuomiomerkkiPunainen from './marker-huomiomerkki-punainen.png';
import markerKaide from './marker-kaide.png';
import markerLevennys from './marker-levennys.png';
import markerLiikennemerkki from './marker-liikennemerkki.png';
import markerLouhinta from './marker-louhinta.png';
import osakasrumpu from './osakasrumpu.png';
import puupino from './puupino.png';
import puupino2 from './puupino2.png';
import puusto from './puusto.png';
import rumpuBetoni from './rumpu-betoni.png';
import rumpuMuovi from './rumpu-muovi.png';
import rumpuTeras from './rumpu-teras.png';
import rumpuUusi from './rumpu-uusi.png';
import rumpuputki from './rumpuputki.png';
import silta from './silta.png';
import sora from './sora.png';
import sumupaalu from './sumupaalu.png';

// Map of marker keys to their image paths (for database reference)
export const markerImages: Record<string, string> = {
  huomiomerkki,
  huomiototsa,
  kaantopaikka,
  kaivuri,
  kuormaAuto,
  laskuojankaivuu,
  liittyma,
  maakivi,
  markerAihio,
  markerHuomiomerkkiPunainen,
  markerKaide,
  markerLevennys,
  markerLiikennemerkki,
  markerLouhinta,
  osakasrumpu,
  puupino,
  puupino2,
  puusto,
  rumpuBetoni,
  rumpuMuovi,
  rumpuTeras,
  rumpuUusi,
  rumpuputki,
  silta,
  sora,
  sumupaalu,
};

// Stable builtin marker references for database storage
export const BUILTIN_MARKERS: Record<string, string> = {
  'builtin:huomiomerkki': huomiomerkki,
  'builtin:huomiototsa': huomiototsa,
  'builtin:kaantopaikka': kaantopaikka,
  'builtin:kaivuri': kaivuri,
  'builtin:kuorma-auto': kuormaAuto,
  'builtin:laskuojankaivuu': laskuojankaivuu,
  'builtin:liittyma': liittyma,
  'builtin:maakivi': maakivi,
  'builtin:marker-aihio': markerAihio,
  'builtin:marker-huomiomerkki-punainen': markerHuomiomerkkiPunainen,
  'builtin:marker-kaide': markerKaide,
  'builtin:marker-levennys': markerLevennys,
  'builtin:marker-liikennemerkki': markerLiikennemerkki,
  'builtin:marker-louhinta': markerLouhinta,
  'builtin:osakasrumpu': osakasrumpu,
  'builtin:puupino': puupino,
  'builtin:puupino2': puupino2,
  'builtin:puusto': puusto,
  'builtin:rumpu-betoni': rumpuBetoni,
  'builtin:rumpu-muovi': rumpuMuovi,
  'builtin:rumpu-teras': rumpuTeras,
  'builtin:rumpu-uusi': rumpuUusi,
  'builtin:rumpuputki': rumpuputki,
  'builtin:silta': silta,
  'builtin:sora': sora,
  'builtin:sumupaalu': sumupaalu,
};

export type BuiltinMarkerKey = keyof typeof BUILTIN_MARKERS;

// Helper to resolve marker image from database value
export function resolveMarkerImage(markerValue: string | null | undefined): string | null {
  if (!markerValue) return null;
  
  // Check if it's a builtin marker reference
  if (markerValue.startsWith('builtin:')) {
    return BUILTIN_MARKERS[markerValue as BuiltinMarkerKey] || null;
  }
  
  // Otherwise assume it's a direct URL
  return markerValue;
}

// Export individual markers for direct import
export {
  huomiomerkki,
  huomiototsa,
  kaantopaikka,
  kaivuri,
  kuormaAuto,
  laskuojankaivuu,
  liittyma,
  maakivi,
  markerAihio,
  markerHuomiomerkkiPunainen,
  markerKaide,
  markerLevennys,
  markerLiikennemerkki,
  markerLouhinta,
  osakasrumpu,
  puupino,
  puupino2,
  puusto,
  rumpuBetoni,
  rumpuMuovi,
  rumpuTeras,
  rumpuUusi,
  rumpuputki,
  silta,
  sora,
  sumupaalu,
};
