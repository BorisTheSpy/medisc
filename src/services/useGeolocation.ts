import { useCallback, useEffect, useRef, useState } from "react";
import type { LatLon } from "@/domain/types";

export interface GeoState {
  position: (LatLon & { accuracy: number; heading: number | null; timestamp: number }) | null;
  error: string | null;
  loading: boolean;
  permission: PermissionState | "unknown";
  supported: boolean;
}

const IOS = typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);

const ERRORS: Record<number, string> = {
  1: IOS
    ? "Location is blocked for this site. In iOS Settings go to Privacy & Security, Location Services, Safari Websites and choose Ask or Allow. Then in Safari tap the AA button, Website Settings, and set Location to Ask or Allow."
    : "Location access was denied. Allow it in your browser settings or search for a place instead.",
  2: "Your location could not be determined. Check that Location Services are turned on for this device.",
  3: "Finding your location took too long. Move somewhere with a clearer view of the sky and try again.",
};

const TIMEOUT_MS = 20_000;

/**
 * Coarse fix on demand, then a high-accuracy watch while `watch` is true and the tab is visible.
 */
export function useGeolocation(watch = false): GeoState & { locate: () => void } {
  const supported = typeof navigator !== "undefined" && "geolocation" in navigator;
  const [state, setState] = useState<GeoState>({ position: null, error: null, loading: false, permission: "unknown", supported });
  const watchId = useRef<number | null>(null);
  const requestSeq = useRef(0);
  const safetyTimer = useRef<number | null>(null);

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

  /**
   * Request a fix. Every call starts a fresh request so a tap always does something, even if an earlier
   * request (for example the automatic one on page load) never came back. iOS Safari can leave a request
   * hanging when its prompt is dismissed, so a safety timer also clears the loading state.
   */
  const locate = useCallback(() => {
    if (!supported) {
      setState((s) => ({ ...s, error: "This browser does not support location." }));
      return;
    }
    const seq = ++requestSeq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    if (safetyTimer.current) window.clearTimeout(safetyTimer.current);
    safetyTimer.current = window.setTimeout(() => {
      if (requestSeq.current === seq) setState((s) => (s.loading ? { ...s, loading: false, error: ERRORS[3] } : s));
    }, TIMEOUT_MS + 2_000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (requestSeq.current === seq) onPosition(pos);
      },
      (err) => {
        if (requestSeq.current === seq) onError(err);
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: TIMEOUT_MS },
    );
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
