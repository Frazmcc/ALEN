import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  PanResponder,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { AppScreen } from '@/components/AppScreen';
import { colors } from '@/theme/colors';
import { BRIGHT_STARS } from '@/sky/catalog';
import {
  clamp,
  currentPlanetPositions,
  norm360,
  raDecToAltAz,
  skyPalette,
} from '@/sky/astronomy';
import { projectAltAz } from '@/sky/projection';
import { useObserverLocation } from '@/location/useObserverLocation';
import { useDevicePointing } from '@/orientation/useDevicePointing';
import { LocationControl } from '@/components/LocationControl';
import { SkyObjectCanvas } from '@/components/SkyObjectCanvas';
import {
  SkyLayersControl,
  type SkyLayers,
} from '@/components/SkyLayersControl';
import { LiveSatelliteCanvas } from '@/components/LiveSatelliteCanvas';
import { useLiveSatellites } from '@/live/useLiveSatellites';
import {
  activeSatelliteSources,
  defaultSatelliteGroupState,
  satelliteMatchesActiveGroups,
  type SatelliteGroupKey,
} from '@/live/satelliteGroups';
import { LiveAircraftCanvas } from '@/components/LiveAircraftCanvas';
import { useLiveAircraft } from '@/live/useLiveAircraft';
import {
  aircraftMatchesActiveGroup,
  defaultAircraftGroupState,
  type AircraftGroupKey,
} from '@/live/aircraftGroups';
import { SkyObjectSheet } from '@/components/SkyObjectSheet';
import {
  loadSkyPreferences,
  saveSkyPreferences,
} from '@/preferences/skyPreferences';
import {
  nearestSkySelection,
  resolveSelection,
  selectionKey,
  type SkySelection,
} from '@/live/liveSelection';

type Size = {
  width: number;
  height: number;
};

export default function SkyScreen() {
  const { targetKind, targetId } = useLocalSearchParams<{
    targetKind?: string;
    targetId?: string;
  }>();
  const [now, setNow] = useState(Date.now());
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [yaw, setYaw] = useState(180);
  const [pitch, setPitch] = useState(28);
  const [fov, setFov] = useState(105);
  const [layersOpen, setLayersOpen] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [satelliteGroups, setSatelliteGroups] = useState(
    defaultSatelliteGroupState,
  );
  const [selectedObject, setSelectedObject] = useState<SkySelection | null>(null);
  const [aircraftGroups, setAircraftGroups] = useState(
    defaultAircraftGroupState,
  );
  const [layers, setLayers] = useState<SkyLayers>({
    stars: true,
    constellations: true,
    planets: true,
    atmosphere: true,
    landscape: true,
    satellites: false,
    aircraft: false,
  });
  const gestureStart = useRef({ yaw: 180, pitch: 28, fov: 105 });
  const pinchStartDistance = useRef<number | null>(null);
  const appliedTarget = useRef<string | null>(null);
  const {
    observer,
    source,
    label: observerLabel,
    requesting,
    restoring,
    error: locationError,
    useCurrentLocation,
    useManualLocation,
    useDemoLocation,
  } = useObserverLocation();
  const satelliteSources = useMemo(
    () => activeSatelliteSources(satelliteGroups),
    [satelliteGroups],
  );
  const {
    tracks: satelliteTracks,
    status: satelliteStatus,
  } = useLiveSatellites(
    observer,
    layers.satellites,
    satelliteSources,
  );
  const visibleSatelliteTracks = useMemo(
    () =>
      satelliteTracks.filter((track) =>
        satelliteMatchesActiveGroups(track.groups, satelliteGroups),
      ),
    [satelliteGroups, satelliteTracks],
  );
  const {
    tracks: aircraftTracks,
    status: aircraftStatus,
  } = useLiveAircraft(observer, layers.aircraft);
  const visibleAircraftTracks = useMemo(
    () =>
      aircraftTracks.filter((track) =>
        aircraftMatchesActiveGroup(track, aircraftGroups),
      ),
    [aircraftGroups, aircraftTracks],
  );

  const {
    active: phoneAimActive,
    starting: phoneAimStarting,
    heading: phoneHeading,
    elevation: phoneElevation,
    headingAccuracy,
    usingTrueNorth,
    error: phoneAimError,
    start: startPhoneAim,
    stop: stopPhoneAim,
  } = useDevicePointing();

  useEffect(() => {
    let active = true;

    void loadSkyPreferences().then((preferences) => {
      if (!active) return;

      setSatelliteGroups(preferences.satelliteGroups);
      setAircraftGroups(preferences.aircraftGroups);
      setLayers((current) => ({
        ...current,
        stars: preferences.stars,
        constellations: preferences.constellations,
        planets: preferences.planets,
        atmosphere: preferences.atmosphere,
        landscape: preferences.landscape,
        // Privacy: live network layers always restart disabled.
        satellites: false,
        aircraft: false,
      }));
      setPreferencesReady(true);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;

    void saveSkyPreferences({
      layers,
      satelliteGroups,
      aircraftGroups,
    });
  }, [
    aircraftGroups,
    layers,
    preferencesReady,
    satelliteGroups,
  ]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!phoneAimActive) return;
    if (phoneHeading !== null) setYaw(phoneHeading);
    if (phoneElevation !== null) {
      setPitch(clamp(phoneElevation, 0, 84));
    }
  }, [phoneAimActive, phoneElevation, phoneHeading]);

  useEffect(() => {
    if (source !== 'device' && phoneAimActive) {
      stopPhoneAim();
    }
  }, [phoneAimActive, source, stopPhoneAim]);

  const planets = useMemo(
    () => currentPlanetPositions(now, observer),
    [now, observer],
  );

  const sun = planets.find((planet) => planet.id === 'sun');
  const palette = skyPalette(sun?.el ?? -18);

  const stars = useMemo(
    () =>
      BRIGHT_STARS.map((star) => ({
        ...star,
        ...raDecToAltAz(
          star.ra,
          star.dec,
          now,
          observer,
        ),
      })),
    [now, observer],
  );

  useEffect(() => {
    if (restoring || phoneAimActive || !targetId || !targetKind) return;

    const key = `${targetKind}:${targetId}`;
    if (appliedTarget.current === key) return;

    if (targetKind === 'star') {
      const star = BRIGHT_STARS.find((item) => item.id === targetId);
      if (!star) {
        appliedTarget.current = key;
        return;
      }

      const horizontal = raDecToAltAz(
        star.ra,
        star.dec,
        now,
        observer,
      );

      if (horizontal.el >= 0) {
        setYaw(horizontal.az);
        setPitch(clamp(horizontal.el, 0, 84));
      }

      appliedTarget.current = key;
      return;
    }

    if (targetKind === 'planet') {
      const planet = planets.find((item) => item.id === targetId);
      if (planet && planet.el >= 0) {
        setYaw(planet.az);
        setPitch(clamp(planet.el, 0, 84));
      }
      appliedTarget.current = key;
    }
  }, [
    now,
    observer,
    phoneAimActive,
    planets,
    restoring,
    targetId,
    targetKind,
  ]);

  const viewport = {
    ...size,
    yaw,
    pitch,
    fov,
  };

  const selectionContext = {
    nowMs: now,
    stars,
    planets,
    satelliteTracks: visibleSatelliteTracks,
    aircraftTracks: visibleAircraftTracks,
    observer,
    observerLabel,
    viewport,
    starVisibility: palette.stars,
    layers: {
      stars: layers.stars,
      planets: layers.planets,
      satellites: layers.satellites,
      aircraft: layers.aircraft,
    },
  };

  const resolvedSelection = selectedObject
    ? resolveSelection(selectedObject, selectionContext)
    : null;
  const selectedDetail = resolvedSelection?.detail ?? null;

  useEffect(() => {
    if (!selectedObject) return;
    if (
      selectedObject.kind !== 'satellite' &&
      selectedObject.kind !== 'aircraft'
    ) {
      return;
    }

    if (!resolvedSelection) {
      setSelectedObject(null);
    }
  }, [resolvedSelection, selectedObject]);

  const selectedStaticKind =
    selectedObject?.kind === 'star' || selectedObject?.kind === 'planet'
      ? selectedObject.kind
      : undefined;
  const activeTargetKind =
    selectedStaticKind ?? (selectedObject ? undefined : targetKind);
  const activeTargetId =
    selectedStaticKind ? selectedObject?.id : selectedObject ? undefined : targetId;


  const horizon = projectAltAz(yaw, 0, viewport);
  const horizonY = clamp(
    horizon?.y ?? size.height * 0.78,
    0,
    size.height,
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (event) =>
          event.nativeEvent.touches.length >= 2,
        onMoveShouldSetPanResponder: (event, gesture) =>
          event.nativeEvent.touches.length >= 2 ||
          (!phoneAimActive &&
            (Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2)),
        onPanResponderGrant: (event) => {
          gestureStart.current = { yaw, pitch, fov };

          if (event.nativeEvent.touches.length >= 2) {
            const [a, b] = event.nativeEvent.touches;
            pinchStartDistance.current = Math.hypot(
              b.pageX - a.pageX,
              b.pageY - a.pageY,
            );
          } else {
            pinchStartDistance.current = null;
          }
        },
        onPanResponderMove: (event, gesture) => {
          if (event.nativeEvent.touches.length >= 2) {
            const [a, b] = event.nativeEvent.touches;
            const distance = Math.hypot(
              b.pageX - a.pageX,
              b.pageY - a.pageY,
            );

            if (
              pinchStartDistance.current === null ||
              pinchStartDistance.current < 1
            ) {
              pinchStartDistance.current = distance;
              gestureStart.current.fov = fov;
              return;
            }

            const scale = distance / pinchStartDistance.current;
            setFov(
              clamp(
                gestureStart.current.fov / Math.max(scale, 0.2),
                35,
                130,
              ),
            );
            return;
          }

          pinchStartDistance.current = null;
          if (phoneAimActive) return;

          setYaw(
            norm360(gestureStart.current.yaw - gesture.dx * 0.22),
          );
          setPitch(
            clamp(
              gestureStart.current.pitch + gesture.dy * 0.12,
              0,
              84,
            ),
          );
        },
        onPanResponderRelease: () => {
          pinchStartDistance.current = null;
        },
        onPanResponderTerminate: () => {
          pinchStartDistance.current = null;
        },
      }),
    [fov, phoneAimActive, pitch, yaw],
  );

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  }

  function toggleAircraftGroup(group: AircraftGroupKey) {
    const next = {
      ...aircraftGroups,
      [group]: !aircraftGroups[group],
    };

    if (selectedObject?.kind === 'aircraft') {
      const selectedTrack = aircraftTracks.find(
        (track) => track.id === selectedObject.id,
      );

      if (
        selectedTrack &&
        !aircraftMatchesActiveGroup(selectedTrack, next)
      ) {
        setSelectedObject(null);
      }
    }

    setAircraftGroups(next);
  }

  function toggleSatelliteGroup(group: SatelliteGroupKey) {
    const next = {
      ...satelliteGroups,
      [group]: !satelliteGroups[group],
    };

    if (selectedObject?.kind === 'satellite') {
      const selectedTrack = satelliteTracks.find(
        (track) => track.id === selectedObject.id,
      );

      if (
        selectedTrack &&
        !satelliteMatchesActiveGroups(selectedTrack.groups, next)
      ) {
        setSelectedObject(null);
      }
    }

    setSatelliteGroups(next);
  }

  function toggleLayer(layer: keyof SkyLayers) {
    const selectedLayer =
      selectedObject?.kind === 'star'
        ? 'stars'
        : selectedObject?.kind === 'planet'
          ? 'planets'
          : selectedObject?.kind === 'satellite'
            ? 'satellites'
            : selectedObject?.kind === 'aircraft'
              ? 'aircraft'
              : null;

    if (layers[layer] && selectedLayer === layer) {
      setSelectedObject(null);
    }

    setLayers((current) => ({
      ...current,
      [layer]: !current[layer],
    }));
  }

  function selectObjectAt(x: number, y: number) {
    const nearest = nearestSkySelection(
      {
        ...selectionContext,
        nowMs: Date.now(),
      },
      x,
      y,
    );

    if (!nearest) {
      setSelectedObject(null);
      return;
    }

    if (
      selectedObject &&
      selectionKey(selectedObject) === selectionKey(nearest)
    ) {
      setSelectedObject(null);
      return;
    }

    setSelectedObject(nearest);
  }

  function centreSelectedObject() {
    if (!selectedObject) return;

    const resolved = resolveSelection(selectedObject, {
      ...selectionContext,
      nowMs: Date.now(),
    });
    if (!resolved) return;

    if (phoneAimActive) stopPhoneAim();
    setYaw(resolved.az);
    setPitch(clamp(resolved.el, 0, 84));
  }

  return (
    <AppScreen>
      <View
        onLayout={onLayout}
        {...panResponder.panHandlers}
        style={{ flex: 1, overflow: 'hidden', backgroundColor: palette.top }}
      >
        <SkyObjectCanvas
          stars={stars}
          planets={planets}
          viewport={viewport}
          starVisibility={palette.stars}
          showStars={layers.stars}
          showConstellations={layers.constellations}
          showPlanets={layers.planets}
          showAtmosphere={layers.atmosphere}
          showLandscape={layers.landscape}
          targetKind={activeTargetKind}
          targetId={activeTargetId}
          horizonY={horizonY}
          skyColors={{
            top: palette.top,
            middle: palette.middle,
            horizon: palette.horizon,
          }}
        />

        <LiveSatelliteCanvas
          tracks={visibleSatelliteTracks}
          viewport={viewport}
          visible={layers.satellites}
          selectedId={
            selectedObject?.kind === 'satellite'
              ? selectedObject.id
              : undefined
          }
        />
        <LiveAircraftCanvas
          tracks={visibleAircraftTracks}
          observer={observer}
          viewport={viewport}
          visible={layers.aircraft}
          selectedId={
            selectedObject?.kind === 'aircraft'
              ? selectedObject.id
              : undefined
          }
        />

        <Pressable
          accessible={false}
          onPress={(event) =>
            selectObjectAt(
              event.nativeEvent.locationX,
              event.nativeEvent.locationY,
            )
          }
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
          }}
        />

        {layers.stars ? stars
          .filter(
            (star) =>
              star.el >= 0 &&
              (star.mag <= 0.15 ||
                (activeTargetKind === 'star' && activeTargetId === star.id)),
          )
          .map((star) => {
            const point = projectAltAz(star.az, star.el, viewport);
            if (!point || palette.stars <= 0.02) return null;

            return (
              <Text
                key={`label-${star.id}`}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: point.x - 42,
                  top: point.y + 7,
                  width: 84,
                  color: '#eef6ff',
                  fontSize: 10,
                  textAlign: 'center',
                  textShadowColor: '#000',
                  textShadowRadius: 3,
                  opacity: clamp(palette.stars, 0, 1),
                }}
              >
                {star.name}
              </Text>
            );
          }) : null}

        {layers.planets ? planets
          .filter((planet) => planet.el >= 0)
          .map((planet) => {
            const point = projectAltAz(
              planet.az,
              planet.el,
              viewport,
            );
            if (!point) return null;

            return (
              <Text
                key={`label-${planet.id}`}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: point.x - 42,
                  top: point.y + 8,
                  width: 84,
                  color: '#ffffff',
                  fontSize: 11,
                  fontWeight: '600',
                  textAlign: 'center',
                  textShadowColor: '#000000',
                  textShadowRadius: 4,
                }}
              >
                {planet.name}
              </Text>
            );
          }) : null}

        <View
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            top: 16,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          <View
            style={{
              backgroundColor: 'rgba(9,18,33,0.86)',
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700' }}>
              Live Sky · M2
            </Text>
            <Text
              style={{
                color: colors.muted,
                fontSize: 11,
                marginTop: 2,
              }}
            >
              {new Date(now).toLocaleTimeString()}
            </Text>
          </View>

          <LocationControl
            observer={observer}
            source={source}
            label={observerLabel}
            requesting={requesting}
            restoring={restoring}
            error={locationError}
            onUseCurrent={useCurrentLocation}
            onUseManual={useManualLocation}
            onUseDemo={useDemoLocation}
          />
        </View>

        <SkyLayersControl
          open={layersOpen}
          layers={layers}
          onToggleOpen={() => setLayersOpen((open) => !open)}
          onToggleLayer={toggleLayer}
          satelliteSummary={
            satelliteStatus === 'live'
              ? `${visibleSatelliteTracks.length} visible · labels off`
              : satelliteStatus === 'loading'
                ? 'Loading live positions…'
                : satelliteStatus === 'stale'
                  ? `${visibleSatelliteTracks.length} cached · reconnecting`
                  : satelliteStatus === 'error'
                    ? 'Feed unavailable'
                    : 'Off · no location sent'
          }
          satelliteGroups={satelliteGroups}
          onToggleSatelliteGroup={toggleSatelliteGroup}
          aircraftGroups={aircraftGroups}
          onToggleAircraftGroup={toggleAircraftGroup}
          aircraftSummary={
            aircraftStatus === 'live'
              ? `${visibleAircraftTracks.length} nearby · labels off`
              : aircraftStatus === 'loading'
                ? 'Loading ADS-B positions…'
                : aircraftStatus === 'stale'
                  ? `${visibleAircraftTracks.length} cached · reconnecting`
                  : aircraftStatus === 'error'
                    ? 'Feed unavailable'
                    : 'Off · no location sent'
          }
        />

        {phoneAimError ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 18,
              right: 18,
              bottom: 78,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 14,
              backgroundColor: 'rgba(35,18,18,0.94)',
              borderWidth: 1,
              borderColor: colors.warning,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 11, lineHeight: 16 }}>
              {phoneAimError}
            </Text>
          </View>
        ) : null}

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 18,
            bottom: 18,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 14,
            backgroundColor: 'rgba(9,18,33,0.9)',
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>
            {Math.round(yaw)}° · {Math.round(pitch)}° elevation · {Math.round(fov)}° FOV
          </Text>
          <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>
            {phoneAimActive
              ? `${usingTrueNorth ? 'True' : 'Magnetic'} north · compass accuracy ${headingAccuracy ?? '—'}`
              : 'Drag to look · pinch to zoom'}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            phoneAimActive ? 'Turn off Aim with phone' : 'Turn on Aim with phone'
          }
          disabled={phoneAimStarting}
          onPress={phoneAimActive ? stopPhoneAim : startPhoneAim}
          style={{
            position: 'absolute',
            right: 18,
            bottom: 18,
            minHeight: 44,
            minWidth: 118,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 14,
            borderRadius: 14,
            backgroundColor: phoneAimActive
              ? 'rgba(24,72,52,0.94)'
              : 'rgba(9,18,33,0.94)',
            borderWidth: 1,
            borderColor: phoneAimActive ? colors.success : colors.border,
            opacity: phoneAimStarting ? 0.7 : 1,
          }}
        >
          <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>
            {phoneAimStarting
              ? 'Starting…'
              : phoneAimActive
                ? 'Phone aim ON'
                : 'Aim with phone'}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 9, marginTop: 2 }}>
            {phoneAimActive ? 'Tap for manual view' : 'Compass + motion'}
          </Text>
        </Pressable>
      </View>

      <SkyObjectSheet
        detail={selectedDetail}
        onClose={() => setSelectedObject(null)}
        onCentre={resolvedSelection ? centreSelectedObject : undefined}
      />
    </AppScreen>
  );
}
