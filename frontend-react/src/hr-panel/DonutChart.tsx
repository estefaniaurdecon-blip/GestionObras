import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";

export type DonutSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

interface DonutChartProps {
  data: DonutSegment[];
  total: number;
  centerLabel: string;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  data,
  total,
  centerLabel,
}) => {
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);

  const segments = useMemo(() => {
    let offset = 0;
    return data.map((item) => {
      const percentage = total > 0 ? (item.value / total) * 100 : 0;
      const segment = { ...item, percentage, offset };
      offset += percentage;
      return segment;
    });
  }, [data, total]);

  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  return (
    <div style={{ position: "relative", width: 256, height: 256 }}>
      <svg
        viewBox="0 0 100 100"
        style={{ transform: "rotate(-90deg)", width: "100%", height: "100%" }}
      >
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={12}
        />
        {segments.map((segment, idx) => {
          const strokeDasharray = `${(segment.percentage / 100) * circumference} ${circumference}`;
          const strokeDashoffset = -((segment.offset / 100) * circumference);
          const isHovered = hoveredSegment === segment.key;

          return (
            <motion.circle
              key={segment.key}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={isHovered ? 16 : 12}
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              initial={{ strokeDasharray: `0 ${circumference}` }}
              animate={{ strokeDasharray }}
              transition={{ duration: 1, delay: idx * 0.1, ease: "easeOut" }}
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHoveredSegment(segment.key)}
              onMouseLeave={() => setHoveredSegment(null)}
            />
          );
        })}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ fontSize: 32, fontWeight: 800, color: "#0f172a" }}>
          {total}
        </div>
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
          {centerLabel}
        </div>
      </div>
    </div>
  );
};

export default DonutChart;
