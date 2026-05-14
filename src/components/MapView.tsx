import { useMemo } from "react";
import afghanistanProvincesRaw from "../assets/geo/afghanistan-provinces.geojson?raw";
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

type CityMarker = {
  key: string;
  name: string;
  point: [number, number];
  labelOffset: [number, number];
};

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

export function MapView({ selectedCode, onSelectProvince }: MapViewProps) {
  const provinceLabelLineHeight = 13;

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

      return {
        feature,
        code,
        province,
        labelAnchor
      };
    });
  }, [projection]);

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

  return (
    <section className="map-card">
      <div className="map-frame">
        <svg
          aria-label="Carte interactive des provinces d’Afghanistan"
          className="map-svg"
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          role="img"
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
          </defs>

          <rect
            className="map-bg"
            width={MAP_WIDTH}
            height={MAP_HEIGHT}
            rx="32"
            onClick={() => {
              if (selectedCode) {
                onSelectProvince("");
              }
            }}
          />

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

          {selectedProvince && selectedProvince.province ? (
            <g className="focus-label">
              <text x={MAP_WIDTH / 2} y={56}>
                {selectedProvince.province.frenchName}
              </text>
            </g>
          ) : null}

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
        </svg>
      </div>
    </section>
  );
}
