import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";
import afghanistanProvincesRaw from "../assets/geo/afghanistan-provinces.geojson?raw";
import disputedBoundariesUrl from "../assets/geo/disputed-boundaries.geojson?url";
import neighbourCountriesUrl from "../assets/geo/neighbour-countries.geojson?url";
import { getProvinceCities } from "../data/cities";
import { provinceCatalogByCode } from "../data/provinceCatalog";
import {
  createAfghanistanProjection,
  getFeatureId,
  getProjectedPoleOfInaccessibility,
  getProjectedPath,
  MAP_HEIGHT,
  MAP_WIDTH,
  normalizeFeatureCollectionWinding
} from "../lib/geo";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import type { ProvinceGeometryProperties } from "../types";

interface MapViewProps {
  selectedCode?: string;
  onSelectProvince: (provinceCode: string) => void;
}

type ProvinceFeature = Feature<Geometry, ProvinceGeometryProperties>;

type NeighbourCountryProperties = {
  iso3: string;
  nameFr?: string;
};

type DisputedBoundaryProperties = {
  name: string;
  note: string;
};

type CityMarker = {
  key: string;
  name: string;
  point: [number, number];
  labelOffset: [number, number];
};

type MapTransform = {
  scale: number;
  x: number;
  y: number;
};

type TrackedPointer = {
  clientX: number;
  clientY: number;
};

type GestureState = {
  lastCentroid: [number, number] | null;
  lastDistance: number | null;
};

const minMobileScale = 1;
const maxMobileScale = 6;
const mobileViewBoxY = 24;
const mobileViewBoxHeight = MAP_HEIGHT - mobileViewBoxY - 32;

const featureCollection = normalizeFeatureCollectionWinding(
  JSON.parse(afghanistanProvincesRaw) as FeatureCollection<
    Geometry,
    ProvinceGeometryProperties
  >
);

function toScreenPoint(
  position: Position,
  projection: ReturnType<typeof createAfghanistanProjection>
) {
  return projection([position[0] as number, position[1] as number]) as [number, number];
}

function getCityLabelOffset(cityIndex: number, isCapital: boolean): [number, number] {
  const staggeredOffsets: [number, number][] = [
    [14, -14],
    [14, 22],
    [-14, -16]
  ];

  if (isCapital) {
    return [16, -16];
  }

  return staggeredOffsets[cityIndex] ?? [14, 22];
}

function isMobileMapViewport() {
  return window.matchMedia("(max-width: 860px)").matches;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampTransform(transform: MapTransform): MapTransform {
  const scale = clamp(transform.scale, minMobileScale, maxMobileScale);

  if (scale <= minMobileScale) {
    return {
      scale: minMobileScale,
      x: 0,
      y: 0
    };
  }

  return {
    scale,
    x: clamp(transform.x, MAP_WIDTH - MAP_WIDTH * scale, 0),
    y: clamp(
      transform.y,
      mobileViewBoxY + mobileViewBoxHeight - MAP_HEIGHT * scale,
      mobileViewBoxY
    )
  };
}

function getCentroid(points: TrackedPointer[]): [number, number] {
  const total = points.reduce(
    (sum, point) => [sum[0] + point.clientX, sum[1] + point.clientY],
    [0, 0]
  );

  return [total[0] / points.length, total[1] / points.length];
}

function getDistance(first: TrackedPointer, second: TrackedPointer) {
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
}

function getSvgPoint(
  eventTarget: SVGSVGElement,
  clientX: number,
  clientY: number
): [number, number] {
  const screenMatrix = eventTarget.getScreenCTM();

  if (screenMatrix) {
    const point = eventTarget.createSVGPoint();
    point.x = clientX;
    point.y = clientY;

    const transformedPoint = point.matrixTransform(screenMatrix.inverse());
    return [transformedPoint.x, transformedPoint.y];
  }

  const bounds = eventTarget.getBoundingClientRect();
  const viewBox = eventTarget.viewBox.baseVal;
  const scaleX = viewBox.width / bounds.width;
  const scaleY = viewBox.height / bounds.height;

  return [
    viewBox.x + (clientX - bounds.left) * scaleX,
    viewBox.y + (clientY - bounds.top) * scaleY
  ];
}

const neighbourLabelAnchors: Record<string, [number, number]> = {
  IRN: [60.3, 32.4],
  TKM: [62.7, 37.8],
  UZB: [66.8, 38.7],
  TJK: [70.3, 38.7],
  CHN: [74.9, 38.85],
  PAK: [68.9, 29.9]
};

const neighbourLabelOffsets: Partial<Record<string, [number, number]>> = {
  IRN: [-3, 0]
};

const provinceLabelOffsets: Partial<Record<string, [number, number]>> = {
  "AF-NUR": [20, 0]
};

export function MapView({ selectedCode, onSelectProvince }: MapViewProps) {
  const provinceLabelLineHeight = 13;
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window === "undefined" ? false : isMobileMapViewport()
  );
  const [mapTransform, setMapTransform] = useState<MapTransform>({
    scale: minMobileScale,
    x: 0,
    y: 0
  });
  const [neighbourCountryCollection, setNeighbourCountryCollection] =
    useState<FeatureCollection<Geometry, NeighbourCountryProperties> | null>(null);
  const [disputedBoundaryCollection, setDisputedBoundaryCollection] =
    useState<FeatureCollection<Geometry, DisputedBoundaryProperties> | null>(null);
  const mapTransformRef = useRef(mapTransform);
  const pointersRef = useRef(new Map<number, TrackedPointer>());
  const gestureRef = useRef<GestureState>({
    lastCentroid: null,
    lastDistance: null
  });
  const hasMovedRef = useRef(false);
  const suppressClickRef = useRef(false);

  const projection = useMemo(
    () => createAfghanistanProjection(featureCollection),
    []
  );

  const path = useMemo(() => getProjectedPath(projection), [projection]);

  const provinceFeatures = useMemo(() => {
    return featureCollection.features.map((feature) => {
      const code = getFeatureId(feature);
      const province = provinceCatalogByCode.get(code);
      const labelAnchor = getProjectedPoleOfInaccessibility(feature, projection);
      const labelOffset = provinceLabelOffsets[code] ?? [0, 0];

      return {
        feature,
        code,
        province,
        labelAnchor: [
          labelAnchor[0] + labelOffset[0],
          labelAnchor[1] + labelOffset[1]
        ] as [number, number]
      };
    });
  }, [projection]);

  const neighbourCountryFeatures = useMemo(() => {
    return (neighbourCountryCollection?.features ?? []).map((feature) => {
      const labelAnchor = neighbourLabelAnchors[feature.properties.iso3];
      const labelOffset = neighbourLabelOffsets[feature.properties.iso3] ?? [0, 0];
      const projectedPoint =
        feature.properties.nameFr && labelAnchor
          ? toScreenPoint(labelAnchor, projection)
          : null;

      return {
        feature,
        labelPoint: projectedPoint
          ? ([
              projectedPoint[0] + labelOffset[0],
              projectedPoint[1] + labelOffset[1]
            ] as [number, number])
          : null
      };
    });
  }, [neighbourCountryCollection, projection]);

  const disputedBoundaryFeatures = useMemo(
    () => disputedBoundaryCollection?.features ?? [],
    [disputedBoundaryCollection]
  );

  const selectedProvince = provinceFeatures.find(
    (province) => province.code === selectedCode
  );

  const selectedProvinceCities: CityMarker[] = selectedCode
    ? getProvinceCities(selectedCode).map((city, index) => ({
        key: `${city.provinceCode}-${city.name}`,
        name: city.name,
        point: toScreenPoint([city.longitude, city.latitude], projection),
        labelOffset: getCityLabelOffset(
          index,
          city.capital === "primary" || city.capital === "admin"
        )
      }))
    : [];

  function resetMobileTransform() {
    const resetTransform = {
      scale: minMobileScale,
      x: 0,
      y: 0
    };

    pointersRef.current.clear();
    resetGesture();
    mapTransformRef.current = resetTransform;
    setMapTransform(resetTransform);
  }

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 860px)");

    function handleViewportChange(event: MediaQueryListEvent) {
      setIsMobileViewport(event.matches);

      if (!event.matches) {
        resetMobileTransform();
      }
    }

    setIsMobileViewport(mobileQuery.matches);

    if (!mobileQuery.matches) {
      resetMobileTransform();
    }

    mobileQuery.addEventListener("change", handleViewportChange);

    return () => {
      mobileQuery.removeEventListener("change", handleViewportChange);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    void fetch(neighbourCountriesUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Impossible de charger les pays voisins (${response.status}).`);
        }

        return response.json() as Promise<
          FeatureCollection<Geometry, NeighbourCountryProperties>
        >;
      })
      .then((data) => {
        if (isMounted) {
          setNeighbourCountryCollection(data);
        }
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    void fetch(disputedBoundariesUrl)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Impossible de charger les frontières contestées (${response.status}).`);
        }

        return response.json() as Promise<
          FeatureCollection<Geometry, DisputedBoundaryProperties>
        >;
      })
      .then((data) => {
        if (isMounted) {
          setDisputedBoundaryCollection(data);
        }
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function updateMobileTransform(nextTransform: MapTransform) {
    const clamped = clampTransform(nextTransform);
    mapTransformRef.current = clamped;
    setMapTransform(clamped);
  }

  function resetGesture() {
    gestureRef.current = {
      lastCentroid: null,
      lastDistance: null
    };
  }

  function handlePointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!isMobileMapViewport()) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY
    });
    hasMovedRef.current = false;

    const pointers = [...pointersRef.current.values()];
    gestureRef.current = {
      lastCentroid: getCentroid(pointers),
      lastDistance: pointers.length >= 2 ? getDistance(pointers[0], pointers[1]) : null
    };
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!isMobileMapViewport() || !pointersRef.current.has(event.pointerId)) {
      return;
    }

    pointersRef.current.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY
    });

    const pointers = [...pointersRef.current.values()];
    const nextCentroid = getCentroid(pointers);
    const gesture = gestureRef.current;

    if (!gesture.lastCentroid) {
      gestureRef.current.lastCentroid = nextCentroid;
      return;
    }

    const previousSvgCentroid = getSvgPoint(
      event.currentTarget,
      gesture.lastCentroid[0],
      gesture.lastCentroid[1]
    );
    const nextSvgCentroid = getSvgPoint(
      event.currentTarget,
      nextCentroid[0],
      nextCentroid[1]
    );
    const svgDeltaX = nextSvgCentroid[0] - previousSvgCentroid[0];
    const svgDeltaY = nextSvgCentroid[1] - previousSvgCentroid[1];

    if (Math.hypot(svgDeltaX, svgDeltaY) > 1.5) {
      hasMovedRef.current = true;
    }

    let nextTransform: MapTransform = {
      ...mapTransformRef.current,
      x: mapTransformRef.current.x + svgDeltaX,
      y: mapTransformRef.current.y + svgDeltaY
    };

    if (pointers.length >= 2) {
      const nextDistance = getDistance(pointers[0], pointers[1]);

      if (gesture.lastDistance && nextDistance > 0) {
        const scaleRatio = nextDistance / gesture.lastDistance;
        const nextScale = clamp(
          mapTransformRef.current.scale * scaleRatio,
          minMobileScale,
          maxMobileScale
        );
        const svgCentroid = getSvgPoint(
          event.currentTarget,
          nextCentroid[0],
          nextCentroid[1]
        );
        const contentX =
          (svgCentroid[0] - mapTransformRef.current.x) /
          mapTransformRef.current.scale;
        const contentY =
          (svgCentroid[1] - mapTransformRef.current.y) /
          mapTransformRef.current.scale;

        nextTransform = {
          scale: nextScale,
          x: svgCentroid[0] - contentX * nextScale + svgDeltaX,
          y: svgCentroid[1] - contentY * nextScale + svgDeltaY
        };
      }

      gestureRef.current.lastDistance = nextDistance;
      hasMovedRef.current = true;
    }

    gestureRef.current.lastCentroid = nextCentroid;
    updateMobileTransform(nextTransform);
  }

  function handlePointerEnd(event: PointerEvent<SVGSVGElement>) {
    if (!isMobileMapViewport()) {
      return;
    }

    pointersRef.current.delete(event.pointerId);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const remainingPointers = [...pointersRef.current.values()];

    if (remainingPointers.length === 0) {
      resetGesture();

      if (hasMovedRef.current) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 80);
      }

      return;
    }

    gestureRef.current = {
      lastCentroid: getCentroid(remainingPointers),
      lastDistance:
        remainingPointers.length >= 2
          ? getDistance(remainingPointers[0], remainingPointers[1])
          : null
    };
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>) {
    if (!isMobileMapViewport()) {
      return;
    }

    event.preventDefault();

    const nextScale = clamp(
      mapTransformRef.current.scale * (event.deltaY < 0 ? 1.16 : 0.86),
      minMobileScale,
      maxMobileScale
    );
    const svgPoint = getSvgPoint(event.currentTarget, event.clientX, event.clientY);
    const contentX =
      (svgPoint[0] - mapTransformRef.current.x) / mapTransformRef.current.scale;
    const contentY =
      (svgPoint[1] - mapTransformRef.current.y) / mapTransformRef.current.scale;

    updateMobileTransform({
      scale: nextScale,
      x: svgPoint[0] - contentX * nextScale,
      y: svgPoint[1] - contentY * nextScale
    });
  }

  return (
    <section className="map-card">
      <div className="map-frame">
        <svg
          aria-label="Carte interactive des provinces d’Afghanistan"
          className="map-svg"
          viewBox={
            isMobileViewport
              ? `0 ${mobileViewBoxY} ${MAP_WIDTH} ${mobileViewBoxHeight}`
              : `0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`
          }
          preserveAspectRatio="xMidYMid meet"
          role="img"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onWheel={handleWheel}
        >
          <defs>
            <linearGradient id="mapWash" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fefcf6" />
              <stop offset="100%" stopColor="#eef5ef" />
            </linearGradient>
            <filter id="panelShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow
                dx="0"
                dy="18"
                stdDeviation="24"
                floodColor="#002816"
                floodOpacity="0.14"
              />
            </filter>
            <clipPath id="mobileMapCrop">
              <rect
                x="0"
                y={mobileViewBoxY}
                width={MAP_WIDTH}
                height={mobileViewBoxHeight}
              />
            </clipPath>
          </defs>

          <g
            className="map-content"
            clipPath={isMobileViewport ? "url(#mobileMapCrop)" : undefined}
            transform={`translate(${mapTransform.x} ${mapTransform.y}) scale(${mapTransform.scale})`}
          >
            <rect
              className="map-bg"
              width={MAP_WIDTH}
              height={MAP_HEIGHT}
              rx="32"
              onClick={() => {
                if (suppressClickRef.current) {
                  return;
                }

                if (selectedCode) {
                  onSelectProvince("");
                }
              }}
            />

            <g className="neighbour-layer">
              {neighbourCountryFeatures.map(({ feature }) => (
                <path
                  key={feature.properties.iso3}
                  className="neighbour-country"
                  d={path(feature) ?? ""}
                />
              ))}
              {neighbourCountryFeatures.map(({ feature, labelPoint }) =>
                feature.properties.nameFr && labelPoint ? (
                  <text
                    key={`${feature.properties.iso3}-label`}
                    className="neighbour-label"
                    x={labelPoint[0]}
                    y={labelPoint[1]}
                  >
                    {feature.properties.nameFr}
                  </text>
                ) : null
              )}
            </g>

            {provinceFeatures.map(({ feature, code }) => {
              const province = provinceCatalogByCode.get(code);
              const isSelected = code === selectedCode;
              const isDimmed = Boolean(selectedCode) && !isSelected;

              return (
                <path
                  key={code}
                  className={[
                    "province-shape",
                    isSelected ? "province-selected" : "",
                    isDimmed ? "province-dimmed" : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  d={path(feature) ?? ""}
                  onClick={(event) => {
                    event.stopPropagation();

                    if (suppressClickRef.current) {
                      return;
                    }

                    onSelectProvince(code);
                  }}
                  role="button"
                  aria-label={`Afficher la province ${province?.frenchName ?? code}`}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectProvince(code);
                    }
                  }}
                />
              );
            })}

            <g className="disputed-boundary-layer">
              {disputedBoundaryFeatures.map((feature, index) => (
                <g key={`${feature.properties.name}-${index}`}>
                  <path
                    className="disputed-boundary-casing"
                    d={path(feature) ?? ""}
                  />
                  <path
                    className="disputed-boundary"
                    d={path(feature) ?? ""}
                  />
                </g>
              ))}
            </g>

            {!selectedProvince
              ? provinceFeatures
                  .filter((province) => province.province)
                  .map((province) => (
                  <text
                    key={province.code}
                    className="province-label"
                    x={province.labelAnchor[0]}
                  >
                    {province.province!.labelLines.map((line, index) => (
                      <tspan
                        key={line}
                        x={province.labelAnchor[0]}
                        y={
                          province.labelAnchor[1] +
                          (index - (province.province!.labelLines.length - 1) / 2) *
                            provinceLabelLineHeight
                        }
                        dominantBaseline="middle"
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                ))
              : null}

            {selectedProvinceCities.map((city) => (
              <g key={city.key} className="city-marker">
                <circle cx={city.point[0]} cy={city.point[1]} r="7.5" filter="url(#panelShadow)" />
                <circle
                  className="city-marker-inner"
                  cx={city.point[0]}
                  cy={city.point[1]}
                  r="4"
                />
                <line
                  x1={city.point[0]}
                  y1={city.point[1]}
                  x2={city.point[0] + city.labelOffset[0] - 5}
                  y2={city.point[1] + city.labelOffset[1] + 5}
                />
                <text
                  x={city.point[0] + city.labelOffset[0]}
                  y={
                    city.point[1] +
                    city.labelOffset[1] +
                    (city.labelOffset[1] > 0 ? 11 : 0)
                  }
                >
                  {city.name}
                </text>
              </g>
            ))}
          </g>

        </svg>
      </div>
    </section>
  );
}
