import DOMPurify from "dompurify";
import type { ProvinceCatalogEntry, ProvinceContentRecord } from "../types";

interface InfoPanelProps {
  selectedProvince: ProvinceCatalogEntry | undefined;
  selectedContent: ProvinceContentRecord | undefined;
  onClose: () => void;
}

export function InfoPanel({
  selectedProvince,
  selectedContent,
  onClose
}: InfoPanelProps) {
  const sanitizedHtml = DOMPurify.sanitize(selectedContent?.bodyHtml ?? "");

  return (
    <aside className={`panel ${selectedProvince ? "panel-open" : ""}`}>
      <div className="panel-shell">
        <button className="panel-close" onClick={onClose} type="button">
          ×
        </button>

        <div className="panel-head">
          <h2 className="panel-title">
            {selectedProvince
              ? selectedContent?.title ?? selectedProvince.frenchName
              : "Provinces d’Afghanistan"}
          </h2>
          {selectedProvince ? (
            <p className="panel-subtitle">{`Capitale: ${selectedProvince.capitalName}`}</p>
          ) : null}
        </div>

        {selectedProvince && selectedContent ? (
          <div className="panel-body">
            <div
              className="rich-text"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          </div>
        ) : (
          <div className="panel-body">
            <p className="panel-intro panel-intro-strong">
              Sélectionnez une province sur la carte pour afficher sa fiche.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
