import React from "react";
import { Award, Briefcase, GraduationCap } from "lucide-react";

type LegendItem = {
  key: "doctorado" | "universitario" | "no_universitario";
  label: string;
  hours: number;
  count: number;
  color: string;
};

const iconForKey = (key: LegendItem["key"]) => {
  switch (key) {
    case "doctorado":
      return Award;
    case "universitario":
      return GraduationCap;
    default:
      return Briefcase;
  }
};

interface AvailabilityLegendProps {
  items: LegendItem[];
}

export const AvailabilityLegend: React.FC<AvailabilityLegendProps> = ({ items }) => {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 16,
      }}
    >
      {items.map((item) => {
        const Icon = iconForKey(item.key);
        return (
          <div
            key={item.key}
            style={{
              background: "#f8fafc",
              borderRadius: 16,
              padding: 16,
              border: `1.5px solid ${item.color}55`,
              display: "flex",
              flexDirection: "column",
              gap: 8,
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `${item.color}22`,
                color: item.color,
              }}
            >
              <Icon size={18} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>
              {item.hours}
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{item.label}</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              {item.count} empleados
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AvailabilityLegend;
