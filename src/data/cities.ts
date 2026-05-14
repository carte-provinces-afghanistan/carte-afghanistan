import afCitiesRaw from "../assets/af.csv?raw";
import { provinceCatalog } from "./provinceCatalog";
import type { CityRecord, ProvinceCode } from "../types";

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase();
}

const provinceAliases: Record<string, ProvinceCode> = {
  badakhshan: "AF-BDN",
  badghis: "AF-BDG",
  baghlan: "AF-BGL",
  balkh: "AF-BAL",
  bamyan: "AF-BAM",
  daykundi: "AF-DAY",
  daikundi: "AF-DAY",
  farah: "AF-FRA",
  faryab: "AF-FYB",
  ghazni: "AF-GHA",
  ghor: "AF-GHO",
  herat: "AF-HER",
  helmand: "AF-HEL",
  jowzjan: "AF-JOW",
  jawzjan: "AF-JOW",
  kabul: "AF-KAB",
  kandahar: "AF-KAN",
  kapisa: "AF-KAP",
  khost: "AF-KHO",
  kunar: "AF-KNR",
  kunarh: "AF-KNR",
  kunduz: "AF-KDZ",
  laghman: "AF-LAG",
  logar: "AF-LOG",
  nangarhar: "AF-NAN",
  nimroz: "AF-NIM",
  nuristan: "AF-NUR",
  paktia: "AF-PIA",
  paktiya: "AF-PIA",
  paktika: "AF-PKA",
  panjshir: "AF-PAN",
  parwan: "AF-PAR",
  samangan: "AF-SAM",
  sarepol: "AF-SAR",
  sarepul: "AF-SAR",
  takhar: "AF-TAK",
  uruzgan: "AF-URU",
  uruzgān: "AF-URU",
  wardak: "AF-WAR",
  zabul: "AF-ZAB"
};

for (const province of provinceCatalog) {
  provinceAliases[normalizeText(province.englishName)] = province.code;
  provinceAliases[normalizeText(province.frenchName)] = province.code;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function toNumber(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toProvinceCode(adminName: string) {
  return provinceAliases[normalizeText(adminName)];
}

const rows = afCitiesRaw
  .trim()
  .split(/\r?\n/)
  .map(parseCsvLine);

const header = rows[0];
const bodyRows = rows.slice(1);

function getCell(row: string[], columnName: string) {
  return row[header.indexOf(columnName)] ?? "";
}

const parsedCityRecords = bodyRows
  .map((row): CityRecord | null => {
    const provinceCode = toProvinceCode(getCell(row, "admin_name"));

    if (!provinceCode) {
      return null;
    }

    return {
      name: getCell(row, "city"),
      provinceCode,
      latitude: Number(getCell(row, "lat")),
      longitude: Number(getCell(row, "lng")),
      capital: (getCell(row, "capital") as CityRecord["capital"]) ?? "",
      population: toNumber(getCell(row, "population")),
      populationProper: toNumber(getCell(row, "population_proper"))
    };
  })
  .filter((city): city is CityRecord => city !== null);

export const cityRecords: CityRecord[] = parsedCityRecords;

export function getFeaturedCountryCities() {
  return [...cityRecords]
    .filter((city) => city.capital === "primary" || city.capital === "admin")
    .sort((left, right) => (right.population ?? 0) - (left.population ?? 0))
    .slice(0, 5);
}

export function getProvinceCities(provinceCode: ProvinceCode) {
  const cities = cityRecords
    .filter((city) => city.provinceCode === provinceCode)
    .sort((left, right) => {
      const capitalRank = { primary: 0, admin: 1, minor: 2, "": 3 };
      const rankDelta = capitalRank[left.capital] - capitalRank[right.capital];

      if (rankDelta !== 0) {
        return rankDelta;
      }

      return (right.population ?? 0) - (left.population ?? 0);
    });

  if (cities.length <= 2) {
    return cities;
  }

  const selected: CityRecord[] = [];
  const capital = cities.find(
    (city) => city.capital === "primary" || city.capital === "admin"
  );

  if (capital) {
    selected.push(capital);
  }

  const additional = cities.filter(
    (city) =>
      city !== capital &&
      city.capital !== "minor" &&
      (city.population ?? 0) >= 50000
  );

  if (additional.length > 0) {
    selected.push(...additional.slice(0, 2));
  } else {
    selected.push(...cities.filter((city) => city !== capital).slice(0, 1));
  }

  return selected;
}
