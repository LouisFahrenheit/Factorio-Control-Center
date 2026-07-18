import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { IconMapPin } from '@tabler/icons-react';
import { previewPlanetCoordinates } from '../../lib/mapGen/previewCoordinates';
import {
  clientToImageNorm,
  emptyMapPreviewAnnotations,
  eraseAt,
  imageContentRect,
  MAP_PREVIEW_MARKER_ICON_SIZE,
  MAP_PREVIEW_MARKER_STROKE_WIDTH,
  mapPreviewMarkerIconExportPx,
  MAP_PREVIEW_ANNOTATION_DEFAULT_COLOR,
  normalizeAnnotationColor,
  strokePolylinePoints,
  type MapPreviewAnnotationTool,
  type MapPreviewAnnotations,
} from '../../lib/mapGen/previewAnnotations';
import { webEffectsReduced } from '../../theme/webEffects';

/** Default zoom inside the preview frame (wheel adjusts from min to max). */
const PREVIEW_ZOOM_DEFAULT = 1.65;
const PREVIEW_ZOOM_MIN = 1;
const PREVIEW_ZOOM_MAX = 8;
const PREVIEW_ZOOM_WHEEL_FACTOR = 1.1;
const SATELLITE_SCAN_MS = 1150;
const SATELLITE_OVERLAY_FADE_MS = 1500;
const SATELLITE_CONNECT_STAGE_MS = 1500;
const PLANET_CAPTION_CHAR_MS = 42;
const PLANET_CAPTION_LINE_PAUSE_MS = 220;
const PLANET_CAPTION_HOLD_MS = 5000;
const CRASH_SITE_HOLD_MS = PLANET_CAPTION_HOLD_MS + 2000;
const PLANET_CAPTION_FADE_MS = 800;
const PREVIEW_PAN_ANIM_MS = 420;
const ANNOTATION_ERASE_RADIUS = 0.035;
const ANNOTATION_MIN_POINT_DIST = 0.002;
const ANNOTATION_STROKE_WIDTH = 0.55;

type Pan = { x: number; y: number };

function clampPan(pan: Pan, maxX: number, maxY: number): Pan {
  return {
    x: Math.min(maxX, Math.max(-maxX, pan.x)),
    y: Math.min(maxY, Math.max(-maxY, pan.y)),
  };
}

function panBounds(
  frameW: number,
  frameH: number,
  naturalW: number,
  naturalH: number,
  zoom: number,
): { maxX: number; maxY: number } {
  if (frameW <= 0 || frameH <= 0 || naturalW <= 0 || naturalH <= 0) {
    return { maxX: 0, maxY: 0 };
  }
  const fitScale = Math.min(frameW / naturalW, frameH / naturalH);
  const contentW = naturalW * fitScale;
  const contentH = naturalH * fitScale;
  const scaledW = contentW * zoom;
  const scaledH = contentH * zoom;
  return {
    maxX: Math.max(0, (scaledW - frameW) / 2),
    maxY: Math.max(0, (scaledH - frameH) / 2),
  };
}

async function preloadPreviewImage(url: string): Promise<void> {
  const img = new Image();
  img.src = url;
  if (typeof img.decode === 'function') {
    try {
      await img.decode();
      return;
    } catch {
      /* fall through to load event */
    }
  }
  if (img.complete) return;
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });
}

interface MapPreviewViewportProps {
  previewUrl: string;
  previewPlanet: string;
  planetLabel: string;
  mapSeed: string;
  loading: boolean;
  refining: boolean;
  emptyLabel: string;
  connectingStages?: string[];
  refiningLabel: string;
  crashSiteLabel: string;
  onInteractionLockChange?: (locked: boolean) => void;
  onFirstPreviewReady?: () => void;
  showCenterMarker?: boolean;
  annotationTool?: MapPreviewAnnotationTool;
  annotationColor?: string;
  markerLabel?: string;
  onAnnotationsChange?: (annotations: MapPreviewAnnotations) => void;
}

export type { MapPreviewAnnotationTool };

export type MapPreviewViewportHandle = {
  recenter: () => void;
  clearAnnotations: () => void;
  getAnnotations: () => MapPreviewAnnotations;
  getMarkerExportOptions: (exportImageWidth: number) => { markerIconPx: number };
};

export const MapPreviewViewport = forwardRef<MapPreviewViewportHandle, MapPreviewViewportProps>(
  function MapPreviewViewport(
    {
      previewUrl,
      previewPlanet,
      planetLabel,
      mapSeed,
      loading,
      refining,
      emptyLabel,
      connectingStages,
      refiningLabel,
      crashSiteLabel,
      onInteractionLockChange,
      onFirstPreviewReady,
      showCenterMarker = false,
      annotationTool = 'pan',
      annotationColor = MAP_PREVIEW_ANNOTATION_DEFAULT_COLOR,
      markerLabel = '',
      onAnnotationsChange,
    },
    ref,
  ) {
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(PREVIEW_ZOOM_DEFAULT);
  const [panSmooth, setPanSmooth] = useState(false);
  const [panning, setPanning] = useState(false);
  const [annotations, setAnnotations] = useState<MapPreviewAnnotations>(() =>
    emptyMapPreviewAnnotations(),
  );
  const [imageOverlayRect, setImageOverlayRect] = useState({
    left: 0,
    top: 0,
    width: 100,
    height: 100,
  });
  const [displayUrl, setDisplayUrl] = useState('');
  const [satelliteScan, setSatelliteScan] = useState(false);
  const [outgoingUrl, setOutgoingUrl] = useState('');
  const [revealKey, setRevealKey] = useState(0);
  const [scanOverlayVisible, setScanOverlayVisible] = useState(false);
  const [scanOverlayFading, setScanOverlayFading] = useState(false);
  const [pendingGridKey, setPendingGridKey] = useState(0);
  const [connectStageIndex, setConnectStageIndex] = useState(0);
  const [planetCaptionVisible, setPlanetCaptionVisible] = useState(false);
  const [planetCaptionName, setPlanetCaptionName] = useState('');
  const [planetCaptionCoords, setPlanetCaptionCoords] = useState('');
  const [planetCaptionPhase, setPlanetCaptionPhase] = useState<'name' | 'coords' | 'done'>('name');
  const [planetCaptionFading, setPlanetCaptionFading] = useState(false);
  const [crashSiteVisible, setCrashSiteVisible] = useState(false);
  const [crashSiteTyped, setCrashSiteTyped] = useState('');
  const [crashSiteTyping, setCrashSiteTyping] = useState(false);
  const [crashSiteFading, setCrashSiteFading] = useState(false);
  const displayUrlRef = useRef('');
  const preloadGenRef = useRef(0);
  const scanTimerRef = useRef<number | null>(null);
  const overlayFadeTimerRef = useRef<number | null>(null);
  const planetCaptionTimersRef = useRef<number[]>([]);
  const crashSiteTimersRef = useRef<number[]>([]);
  const seenPlanetsRef = useRef<Set<string>>(new Set());
  const crashSiteShownRef = useRef(false);
  const wasScanningRef = useRef(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const boundsRef = useRef({ maxX: 0, maxY: 0 });
  panRef.current = pan;
  zoomRef.current = zoom;
  displayUrlRef.current = displayUrl;
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);
  const pendingGridKeyRef = useRef(0);
  const wasLoadingRef = useRef(false);
  const panSmoothTimerRef = useRef<number | null>(null);
  const previewInteractionLockedRef = useRef(false);
  const firstPreviewReadyFiredRef = useRef(false);
  const annotationIdRef = useRef(0);
  const activeStrokeRef = useRef<{ id: string; pointerId: number } | null>(null);
  const annotationToolRef = useRef(annotationTool);
  const annotationColorRef = useRef(annotationColor);
  const markerLabelRef = useRef(markerLabel);
  annotationToolRef.current = annotationTool;
  annotationColorRef.current = annotationColor;
  markerLabelRef.current = markerLabel;

  const nextAnnotationId = useCallback(() => {
    annotationIdRef.current += 1;
    return `ann-${annotationIdRef.current}`;
  }, []);

  const clearAnnotations = useCallback(() => {
    activeStrokeRef.current = null;
    setAnnotations(emptyMapPreviewAnnotations());
  }, []);

  const getMarkerExportOptions = useCallback((exportImageWidth: number) => {
    const frame = frameRef.current;
    const img = imgRef.current;
    if (!frame || !img?.naturalWidth || exportImageWidth <= 0) {
      return { markerIconPx: MAP_PREVIEW_MARKER_ICON_SIZE };
    }
    const content = imageContentRect(
      frame.clientWidth,
      frame.clientHeight,
      img.naturalWidth,
      img.naturalHeight,
    );
    return {
      markerIconPx: mapPreviewMarkerIconExportPx(exportImageWidth, content.w),
    };
  }, []);

  const updateImageOverlayRect = useCallback(() => {
    const frame = frameRef.current;
    const img = imgRef.current;
    if (!frame || !img?.naturalWidth) return;
    const fw = frame.clientWidth;
    const fh = frame.clientHeight;
    const content = imageContentRect(fw, fh, img.naturalWidth, img.naturalHeight);
    setImageOverlayRect({
      left: (content.x / fw) * 100,
      top: (content.y / fh) * 100,
      width: (content.w / fw) * 100,
      height: (content.h / fh) * 100,
    });
  }, []);

  const pointerToImageNorm = useCallback((clientX: number, clientY: number) => {
    const frame = frameRef.current;
    const img = imgRef.current;
    if (!frame || !img?.naturalWidth) return null;
    return clientToImageNorm(
      clientX,
      clientY,
      frame,
      panRef.current,
      zoomRef.current,
      img.naturalWidth,
      img.naturalHeight,
    );
  }, []);

  const appendStrokePoint = useCallback((strokeId: string, point: { x: number; y: number }) => {
    setAnnotations((current) => {
      const strokes = current.strokes.map((stroke) => {
        if (stroke.id !== strokeId) return stroke;
        const last = stroke.points[stroke.points.length - 1];
        if (last && Math.hypot(last.x - point.x, last.y - point.y) < ANNOTATION_MIN_POINT_DIST) {
          return stroke;
        }
        return { ...stroke, points: [...stroke.points, point] };
      });
      return { ...current, strokes };
    });
  }, []);

  const fireFirstPreviewReady = useCallback(() => {
    if (firstPreviewReadyFiredRef.current) return;
    firstPreviewReadyFiredRef.current = true;
    onFirstPreviewReady?.();
  }, [onFirstPreviewReady]);

  const clearPanSmoothTimer = useCallback(() => {
    if (panSmoothTimerRef.current) {
      window.clearTimeout(panSmoothTimerRef.current);
      panSmoothTimerRef.current = null;
    }
  }, []);

  const resetPanZoom = useCallback(() => {
    clearPanSmoothTimer();
    setPanSmooth(false);
    setPan({ x: 0, y: 0 });
    setZoom(PREVIEW_ZOOM_DEFAULT);
    setPanning(false);
    dragRef.current = null;
    panRef.current = { x: 0, y: 0 };
    zoomRef.current = PREVIEW_ZOOM_DEFAULT;
  }, [clearPanSmoothTimer]);

  const clearPlanetCaptionTimers = useCallback(() => {
    for (const id of planetCaptionTimersRef.current) {
      window.clearTimeout(id);
      window.clearInterval(id);
    }
    planetCaptionTimersRef.current = [];
  }, []);

  const hidePlanetCaption = useCallback(() => {
    clearPlanetCaptionTimers();
    setPlanetCaptionVisible(false);
    setPlanetCaptionName('');
    setPlanetCaptionCoords('');
    setPlanetCaptionPhase('name');
    setPlanetCaptionFading(false);
  }, [clearPlanetCaptionTimers]);

  const startPlanetCaption = useCallback(
    (label: string, coordsLine: string) => {
      clearPlanetCaptionTimers();
      setPlanetCaptionVisible(true);
      setPlanetCaptionFading(false);
      setPlanetCaptionName('');
      setPlanetCaptionCoords('');
      setPlanetCaptionPhase('name');

      const schedule = (fn: () => void, ms: number) => {
        const id = window.setTimeout(fn, ms);
        planetCaptionTimersRef.current.push(id);
      };

      const beginHoldThenFade = () => {
        setPlanetCaptionPhase('done');
        schedule(() => {
          setPlanetCaptionFading(true);
          schedule(() => hidePlanetCaption(), PLANET_CAPTION_FADE_MS);
        }, PLANET_CAPTION_HOLD_MS);
      };

      const typeLine = (text: string, phase: 'name' | 'coords', onDone: () => void) => {
        if (webEffectsReduced() || !text) {
          if (phase === 'name') setPlanetCaptionName(text);
          else setPlanetCaptionCoords(text);
          onDone();
          return;
        }

        setPlanetCaptionPhase(phase);
        let index = 0;
        const apply = (value: string) => {
          if (phase === 'name') setPlanetCaptionName(value);
          else setPlanetCaptionCoords(value);
        };
        const typeId = window.setInterval(() => {
          index += 1;
          apply(text.slice(0, index));
          if (index >= text.length) {
            window.clearInterval(typeId);
            onDone();
          }
        }, PLANET_CAPTION_CHAR_MS);
        planetCaptionTimersRef.current.push(typeId);
      };

      if (webEffectsReduced() || !label) {
        setPlanetCaptionName(label);
        setPlanetCaptionCoords(coordsLine);
        beginHoldThenFade();
        return;
      }

      typeLine(label, 'name', () => {
        schedule(() => {
          typeLine(coordsLine, 'coords', beginHoldThenFade);
        }, PLANET_CAPTION_LINE_PAUSE_MS);
      });
    },
    [clearPlanetCaptionTimers, hidePlanetCaption],
  );

  const clearCrashSiteTimers = useCallback(() => {
    for (const id of crashSiteTimersRef.current) {
      window.clearTimeout(id);
      window.clearInterval(id);
    }
    crashSiteTimersRef.current = [];
  }, []);

  const hideCrashSite = useCallback(() => {
    clearCrashSiteTimers();
    setCrashSiteVisible(false);
    setCrashSiteTyped('');
    setCrashSiteTyping(false);
    setCrashSiteFading(false);
  }, [clearCrashSiteTimers]);

  const startCrashSiteMarker = useCallback(
    (label: string) => {
      if (!label || crashSiteShownRef.current) return;
      crashSiteShownRef.current = true;
      clearCrashSiteTimers();
      setCrashSiteVisible(true);
      setCrashSiteFading(false);
      setCrashSiteTyped('');
      setCrashSiteTyping(true);

      const schedule = (fn: () => void, ms: number) => {
        const id = window.setTimeout(fn, ms);
        crashSiteTimersRef.current.push(id);
      };

      const beginHoldThenFade = () => {
        setCrashSiteTyping(false);
        schedule(() => {
          setCrashSiteFading(true);
          schedule(() => hideCrashSite(), PLANET_CAPTION_FADE_MS);
        }, CRASH_SITE_HOLD_MS);
      };

      if (webEffectsReduced()) {
        setCrashSiteTyped(label);
        beginHoldThenFade();
        return;
      }

      let index = 0;
      const typeId = window.setInterval(() => {
        index += 1;
        setCrashSiteTyped(label.slice(0, index));
        if (index >= label.length) {
          window.clearInterval(typeId);
          beginHoldThenFade();
        }
      }, PLANET_CAPTION_CHAR_MS);
      crashSiteTimersRef.current.push(typeId);
    },
    [clearCrashSiteTimers, hideCrashSite],
  );

  const scheduleCrashSiteAfterScan = useCallback(() => {
    if (crashSiteShownRef.current || !crashSiteLabel) return;
    const delay = webEffectsReduced() ? 0 : SATELLITE_OVERLAY_FADE_MS + 120;
    const id = window.setTimeout(() => {
      startCrashSiteMarker(crashSiteLabel);
    }, delay);
    crashSiteTimersRef.current.push(id);
  }, [crashSiteLabel, startCrashSiteMarker]);

  useEffect(() => {
    hidePlanetCaption();
  }, [previewPlanet, hidePlanetCaption]);

  useEffect(() => {
    if (webEffectsReduced()) {
      if (!displayUrl || !previewPlanet || !planetLabel || satelliteScan) return;
      if (seenPlanetsRef.current.has(previewPlanet)) return;
      seenPlanetsRef.current.add(previewPlanet);
      startPlanetCaption(
        planetLabel,
        previewPlanetCoordinates(mapSeed, previewPlanet),
      );
      if (!crashSiteShownRef.current && crashSiteLabel) {
        scheduleCrashSiteAfterScan();
      }
      return;
    }

    if (wasScanningRef.current && !satelliteScan && displayUrl && previewPlanet && planetLabel) {
      if (!seenPlanetsRef.current.has(previewPlanet)) {
        seenPlanetsRef.current.add(previewPlanet);
        startPlanetCaption(
          planetLabel,
          previewPlanetCoordinates(mapSeed, previewPlanet),
        );
      }
      if (!crashSiteShownRef.current && crashSiteLabel) {
        scheduleCrashSiteAfterScan();
      }
    }
    wasScanningRef.current = satelliteScan;
  }, [
    satelliteScan,
    displayUrl,
    previewPlanet,
    planetLabel,
    mapSeed,
    crashSiteLabel,
    startPlanetCaption,
    scheduleCrashSiteAfterScan,
  ]);

  useEffect(() => {
    return () => {
      clearPlanetCaptionTimers();
      clearCrashSiteTimers();
      clearPanSmoothTimer();
    };
  }, [clearPlanetCaptionTimers, clearCrashSiteTimers, clearPanSmoothTimer]);

  const clearScanTimers = useCallback(() => {
    if (scanTimerRef.current) {
      window.clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (overlayFadeTimerRef.current) {
      window.clearTimeout(overlayFadeTimerRef.current);
      overlayFadeTimerRef.current = null;
    }
  }, []);

  const finishScan = useCallback(() => {
    setSatelliteScan(false);
    setScanOverlayFading(true);
    scanTimerRef.current = null;
    fireFirstPreviewReady();
    overlayFadeTimerRef.current = window.setTimeout(() => {
      setOutgoingUrl('');
      setScanOverlayFading(false);
      setScanOverlayVisible(false);
      overlayFadeTimerRef.current = null;
    }, SATELLITE_OVERLAY_FADE_MS);
  }, [fireFirstPreviewReady]);

  const syncBounds = useCallback(() => {
    const frame = frameRef.current;
    const img = imgRef.current;
    if (!frame || !img?.naturalWidth) return;
    const { maxX, maxY } = panBounds(
      frame.clientWidth,
      frame.clientHeight,
      img.naturalWidth,
      img.naturalHeight,
      zoomRef.current,
    );
    boundsRef.current = { maxX, maxY };
    setPan((current) => clampPan(current, maxX, maxY));
    updateImageOverlayRect();
  }, [updateImageOverlayRect]);

  const animatePanZoomToCenter = useCallback(
    (smooth = true) => {
      const useSmooth = smooth && !webEffectsReduced();
      clearPanSmoothTimer();
      if (useSmooth) {
        setPanSmooth(true);
      } else {
        setPanSmooth(false);
      }
      setPan({ x: 0, y: 0 });
      setZoom(PREVIEW_ZOOM_DEFAULT);
      setPanning(false);
      dragRef.current = null;
      panRef.current = { x: 0, y: 0 };
      zoomRef.current = PREVIEW_ZOOM_DEFAULT;
      if (useSmooth) {
        panSmoothTimerRef.current = window.setTimeout(() => {
          panSmoothTimerRef.current = null;
          setPanSmooth(false);
          syncBounds();
        }, PREVIEW_PAN_ANIM_MS);
      } else {
        syncBounds();
      }
    },
    [clearPanSmoothTimer, syncBounds],
  );

  useImperativeHandle(
    ref,
    () => ({
      recenter: () => animatePanZoomToCenter(true),
      clearAnnotations,
      getAnnotations: () => annotations,
      getMarkerExportOptions,
    }),
    [animatePanZoomToCenter, clearAnnotations, annotations, getMarkerExportOptions],
  );

  useEffect(() => {
    onAnnotationsChange?.(annotations);
  }, [annotations, onAnnotationsChange]);

  useEffect(() => {
    if (loading && !wasLoadingRef.current && !webEffectsReduced()) {
      pendingGridKeyRef.current += 1;
      setPendingGridKey(pendingGridKeyRef.current);
    }
    if (loading && !wasLoadingRef.current && displayUrlRef.current) {
      if (webEffectsReduced()) {
        resetPanZoom();
      } else {
        animatePanZoomToCenter(true);
      }
    }
    wasLoadingRef.current = loading;
  }, [loading, animatePanZoomToCenter, resetPanZoom]);

  useEffect(() => {
    clearScanTimers();

    if (!previewUrl) {
      preloadGenRef.current += 1;
      firstPreviewReadyFiredRef.current = false;
      clearAnnotations();
      setDisplayUrl('');
      setOutgoingUrl('');
      setSatelliteScan(false);
      setScanOverlayVisible(false);
      setScanOverlayFading(false);
      resetPanZoom();
      return;
    }

    if (previewUrl === displayUrlRef.current) return;

    clearAnnotations();
    const gen = ++preloadGenRef.current;

    if (webEffectsReduced()) {
      setDisplayUrl(previewUrl);
      setOutgoingUrl('');
      setSatelliteScan(false);
      setScanOverlayVisible(false);
      setScanOverlayFading(false);
      resetPanZoom();
      fireFirstPreviewReady();
      return;
    }

    void (async () => {
      const isFirstLaunch = !displayUrlRef.current;

      if (isFirstLaunch) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, SATELLITE_CONNECT_STAGE_MS);
        });
        if (gen !== preloadGenRef.current) return;
      }

      await preloadPreviewImage(previewUrl);
      if (gen !== preloadGenRef.current) return;

      const prev = displayUrlRef.current;
      if (!prev) {
        resetPanZoom();
      }
      setOutgoingUrl(prev);
      setDisplayUrl(previewUrl);
      setRevealKey((k) => k + 1);
      setSatelliteScan(true);
      setScanOverlayVisible(true);
      setScanOverlayFading(false);

      scanTimerRef.current = window.setTimeout(finishScan, SATELLITE_SCAN_MS);
    })();

    return clearScanTimers;
  }, [previewUrl, clearScanTimers, finishScan, resetPanZoom, fireFirstPreviewReady, clearAnnotations]);

  useLayoutEffect(() => {
    if (!displayUrl || satelliteScan) return;
    syncBounds();
  }, [displayUrl, satelliteScan, zoom, revealKey, syncBounds]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !displayUrl) return;
    const observer = new ResizeObserver(() => syncBounds());
    observer.observe(frame);
    return () => observer.disconnect();
  }, [displayUrl, syncBounds]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !displayUrl) return;

    const onWheel = (e: WheelEvent) => {
      if (previewInteractionLockedRef.current) return;
      e.preventDefault();
      const frameEl = frameRef.current;
      const img = imgRef.current;
      if (!frameEl || !img?.naturalWidth) return;

      const rect = frameEl.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const frameW = frameEl.clientWidth;
      const frameH = frameEl.clientHeight;

      const oldZoom = zoomRef.current;
      const factor = e.deltaY < 0 ? PREVIEW_ZOOM_WHEEL_FACTOR : 1 / PREVIEW_ZOOM_WHEEL_FACTOR;
      const newZoom = Math.min(
        PREVIEW_ZOOM_MAX,
        Math.max(PREVIEW_ZOOM_MIN, oldZoom * factor),
      );
      if (Math.abs(newZoom - oldZoom) < 1e-4) return;

      const panCur = panRef.current;
      const imgX = (mx - frameW / 2 - panCur.x) / oldZoom;
      const imgY = (my - frameH / 2 - panCur.y) / oldZoom;
      const { maxX, maxY } = panBounds(
        frameW,
        frameH,
        img.naturalWidth,
        img.naturalHeight,
        newZoom,
      );
      boundsRef.current = { maxX, maxY };
      const clamped = clampPan(
        {
          x: mx - frameW / 2 - imgX * newZoom,
          y: my - frameH / 2 - imgY * newZoom,
        },
        maxX,
        maxY,
      );
      zoomRef.current = newZoom;
      panRef.current = clamped;
      setZoom(newZoom);
      setPan(clamped);
    };

    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [displayUrl]);

  const endPan = useCallback((pointerId: number, target: HTMLElement) => {
    if (dragRef.current?.pointerId === pointerId) {
      dragRef.current = null;
      setPanning(false);
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
    }
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !displayUrl || previewInteractionLockedRef.current) return;
    if (annotationToolRef.current !== 'pan') return;
    syncBounds();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    setPanning(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (previewInteractionLockedRef.current) return;
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const { maxX, maxY } = boundsRef.current;
    setPan(
      clampPan(
        {
          x: drag.panX + e.clientX - drag.startX,
          y: drag.panY + e.clientY - drag.startY,
        },
        maxX,
        maxY,
      ),
    );
  };

  const onAnnotationPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || previewInteractionLockedRef.current) return;
    const tool = annotationToolRef.current;
    if (tool === 'pan') return;

    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);

    const point = pointerToImageNorm(e.clientX, e.clientY);
    if (!point) return;

    if (tool === 'marker') {
      const label = String(markerLabelRef.current || '').trim();
      setAnnotations((current) => ({
        ...current,
        markers: [
          ...current.markers,
          {
            id: nextAnnotationId(),
            ...point,
            color: normalizeAnnotationColor(annotationColorRef.current),
            ...(label ? { label } : {}),
          },
        ],
      }));
      return;
    }

    if (tool === 'eraser') {
      setAnnotations((current) => eraseAt(current, point, ANNOTATION_ERASE_RADIUS));
      return;
    }

    const id = nextAnnotationId();
    activeStrokeRef.current = { id, pointerId: e.pointerId };
    setAnnotations((current) => ({
      ...current,
      strokes: [
        ...current.strokes,
        {
          id,
          points: [point],
          color: normalizeAnnotationColor(annotationColorRef.current),
        },
      ],
    }));
  };

  const onAnnotationPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (previewInteractionLockedRef.current) return;
    const tool = annotationToolRef.current;
    const active = activeStrokeRef.current;
    if (tool === 'eraser') {
      if (e.buttons !== 1) return;
      const point = pointerToImageNorm(e.clientX, e.clientY);
      if (!point) return;
      setAnnotations((current) => eraseAt(current, point, ANNOTATION_ERASE_RADIUS));
      return;
    }
    if (tool !== 'pen' || !active || active.pointerId !== e.pointerId) return;
    const point = pointerToImageNorm(e.clientX, e.clientY);
    if (!point) return;
    appendStrokePoint(active.id, point);
  };

  const endAnnotationStroke = (pointerId: number) => {
    if (activeStrokeRef.current?.pointerId === pointerId) {
      activeStrokeRef.current = null;
    }
  };

  const onAnnotationPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    endAnnotationStroke(e.pointerId);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const preparingNext =
    Boolean(previewUrl) && previewUrl !== displayUrl && !webEffectsReduced();
  const previewInteractionLocked =
    Boolean(displayUrl) && (loading || preparingNext || satelliteScan);
  previewInteractionLockedRef.current = previewInteractionLocked;

  useEffect(() => {
    onInteractionLockChange?.(previewInteractionLocked);
  }, [previewInteractionLocked, onInteractionLockChange]);

  const satellitePending =
    !webEffectsReduced() &&
    !satelliteScan &&
    !scanOverlayFading &&
    (loading || preparingNext);
  const satelliteConnecting = !displayUrl && satellitePending;
  const showSatelliteOverlay = scanOverlayVisible || satellitePending;
  const overlayConnecting = satellitePending && !satelliteScan;
  const connectStageHoldIndex = Math.max(0, (connectingStages?.length ?? 1) - 2);
  const showFinalConnectStage = Boolean(previewUrl && !displayUrl && satelliteConnecting);
  const connectLineCount =
    connectingStages?.length && satelliteConnecting
      ? Math.min(connectStageIndex + 1, connectingStages.length)
      : 0;

  useEffect(() => {
    if (!satelliteConnecting || !connectingStages?.length) {
      setConnectStageIndex(0);
      return;
    }
    setConnectStageIndex(0);
    const timer = window.setInterval(() => {
      setConnectStageIndex((current) =>
        current < connectStageHoldIndex ? current + 1 : current,
      );
    }, SATELLITE_CONNECT_STAGE_MS);
    return () => window.clearInterval(timer);
  }, [satelliteConnecting, connectingStages?.length, connectStageHoldIndex, pendingGridKey]);

  useEffect(() => {
    if (!showFinalConnectStage || !connectingStages?.length) return;
    setConnectStageIndex(connectingStages.length - 1);
  }, [showFinalConnectStage, connectingStages?.length]);

  const frameClass =
    'create-save__preview-frame' +
    (refining ? ' create-save__preview-frame--refining' : '') +
    (loading && !displayUrl ? ' create-save__preview-frame--busy' : '') +
    (satellitePending ? ' create-save__preview-frame--satellite-connecting' : '') +
    (displayUrl && !previewInteractionLocked && annotationTool === 'pan'
      ? ' create-save__preview-frame--pannable'
      : '') +
    (displayUrl && !previewInteractionLocked && annotationTool === 'pen'
      ? ' create-save__preview-frame--annotate-pen'
      : '') +
    (displayUrl && !previewInteractionLocked && annotationTool === 'marker'
      ? ' create-save__preview-frame--annotate-marker'
      : '') +
    (displayUrl && !previewInteractionLocked && annotationTool === 'eraser'
      ? ' create-save__preview-frame--annotate-eraser'
      : '') +
    (panning ? ' create-save__preview-frame--panning' : '') +
    (satelliteScan ? ' create-save__preview-frame--satellite-scan' : '') +
    (previewInteractionLocked ? ' create-save__preview-frame--scan-lock' : '');

  const annotationLayerActive =
    Boolean(displayUrl) && !previewInteractionLocked && annotationTool !== 'pan';
  const hasAnnotations =
    annotations.strokes.length > 0 || annotations.markers.length > 0;

  return (
    <div
      ref={frameRef}
      className={frameClass}
      aria-busy={loading || refining}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endPan(e.pointerId, e.currentTarget)}
      onPointerCancel={(e) => endPan(e.pointerId, e.currentTarget)}
      onLostPointerCapture={(e) => endPan(e.pointerId, e.currentTarget)}
    >
      {displayUrl ? (
        <div
          className={
            'create-save__preview-pan' +
            (panSmooth ? ' create-save__preview-pan--smooth' : '')
          }
          style={{
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
          }}
        >
          {satelliteScan && outgoingUrl ? (
            <img
              src={outgoingUrl}
              alt=""
              className="create-save__preview-img create-save__preview-img--outgoing"
              draggable={false}
              aria-hidden
            />
          ) : null}
          <div
            key={revealKey}
            className={
              'create-save__preview-reveal' +
              (satelliteScan
                ? ' create-save__preview-reveal--scanning'
                : ' create-save__preview-reveal--revealed')
            }
          >
            <img
              ref={imgRef}
              src={displayUrl}
              alt=""
              className="create-save__preview-img"
              draggable={false}
              decoding="sync"
              onLoad={syncBounds}
            />
          </div>
          {showCenterMarker ? (
            <div className="create-save__preview-center-marker" aria-hidden>
              <span className="create-save__preview-center-marker-ring" />
              <span className="create-save__preview-center-marker-dot" />
            </div>
          ) : null}
          {hasAnnotations || annotationLayerActive ? (
            <div
              className={
                'create-save__preview-annotations' +
                (annotationLayerActive ? ' create-save__preview-annotations--active' : '')
              }
              style={{
                left: `${imageOverlayRect.left}%`,
                top: `${imageOverlayRect.top}%`,
                width: `${imageOverlayRect.width}%`,
                height: `${imageOverlayRect.height}%`,
              }}
              onPointerDown={onAnnotationPointerDown}
              onPointerMove={onAnnotationPointerMove}
              onPointerUp={onAnnotationPointerUp}
              onPointerCancel={onAnnotationPointerUp}
              onLostPointerCapture={(e) => endAnnotationStroke(e.pointerId)}
            >
              <svg
                className="create-save__preview-annotations-svg"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden
              >
                {annotations.strokes.map((stroke) =>
                  stroke.points.length >= 2 ? (
                    <polyline
                      key={stroke.id}
                      className="create-save__preview-annotation-stroke"
                      points={strokePolylinePoints(stroke)}
                      style={{ stroke: normalizeAnnotationColor(stroke.color) }}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : stroke.points.length === 1 ? (
                    <circle
                      key={stroke.id}
                      className="create-save__preview-annotation-stroke"
                      cx={stroke.points[0].x * 100}
                      cy={stroke.points[0].y * 100}
                      r={ANNOTATION_STROKE_WIDTH * 0.45}
                      style={{ stroke: normalizeAnnotationColor(stroke.color) }}
                      vectorEffect="non-scaling-stroke"
                    />
                  ) : null,
                )}
              </svg>
              {annotations.markers.map((marker) => (
                <span
                  key={marker.id}
                  className="create-save__preview-annotation-map-pin"
                  style={{
                    left: `${marker.x * 100}%`,
                    top: `${marker.y * 100}%`,
                    color: normalizeAnnotationColor(marker.color),
                  }}
                  aria-hidden
                >
                  {marker.label ? (
                    <span className="create-save__preview-annotation-label">{marker.label}</span>
                  ) : null}
                  <IconMapPin
                    size={MAP_PREVIEW_MARKER_ICON_SIZE}
                    stroke={MAP_PREVIEW_MARKER_STROKE_WIDTH}
                  />
                </span>
              ))}
            </div>
          ) : null}
          {crashSiteVisible ? (
            <div
              className={
                'create-save__preview-crash-site' +
                (crashSiteFading ? ' create-save__preview-crash-site--fading' : '')
              }
              aria-live="polite"
            >
              <div className="create-save__preview-crash-pin">
                <div className="create-save__preview-crash-label">
                  <span className="create-save__preview-crash-label-sizing" aria-hidden>
                    {crashSiteLabel}
                  </span>
                  <span className="create-save__preview-crash-label-content">
                    <span>{crashSiteTyped}</span>
                    {crashSiteTyping ? (
                      <span className="create-save__preview-planet-caption-cursor" aria-hidden>
                        ▌
                      </span>
                    ) : null}
                  </span>
                </div>
                <span className="create-save__preview-crash-stem" aria-hidden />
              </div>
              <span className="create-save__preview-crash-dot" aria-hidden />
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className={
            'create-save__preview-empty' + (satelliteConnecting ? ' create-save__preview-empty--connecting' : '')
          }
        >
          {!satelliteConnecting ? (
            <span className="create-save__preview-empty-icon" aria-hidden />
          ) : null}
          {satelliteConnecting && connectingStages?.length ? (
            <div className="create-save__preview-console" aria-live="polite">
              {connectingStages.slice(0, connectLineCount).map((line, index) => {
                const done = index < connectStageIndex;
                return (
                  <div
                    key={index}
                    className={
                      'create-save__preview-console-line' +
                      (done ? ' create-save__preview-console-line--done' : '') +
                      (index === connectStageIndex ? ' create-save__preview-console-line--active' : '')
                    }
                  >
                    <span className="create-save__preview-console-text">{line}</span>
                    {done ? <span className="create-save__preview-console-ok">OK</span> : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <span className="create-save__preview-placeholder">{emptyLabel}</span>
          )}
        </div>
      )}
      {displayUrl && (loading || refining) && (
        <span className="create-save__preview-refining-badge">{refiningLabel}</span>
      )}
      {showSatelliteOverlay ? (
        <div
          className={
            'create-save__preview-satellite-scan' +
            (overlayConnecting ? ' create-save__preview-satellite-scan--connecting' : '') +
            (scanOverlayFading ? ' create-save__preview-satellite-scan--fading-out' : '')
          }
          aria-hidden
        >
          <span key={overlayConnecting ? pendingGridKey : 'scan'} className="create-save__preview-satellite-grid" />
          {!overlayConnecting ? <span className="create-save__preview-satellite-beam" /> : null}
        </div>
      ) : null}
      {planetCaptionVisible && displayUrl ? (
        <div
          className={
            'create-save__preview-planet-caption' +
            (planetCaptionFading ? ' create-save__preview-planet-caption--fading' : '')
          }
          aria-live="polite"
        >
          <div className="create-save__preview-planet-caption-name">
            <span>{planetCaptionName}</span>
            {planetCaptionPhase === 'name' ? (
              <span className="create-save__preview-planet-caption-cursor" aria-hidden>
                ▌
              </span>
            ) : null}
          </div>
          {planetCaptionPhase !== 'name' || planetCaptionCoords ? (
            <div className="create-save__preview-planet-caption-coords">
              <span>{planetCaptionCoords}</span>
              {planetCaptionPhase === 'coords' ? (
                <span className="create-save__preview-planet-caption-cursor" aria-hidden>
                  ▌
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
},
);
