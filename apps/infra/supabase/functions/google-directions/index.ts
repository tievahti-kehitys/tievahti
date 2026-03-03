import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Decode a Google encoded polyline string into an array of [lat, lng] coordinates.
 */
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { startLat, startLng, endLat, endLng, waypoints } = body;

    if (startLat == null || startLng == null || endLat == null || endLng == null) {
      return new Response(JSON.stringify({ error: 'startLat, startLng, endLat, endLng are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GOOGLE_MAPS_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
    url.searchParams.set('origin', `${startLat},${startLng}`);
    url.searchParams.set('destination', `${endLat},${endLng}`);
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('key', apiKey);

    // Add waypoints if provided (array of {lat, lng})
    // Google supports max 25 waypoints
    if (waypoints && Array.isArray(waypoints) && waypoints.length > 0) {
      const waypointStr = waypoints
        .slice(0, 25)
        .map((wp: { lat: number; lng: number }) => `${wp.lat},${wp.lng}`)
        .join('|');
      url.searchParams.set('waypoints', waypointStr);
    }

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status !== 'OK') {
      console.error('Google Directions API error:', data.status, data.error_message);
      return new Response(JSON.stringify({ error: data.error_message || data.status }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const route = data.routes?.[0];
    if (!route) {
      return new Response(JSON.stringify({ error: 'No route found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const encodedPolyline = route.overview_polyline?.points;
    if (!encodedPolyline) {
      return new Response(JSON.stringify({ error: 'No polyline data in response' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const coordinates = decodePolyline(encodedPolyline);

    // Decode each leg's steps for higher resolution
    let detailedCoordinates: [number, number][] = [];
    for (const leg of route.legs || []) {
      for (const step of leg.steps || []) {
        if (step.polyline?.points) {
          const stepCoords = decodePolyline(step.polyline.points);
          if (detailedCoordinates.length > 0 && stepCoords.length > 0) {
            const last = detailedCoordinates[detailedCoordinates.length - 1];
            const first = stepCoords[0];
            if (Math.abs(last[0] - first[0]) < 0.00001 && Math.abs(last[1] - first[1]) < 0.00001) {
              stepCoords.shift();
            }
          }
          detailedCoordinates = detailedCoordinates.concat(stepCoords);
        }
      }
    }

    const finalCoordinates = detailedCoordinates.length > 0 ? detailedCoordinates : coordinates;

    // Calculate total distance across all legs
    let totalDistance = 0;
    let totalDuration = 0;
    for (const leg of route.legs || []) {
      totalDistance += leg.distance?.value || 0;
      totalDuration += leg.duration?.value || 0;
    }

    return new Response(JSON.stringify({
      coordinates: finalCoordinates,
      distance: totalDistance,
      duration: totalDuration,
      summary: route.summary || '',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error in google-directions:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
