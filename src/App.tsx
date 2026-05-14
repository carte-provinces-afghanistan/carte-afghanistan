import { useMemo, useState } from "react";
import { InfoPanel } from "./components/InfoPanel";
import { MapView } from "./components/MapView";
import { provinceCatalogByCode } from "./data/provinceCatalog";
import { provinceContent } from "./services/contentService";

function App() {
  const [selectedCode, setSelectedCode] = useState<string>("");

  const contentByCode = useMemo(
    () => new Map(provinceContent.map((item) => [item.code, item])),
    []
  );

  const selectedProvince = selectedCode
    ? provinceCatalogByCode.get(selectedCode)
    : undefined;
  const selectedContent = selectedCode ? contentByCode.get(selectedCode) : undefined;

  return (
    <div className="app-shell">
      <div className="hero">
        <div className="hero-copy">
          <p className="hero-kicker">Afghanistan</p>
          <h1 className="hero-title">Carte narrative des provinces</h1>
        </div>
      </div>

      <main className="layout">
        <MapView selectedCode={selectedCode} onSelectProvince={setSelectedCode} />
        <InfoPanel
          onClose={() => setSelectedCode("")}
          selectedContent={selectedContent}
          selectedProvince={selectedProvince}
        />
      </main>
    </div>
  );
}

export default App;
