import { useCallback, useEffect, useRef, useState } from "react";
import { headingFromOrientation, smoothHeading } from "@/domain/compass";

export interface CompassState {
  /** Degrees clockwise from north, smoothed; null until the phone reports one. */
  heading: number | null;
  /** iOS asks before sharing orientation. True until the user has granted it. */
  needsPermission: boolean;
  supported: boolean;
  /** Ask for permission. Must be called from a tap. */
  request: () => Promise<void>;
}

type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

const ctor = (): OrientationCtor | null => (typeof DeviceOrientationEvent === "undefined" ? null : (DeviceOrientationEvent as OrientationCtor));

let granted = typeof DeviceOrientationEvent !== "undefined" && typeof (DeviceOrientationEvent as OrientationCtor).requestPermission !== "function";

/**
 * Compass heading from the phone's orientation sensor, falling back to the GPS course when the
 * sensor gives nothing. On iOS the first tap anywhere asks for motion permission.
 */
export function useCompass(gpsHeading: number | null | undefined): CompassState {
  const supported = ctor() !== null;
  const [heading, setHeading] = useState<number | null>(null);
  const [needsPermission, setNeedsPermission] = useState(() => !granted);
  const smoothed = useRef<number | null>(null);
  const lastAt = useRef(0);

  const request = useCallback(async () => {
    const c = ctor();
    if (!c?.requestPermission) return;
    try {
      const r = await c.requestPermission();
      granted = r === "granted";
    } catch {
      granted = false;
    }
    setNeedsPermission(!granted);
  }, []);

  // iOS: piggyback on the first tap so most players never see a compass button.
  useEffect(() => {
    if (!needsPermission) return;
    const once = () => void request();
    document.addEventListener("click", once, { once: true, capture: true });
    return () => document.removeEventListener("click", once, { capture: true });
  }, [needsPermission, request]);

  useEffect(() => {
    if (!supported || needsPermission) return;
    const onEvent = (e: DeviceOrientationEvent) => {
      const now = performance.now();
      if (now - lastAt.current < 80) return;
      const h = headingFromOrientation(e as DeviceOrientationEvent & { webkitCompassHeading?: number });
      if (h === null) return;
      lastAt.current = now;
      smoothed.current = smoothHeading(smoothed.current, h);
      setHeading(Math.round(smoothed.current));
    };
    const absoluteEvent = "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(absoluteEvent as "deviceorientation", onEvent);
    return () => window.removeEventListener(absoluteEvent as "deviceorientation", onEvent);
  }, [supported, needsPermission]);

  // GPS course only counts while the phone is moving; the sensor wins when it speaks.
  const fallback = heading === null && typeof gpsHeading === "number" && Number.isFinite(gpsHeading) ? Math.round(gpsHeading) : null;
  return { heading: heading ?? fallback, needsPermission, supported, request };
}
