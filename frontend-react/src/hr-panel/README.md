# HR Panel

Panel de disponibilidad de RRHH con gráfica de dona y lista de empleados.

## Uso rápido

```tsx
import { HRPanel, Employee } from "./hr-panel";

const employees: Employee[] = [
  {
    id: 1,
    name: "Ana Garcia",
    titulacion: "doctorado",
    available_hours: 160,
    is_active: true,
  },
];

export function App() {
  return <HRPanel employees={employees} />;
}
```

## Dependencias

- `framer-motion`
- `lucide-react`
