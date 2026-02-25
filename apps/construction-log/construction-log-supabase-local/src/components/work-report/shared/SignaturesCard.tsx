import { SignaturePad } from '@/components/SignaturePad';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type SignaturesCardProps = {
  foremanSignature: string;
  onForemanSignatureChange: (signature: string) => void;
  siteManagerSignature: string;
  onSiteManagerSignatureChange: (signature: string) => void;
  readOnly: boolean;
};

export const SignaturesCard = ({
  foremanSignature,
  onForemanSignatureChange,
  siteManagerSignature,
  onSiteManagerSignatureChange,
  readOnly,
}: SignaturesCardProps) => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Firmas digitales</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SignaturePad
          label="Firma del encargado"
          value={foremanSignature}
          disabled={readOnly}
          onChange={onForemanSignatureChange}
        />
        <SignaturePad
          label="Firma del jefe de obra"
          value={siteManagerSignature}
          disabled={readOnly}
          onChange={onSiteManagerSignatureChange}
        />
      </CardContent>
    </Card>
  );
};

export type { SignaturesCardProps };
