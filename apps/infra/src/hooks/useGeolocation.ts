import { useState, useCallback, useEffect } from 'react';

interface GeolocationState {
  position: [number, number] | null;
  accuracy: number | null;
  loading: boolean;
  error: string | null;
  watching: boolean;
}

interface UseGeolocationOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

export function useGeolocation(options: UseGeolocationOptions = {}) {
  const {
    enableHighAccuracy = true,
    timeout = 10000,
    maximumAge = 0,
  } = options;

  const [state, setState] = useState<GeolocationState>({
    position: null,
    accuracy: null,
    loading: false,
    error: null,
    watching: false,
  });

  const getCurrentPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        error: 'Geolocation is not supported by this browser',
      }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState(prev => ({
          ...prev,
          position: [position.coords.latitude, position.coords.longitude],
          accuracy: position.coords.accuracy,
          loading: false,
          error: null,
        }));
      },
      (error) => {
        let errorMessage = 'Failed to get location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location unavailable';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out';
            break;
        }
        setState(prev => ({
          ...prev,
          loading: false,
          error: errorMessage,
        }));
      },
      {
        enableHighAccuracy,
        timeout,
        maximumAge,
      }
    );
  }, [enableHighAccuracy, timeout, maximumAge]);

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        error: 'Geolocation is not supported by this browser',
      }));
      return () => {};
    }

    setState(prev => ({ ...prev, watching: true, error: null }));

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setState(prev => ({
          ...prev,
          position: [position.coords.latitude, position.coords.longitude],
          accuracy: position.coords.accuracy,
          error: null,
        }));
      },
      (error) => {
        let errorMessage = 'Failed to watch location';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location permission denied';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location unavailable';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out';
            break;
        }
        setState(prev => ({
          ...prev,
          error: errorMessage,
        }));
      },
      {
        enableHighAccuracy,
        timeout,
        maximumAge,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setState(prev => ({ ...prev, watching: false }));
    };
  }, [enableHighAccuracy, timeout, maximumAge]);

  const stopWatching = useCallback(() => {
    setState(prev => ({ ...prev, watching: false }));
  }, []);

  return {
    ...state,
    getCurrentPosition,
    startWatching,
    stopWatching,
  };
}
