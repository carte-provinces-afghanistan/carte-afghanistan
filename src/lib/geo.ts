import { geoBounds, geoCentroid, geoMercator, geoPath } from "d3-geo";
import polylabel from "polylabel";
import type {
  Feature,
  FeatureCollection,
  Geometry,
  MultiPolygon,
  Polygon,
  Position
} from "geojson";
import type { ProvinceGeometryProperties } from "../types";

export const MAP_WIDTH = 900;
export const MAP_HEIGHT = 760;

export function normalizeProvinceCode(rawCode: string): string {
  return rawCode.replace("_", "-").toUpperCase();
}

function getRingArea(ring: Position[]) {
  let area = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[index + 1];
    area += x1 * y2 - x2 * y1;
  }

  return area / 2;
}

function rewindPolygonRings(coordinates: Polygon["coordinates"]) {
  return coordinates.map((ring, ringIndex) => {
    const shouldBeClockwise = ringIndex === 0;
    const isClockwise = getRingArea(ring) < 0;

    return shouldBeClockwise === isClockwise ? ring : [...ring].reverse();
  });
}

export function normalizeFeatureCollectionWinding(
  featureCollection: FeatureCollection<Geometry, ProvinceGeometryProperties>
): FeatureCollection<Geometry, ProvinceGeometryProperties> {
  return {
    ...featureCollection,
    features: featureCollection.features.map((feature) => {
      if (feature.geometry.type === "Polygon") {
        return {
          ...feature,
          geometry: {
            ...feature.geometry,
            coordinates: rewindPolygonRings(feature.geometry.coordinates)
          }
        };
      }

      if (feature.geometry.type === "MultiPolygon") {
        return {
          ...feature,
          geometry: {
            ...feature.geometry,
            coordinates: feature.geometry.coordinates.map((polygon) =>
              rewindPolygonRings(polygon)
            ) as MultiPolygon["coordinates"]
          }
        };
      }

      return feature;
    })
  };
}

export function createAfghanistanProjection(
  featureCollection: FeatureCollection<Geometry, ProvinceGeometryProperties>
) {
  return geoMercator().fitExtent(
    [
      [46, 24],
      [MAP_WIDTH - 46, MAP_HEIGHT - 32]
    ],
    featureCollection
  );
}

export function getFeatureId(feature: Feature<Geometry, ProvinceGeometryProperties>) {
  return normalizeProvinceCode(feature.properties.shapeISO);
}

export function getFeatureBounds(
  feature: Feature<Geometry, ProvinceGeometryProperties>
) {
  return geoBounds(feature);
}

export function getProjectedPath(
  projection: ReturnType<typeof createAfghanistanProjection>
) {
  return geoPath(projection);
}

export function getProjectedCentroid(
  feature: Feature<Geometry, ProvinceGeometryProperties>,
  projection: ReturnType<typeof createAfghanistanProjection>
): [number, number] {
  const path = getProjectedPath(projection);
  const centroid = path.centroid(feature);

  if (Number.isFinite(centroid[0]) && Number.isFinite(centroid[1])) {
    return centroid as [number, number];
  }

  const [longitude, latitude] = geoCentroid(feature);
  return projection([longitude, latitude]) as [number, number];
}

function projectRingToScreen(
  ring: Position[],
  projection: ReturnType<typeof createAfghanistanProjection>
) {
  return ring
    .map((position) =>
      projection([position[0] as number, position[1] as number]) as
        | [number, number]
        | null
    )
    .filter((point): point is [number, number] => point !== null);
}

function getProjectedPolygonLabelPoint(
  polygon: Polygon["coordinates"],
  projection: ReturnType<typeof createAfghanistanProjection>
) {
  const projectedPolygon = polygon
    .map((ring) => projectRingToScreen(ring, projection))
    .filter((ring) => ring.length >= 4);

  if (projectedPolygon.length === 0) {
    return null;
  }

  return polylabel(projectedPolygon, 0.8);
}

export function getProjectedPoleOfInaccessibility(
  feature: Feature<Geometry, ProvinceGeometryProperties>,
  projection: ReturnType<typeof createAfghanistanProjection>
): [number, number] {
  if (feature.geometry.type === "Polygon") {
    const candidate = getProjectedPolygonLabelPoint(feature.geometry.coordinates, projection);

    if (candidate) {
      return [candidate[0], candidate[1]];
    }
  }

  if (feature.geometry.type === "MultiPolygon") {
    const candidates = feature.geometry.coordinates
      .map((polygon) => getProjectedPolygonLabelPoint(polygon, projection))
      .filter((candidate): candidate is number[] & { distance: number } => candidate !== null);

    if (candidates.length > 0) {
      const bestCandidate = candidates.reduce((best, candidate) =>
        candidate.distance > best.distance ? candidate : best
      );

      return [bestCandidate[0], bestCandidate[1]];
    }
  }

  return getProjectedCentroid(feature, projection);
}
