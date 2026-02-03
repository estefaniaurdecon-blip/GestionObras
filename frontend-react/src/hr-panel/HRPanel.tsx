import React, { useMemo, useState } from "react";
import DonutChart, { DonutSegment } from "./DonutChart";
import EmployeeList, { Employee } from "./EmployeeList";
import AvailabilityLegend from "./AvailabilityLegend";

const COLORS = ["#6366f1", "#8b5cf6", "#06b6d4"];

const degreeLabels: Record<Employee["titulacion"], string> = {
  doctorado: "Doctorado",
  universitario: "Universitario",
  no_universitario: "No universitario",
};

interface HRPanelProps {
  employees: Employee[];
  loading?: boolean;
}

export const HRPanel: React.FC<HRPanelProps> = ({ employees, loading }) => {
  const [selectedDegree, setSelectedDegree] = useState<"all" | Employee["titulacion"]>("all");

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.is_active),
    [employees],
  );

  const filteredEmployees = useMemo(() => {
    if (selectedDegree === "all") return activeEmployees;
    return activeEmployees.filter((employee) => employee.titulacion === selectedDegree);
  }, [activeEmployees, selectedDegree]);

  const grouped = useMemo(() => {
    const base = {
      doctorado: { hours: 0, count: 0 },
      universitario: { hours: 0, count: 0 },
      no_universitario: { hours: 0, count: 0 },
    };
    activeEmployees.forEach((employee) => {
      if (!base[employee.titulacion]) return;
      base[employee.titulacion].hours += employee.available_hours;
      base[employee.titulacion].count += 1;
    });
    return base;
  }, [activeEmployees]);

  const totalHours = useMemo(() => {
    if (selectedDegree === "all") {
      return Object.values(grouped).reduce((acc, item) => acc + item.hours, 0);
    }
    return grouped[selectedDegree]?.hours ?? 0;
  }, [grouped, selectedDegree]);

  const donutData = useMemo<DonutSegment[]>(() => {
    const items: Array<DonutSegment> = [
      {
        key: "doctorado",
        label: degreeLabels.doctorado,
        value: grouped.doctorado.hours,
        color: COLORS[0],
      },
      {
        key: "universitario",
        label: degreeLabels.universitario,
        value: grouped.universitario.hours,
        color: COLORS[1],
      },
      {
        key: "no_universitario",
        label: degreeLabels.no_universitario,
        value: grouped.no_universitario.hours,
        color: COLORS[2],
      },
    ];
    if (selectedDegree === "all") return items;
    return items.filter((item) => item.key === selectedDegree);
  }, [grouped, selectedDegree]);

  const legendItems = useMemo(
    () => [
      {
        key: "doctorado" as const,
        label: degreeLabels.doctorado,
        hours: grouped.doctorado.hours,
        count: grouped.doctorado.count,
        color: COLORS[0],
      },
      {
        key: "universitario" as const,
        label: degreeLabels.universitario,
        hours: grouped.universitario.hours,
        count: grouped.universitario.count,
        color: COLORS[1],
      },
      {
        key: "no_universitario" as const,
        label: degreeLabels.no_universitario,
        hours: grouped.no_universitario.hours,
        count: grouped.no_universitario.count,
        color: COLORS[2],
      },
    ],
    [grouped],
  );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: 20,
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: 20,
          padding: 24,
          boxShadow: "0 20px 40px rgba(15, 23, 42, 0.08)",
          border: "1px solid #e2e8f0",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#0f172a" }}>
              Disponibilidad de RRHH
            </div>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              Horas disponibles por titulación
            </div>
          </div>
          <select
            value={selectedDegree}
            onChange={(event) => setSelectedDegree(event.target.value as any)}
            style={{
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              padding: "8px 12px",
              fontSize: 13,
              color: "#0f172a",
              background: "#f8fafc",
            }}
          >
            <option value="all">Todas</option>
            <option value="doctorado">Doctorado</option>
            <option value="universitario">Universitario</option>
            <option value="no_universitario">No universitario</option>
          </select>
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <DonutChart data={donutData} total={totalHours} centerLabel="horas" />
        </div>

        <AvailabilityLegend items={legendItems} />
      </div>

      <div
        style={{
          background: "#ffffff",
          borderRadius: 20,
          padding: 24,
          boxShadow: "0 20px 40px rgba(15, 23, 42, 0.08)",
          border: "1px solid #e2e8f0",
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 18, color: "#0f172a" }}>
            Equipo
          </div>
          <div style={{ fontSize: 13, color: "#64748b" }}>
            {activeEmployees.length} empleados activos
          </div>
        </div>
        {loading ? (
          <div style={{ fontSize: 13, color: "#64748b" }}>Cargando equipo...</div>
        ) : (
          <EmployeeList employees={filteredEmployees} />
        )}
      </div>
    </div>
  );
};

export default HRPanel;
