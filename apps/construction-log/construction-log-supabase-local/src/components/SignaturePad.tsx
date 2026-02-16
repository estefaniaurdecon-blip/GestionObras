import { useRef, useState, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Check, Eraser } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SignaturePadProps {
  value?: string;
  onChange: (signature: string) => void;
  label: string;
  disabled?: boolean;
}

export const SignaturePad = ({ value, onChange, label, disabled = false }: SignaturePadProps) => {
  const { t } = useTranslation();
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [isLoadedFromValue, setIsLoadedFromValue] = useState(false);

  const clearSignature = () => {
    sigCanvas.current?.clear();
    setIsEmpty(true);
    setIsLoadedFromValue(false);
    onChange("");
  };

  const saveSignature = () => {
    if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
      const dataUrl = sigCanvas.current.toDataURL();
      onChange(dataUrl);
      setIsEmpty(false);
      setIsLoadedFromValue(true);
    }
  };

  const handleBeginStroke = () => {
    setIsEmpty(false);
    setIsLoadedFromValue(false);
  };

  // Cargar firma existente cuando se monta el componente o cambia el value solo si no se ha cargado ya
  useEffect(() => {
    if (value && sigCanvas.current && !isLoadedFromValue) {
      try {
        sigCanvas.current.fromDataURL(value);
        setIsEmpty(false);
        setIsLoadedFromValue(true);
      } catch (error) {
        console.error('Error loading signature:', error);
      }
    }
  }, [value]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">{label}</label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearSignature}
            disabled={disabled || (isEmpty && !value)}
          >
            <Eraser className="h-4 w-4 mr-1" />
            {t("common.clear")}
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={saveSignature}
            disabled={disabled || isEmpty || isLoadedFromValue}
          >
            <Check className="h-4 w-4 mr-1" />
            {t("common.save")}
          </Button>
        </div>
      </div>

      {value ? (
        <div className="relative border rounded-md bg-background">
          <img src={value} alt={label} className="w-full h-32 object-contain" />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6"
            onClick={() => {
              clearSignature();
            }}
            disabled={disabled}
            title="Eliminar firma digital"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="border rounded-md bg-background">
          <SignatureCanvas
            ref={sigCanvas}
            canvasProps={{
              className: "h-32 w-full touch-none cursor-crosshair",
            }}
            backgroundColor="transparent"
            onBegin={handleBeginStroke}
          />
        </div>
      )}
    </Card>
  );
};
