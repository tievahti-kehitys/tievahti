/**
 * KUAB FWD file parser
 * Parses bearing capacity measurement data from .fwd/.txt files
 */

export interface FWDMeasurementPoint {
  station: number;        // Paalu (m)
  measuredValue: number;  // Kantavuus (MN/m2) - Emod column
  latitude: number;       // Decimal degrees
  longitude: number;      // Decimal degrees
}

/**
 * Convert NMEA latitude (DDMM.MMMM) to decimal degrees
 */
function nmeaLatToDecimal(raw: string): number {
  const degrees = parseInt(raw.substring(0, 2), 10);
  const minutes = parseFloat(raw.substring(2));
  return degrees + minutes / 60;
}

/**
 * Convert NMEA longitude (DDDMM.MMMM) to decimal degrees
 */
function nmeaLonToDecimal(raw: string): number {
  const degrees = parseInt(raw.substring(0, 3), 10);
  const minutes = parseFloat(raw.substring(3));
  return degrees + minutes / 60;
}

/**
 * Parse a KUAB FWD file content into measurement points
 * 
 * Rules:
 * - Only process lines starting with 'D'
 * - Column mapping (whitespace separated):
 *   - Index 0: Station (Paalu)
 *   - Index 12: Measured Value (Emod / Kantavuus)
 *   - Index 13: Latitude (NMEA DDMM.MMMM)
 *   - Index 14: Longitude (NMEA DDDMM.MMMM)
 */
/**
 * Extract the branch name from the KUAB FWD file header.
 * Looks for a line like: IKUAB FWD FILE    : Haara 2.fwd
 * Returns the filename without extension, e.g. "Haara 2"
 */
export function extractBranchName(content: string): string | null {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^IKUAB\s+FWD\s+FILE\s*:\s*(.+)/i);
    if (match) {
      const raw = match[1].trim();
      // Remove file extension
      return raw.replace(/\.(fwd|txt)$/i, '').trim() || null;
    }
  }
  return null;
}

export function parseFWDFile(content: string): FWDMeasurementPoint[] {
  const lines = content.split(/\r?\n/);
  const points: FWDMeasurementPoint[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('D')) continue;

    // Remove the leading 'D' and split by whitespace
    const rest = trimmed.substring(1).trim();
    const columns = rest.split(/\s+/);

    // We need at least 15 columns (indices 0-14)
    if (columns.length < 15) continue;

    const station = parseFloat(columns[0]);
    const measuredValue = parseFloat(columns[12]);
    const rawLat = columns[13];
    const rawLon = columns[14];

    if (isNaN(station) || isNaN(measuredValue)) continue;
    if (!rawLat || !rawLon) continue;

    const latitude = nmeaLatToDecimal(rawLat);
    const longitude = nmeaLonToDecimal(rawLon);

    if (isNaN(latitude) || isNaN(longitude)) continue;

    points.push({
      station,
      measuredValue,
      latitude,
      longitude,
    });
  }

  return points;
}
