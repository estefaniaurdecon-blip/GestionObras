from datetime import datetime
from typing import Dict, Optional

from pydantic import BaseModel


class BrandingRead(BaseModel):
    logo: Optional[str] = None
    color_palette: Dict[str, str]
    accent_color: str
    company_name: Optional[str] = None
    company_subtitle: Optional[str] = None
    updated_at: Optional[datetime] = None


class BrandingUpdate(BaseModel):
    accent_color: Optional[str] = None
    company_name: Optional[str] = None
    company_subtitle: Optional[str] = None
