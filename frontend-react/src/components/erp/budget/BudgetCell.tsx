import React from "react";
import { Input, Text } from "@chakra-ui/react";

import { formatEuroValue } from "../../../utils/erp/formatters";

export const EuroCell: React.FC<{
  value: number;
  color?: string;
  bold?: boolean;
}> = ({ value, color, bold = true }) => (
  <Text
    color={color ?? "green.700"}
    fontWeight={bold ? "semibold" : "normal"}
    fontFamily="mono"
    textAlign="center"
    whiteSpace="nowrap"
  >
    {formatEuroValue(value)}
  </Text>
);

export const BudgetNumberCell: React.FC<{
  value: number;
  onSubmit: (value: string) => void;
  isEditing: boolean;
  min?: number;
}> = ({ value, onSubmit, isEditing, min = 0 }) =>
  isEditing ? (
    <Input
      size="sm"
      type="text"
      inputMode="decimal"
      pattern="[0-9.,]*"
      defaultValue={value.toLocaleString("es-ES")}
      min={min}
      textAlign="center"
      onBlur={(e) => {
        const raw = e.target.value.trim();
        const normalized = raw.replace(/\./g, "").replace(",", ".");
        onSubmit(normalized === "" ? "0" : normalized);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const target = e.target as HTMLInputElement;
          const raw = target.value.trim();
          const normalized = raw.replace(/\./g, "").replace(",", ".");
          onSubmit(normalized === "" ? "0" : normalized);
        }
      }}
    />
  ) : (
    <EuroCell value={value} />
  );
