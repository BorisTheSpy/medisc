import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLon } from "@/domain/types";

export interface GeoState {
  position: (LatLon & { accuracy: number; heading: number | null; timestamp: number }) | null;
  error: string | null;
  loading: boolean;
  permission: PermissionState | "unknown";
  supported: boolean;
}

const ERRORS: Record<number, string> = {
  1: "Location access was denied. Allow it in your browser settings or search for a place instead.",
  2: "Your location could not be determined. Check that location services are on.",
  3: "Finding your location took too long. Try again.",
};

/**
 * Coarse fix on demand, then a high-accuracy watch while `watch` is true and the tab is visible.
 */
export function useGeolocation(watch = false): GeoState & { locate: () => void } {
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;
  const [state, setState] = useState<GeoState>({ position: null, error: null, loading: false, permission: "unknown", supported });
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!supported || !("permissions" in navigator)) return;
    let perm: PermissionStatus | undefined;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((p) => {
        perm = p;
        setState((s) => ({ ...s, permission: p.state }));
        p.onchange = () => setState((s) => ({ ...s, permission: p.state }));
      })
      .catch(() => {});
    return () => {
      if (perm) perm.onchange = null;
    };
  }, [supported]);

  const onPosition = useCallback((pos: GeolocationPosition) => {
    setState((s) => ({
      ...s,
      loading: false,
      error: null,
      position: {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading,
        timestamp: pos.timestamp,
      },
    }));
  }, []);

  const onError = useCallback((err: GeolocationPositionError) => {
    setState((s) => ({ ...s, loading: false, error: ERRORS[err.code] ?? err.message }));
  }, []);

  const locate = useCallback(() => {
    if (!supported) {
      setState((s) => ({ ...s, error: "This browser does not support location." }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    navigator.geolocation.getCurrentPosition(onPosition, onError, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 });
  }, [supported, onPosition, onError]);

  useEffect(() => {
    if (!watch || !supported) return;
    const start = () => {
      if (watchId.current !== null) return;
      watchId.current = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
    };
    const stop = () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [watch, supported, onPosition, onError]);

  return { ...state, locate };
}
