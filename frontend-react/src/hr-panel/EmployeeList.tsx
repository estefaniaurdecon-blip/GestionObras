import React from "react";
import { Award, Briefcase, GraduationCap } from "lucide-react";

export type Employee = {
  id: number;
  name: string;
  titulacion: "doctorado" | "universitario" | "no_universitario";
  available_hours: number;
  is_active: boolean;
  avatar?: string;
};

const iconForDegree = (degree: Employee["titulacion"]) => {
  switch (degree) {
    case "doctorado":
      return Award;
    case "universitario":
      return GraduationCap;
    default:
      return Briefcase;
  }
};

const labelForDegree = (degree: Employee["titulacion"]) => {
  switch (degree) {
    case "doctorado":
      return "Doctorado";
    case "universitario":
      return "Universitario";
    default:
      return "No universitario";
  }
};

const initialsForName = (name: string) => {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "??";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return `${first}${last}`.toUpperCase();
};

interface EmployeeListProps {
  employees: Employee[];
}

export const EmployeeList: React.FC<EmployeeListProps> = ({ employees }) => {
  return (
    <div
      style={{
        maxHeight: 360,
        overflowY: "auto",
        paddingRight: 6,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {employees.map((employee) => {
        const Icon = iconForDegree(employee.titulacion);
        const label = labelForDegree(employee.titulacion);
        const initials = employee.avatar || initialsForName(employee.name);
        return (
          <div
            key={employee.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              borderRadius: 16,
              background: "#f8fafc",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#eef2ff",
                  color: "#6366f1",
                  fontWeight: 700,
                }}
              >
                {initials}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: "#0f172a" }}>
                  {employee.name}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "#64748b",
                  }}
                >
                  <Icon size={14} />
                  {label}
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, color: "#6366f1" }}>
                {employee.available_hours}h
              </div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>disponibles</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default EmployeeList;
