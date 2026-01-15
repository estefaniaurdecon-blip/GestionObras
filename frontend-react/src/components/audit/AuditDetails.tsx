import React from 'react';
import { useTranslation } from 'react-i18next';

interface AuditDetailsProps {
  action: string;
  details: string | null;
}

const AuditDetails: React.FC<AuditDetailsProps> = ({ action, details }) => {
  const { t } = useTranslation();

  const renderDetails = () => {
    if (!details) return '-';

    const translatedDetails = t(`audit_details.${action}`, { defaultValue: details });

    // Aquí puedes agregar lógica para manejar detalles dinámicos si es necesario
    // Por ejemplo, usando expresiones regulares para extraer y reemplazar partes del texto.

    return translatedDetails;
  };

  return <>{renderDetails()}</>;
};

export default AuditDetails;
