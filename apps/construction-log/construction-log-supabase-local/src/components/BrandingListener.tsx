import { useEffect } from "react";
import { useOrganization } from "@/hooks/useOrganization";
import { applyBrandColor } from "@/utils/colorUtils";

/**
 * Global listener that applies organization branding (colors) in real time
 * for all users. Subscribes via useOrganization which already listens to
 * realtime UPDATE events on the organizations table.
 */
const BrandingListener = () => {
  const { organization } = useOrganization();

  useEffect(() => {
    if (organization?.brand_color) {
      applyBrandColor(organization.brand_color);
    }
  }, [organization?.brand_color]);

  return null;
};

export default BrandingListener;
