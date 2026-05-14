export type ProvinceCode = string;

export interface ProvinceGeometryProperties {
  shapeName: string;
  shapeISO: string;
  shapeID: string;
  shapeGroup: string;
  shapeType: string;
}

export interface ProvinceCatalogEntry {
  code: ProvinceCode;
  englishName: string;
  frenchName: string;
  capitalName: string;
  labelLines: string[];
  featuredAtCountryLevel?: boolean;
}

export interface ProvinceContentRecord {
  code: ProvinceCode;
  frenchName: string;
  title: string;
  bodyHtml: string;
  sourcePath: string;
}

export interface CityRecord {
  name: string;
  provinceCode: ProvinceCode;
  latitude: number;
  longitude: number;
  capital: "primary" | "admin" | "minor" | "";
  population?: number;
  populationProper?: number;
}
