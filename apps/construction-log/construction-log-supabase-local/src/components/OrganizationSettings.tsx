import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2, Building2, Save, Users, AlertCircle, Upload, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useOrganizationLogo } from '@/hooks/useOrganizationLogo';
import { useOrganization } from '@/hooks/useOrganization';
import { CustomHolidaysManagement } from '@/components/CustomHolidaysManagement';
import { CompanyStandardization } from '@/components/admin/CompanyStandardization';
import { analyzeLogoColors } from '@/integrations/api/client';

interface OrganizationData {
  id: string;
  name: string;
  fiscal_id: string | null;
  legal_name: string | null;
  commercial_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  max_users: number;
  current_users: number;
  subscription_status: string | null;
  brand_color: string | null;
}

export const OrganizationSettings = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [organization, setOrganization] = useState<OrganizationData | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [extractedColors, setExtractedColors] = useState<Array<{ hex: string; name: string }>>([]);
  const { organization: orgData, reload: reloadOrg } = useOrganization();
  const { updateOrganizationLogo, removeOrganizationLogo } = useOrganizationLogo();
  const orgLogoUrl = orgData?.logo ? `${orgData.logo}?v=${orgData.updated_at ?? ''}` : undefined;

  useEffect(() => {
    loadOrganization();
  }, []);

  const loadOrganization = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (!profile?.organization_id) return;

      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', profile.organization_id)
        .single();

      if (error) throw error;
      setOrganization(data);
    } catch (error: any) {
      console.error('Error loading organization:', error);
      toast({
        title: t('common.error'),
        description: t('organizationSettings.errorLoading'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: t('common.error'),
        description: 'Por favor selecciona un archivo de imagen válido',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: t('common.error'),
        description: 'La imagen no debe superar los 2MB',
        variant: 'destructive',
      });
      return;
    }

    setUploadingLogo(true);
    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        
        // Upload logo
        const success = await updateOrganizationLogo(dataUrl);
        
        if (success) {
          toast({
            title: 'Logo actualizado',
            description: 'Analizando colores del logo con IA...',
          });
          
          // Analyze colors with AI
          try {
            const colorData = await analyzeLogoColors({ imageDataUrl: dataUrl });

            if (colorData?.colors && colorData.colors.length > 0) {
              // Store extracted colors for user to choose
              setExtractedColors(colorData.colors);
              
              toast({
                title: 'Colores detectados',
                description: `Se detectaron ${colorData.colors.length} colores en el logo. Elige el que prefieras más abajo.`,
              });
            }
          } catch (aiError) {
            console.error('Error with AI color analysis:', aiError);
            // Continue even if AI analysis fails
          }
          
          await reloadOrg();
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading logo:', error);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!confirm('¿Estás seguro de que quieres eliminar el logo de la empresa?')) {
      return;
    }

    setUploadingLogo(true);
    try {
      const success = await removeOrganizationLogo();
      if (success) {
        toast({
          title: 'Logo eliminado',
          description: 'El logo de la empresa se ha eliminado correctamente',
        });
        await reloadOrg();
      }
    } catch (error) {
      console.error('Error removing logo:', error);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!organization) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({
          fiscal_id: organization.fiscal_id?.trim() || null,
          legal_name: organization.legal_name?.trim() || null,
          commercial_name: organization.commercial_name?.trim() || organization.name,
          email: organization.email?.trim() || null,
          phone: organization.phone?.trim() || null,
          address: organization.address?.trim() || null,
          city: organization.city?.trim() || null,
          postal_code: organization.postal_code?.trim() || null,
          country: organization.country || 'España',
          brand_color: organization.brand_color || '#2563eb',
          updated_at: new Date().toISOString(),
        })
        .eq('id', organization.id);

      if (error) throw error;

      toast({
        title: t('organizationSettings.saved'),
        description: t('organizationSettings.savedDesc'),
      });
      
      await loadOrganization();
      await reloadOrg();
    } catch (error: any) {
      console.error('Error saving organization:', error);
      
      // Error específico para fiscal_id duplicado
      if (error.code === '23505' && error.message.includes('fiscal_id')) {
        toast({
          title: t('common.error'),
          description: t('organizationSettings.duplicateFiscalId'),
          variant: 'destructive',
        });
      } else {
        toast({
          title: t('common.error'),
          description: error.message || t('organizationSettings.errorSaving'),
          variant: 'destructive',
        });
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!organization) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{t('common.error')}</AlertTitle>
        <AlertDescription>
          {t('organizationSettings.errorLoadingDesc')}
        </AlertDescription>
      </Alert>
    );
  }

  const userLimitWarning = organization.current_users >= organization.max_users;

  return (
    <div className="space-y-6">
      {/* User Limit Warning */}
      {userLimitWarning && (
        <Alert variant="destructive">
          <Users className="h-4 w-4" />
          <AlertTitle>{t('organizationSettings.userLimitTitle')}</AlertTitle>
          <AlertDescription>
            {t('organizationSettings.userLimitDesc', { maxUsers: organization.max_users })}
          </AlertDescription>
        </Alert>
      )}

      {/* Organization Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {t('organizationSettings.title')}
          </CardTitle>
          <CardDescription>
            {t('organizationSettings.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Brand Identity Section */}
          <div className="space-y-6 pb-6 border-b">
            <div>
              <Label className="text-base font-semibold">Identidad Corporativa</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Configura el logo y color corporativo de tu empresa.
              </p>
            </div>
            
            {/* Color Picker */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Color Corporativo</Label>
              <p className="text-xs text-muted-foreground">
                Selecciona el color principal de tu empresa. Se aplicará en la aplicación y en los PDFs generados.
              </p>
              
              {/* Extracted Colors from Logo */}
              {extractedColors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Colores detectados en el logo (haz clic para aplicar):
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {extractedColors.map((color, idx) => (
                      <button
                        key={idx}
                        onClick={async () => {
                          if (!organization) return;
                          
                          // Update local state
                          setOrganization({ ...organization, brand_color: color.hex });
                          
                          // Apply immediately to current UI
                          const { applyBrandColor } = await import('@/utils/colorUtils');
                          applyBrandColor(color.hex);
                          
                          // Persist immediately so it propagates in realtime to all users
                          await supabase
                            .from('organizations')
                            .update({ brand_color: color.hex, updated_at: new Date().toISOString() })
                            .eq('id', organization.id);
                          
                          toast({
                            title: 'Color aplicado',
                            description: `${color.name} (${color.hex}) aplicado en tiempo real para todos los usuarios.`,
                          });
                          
                          await reloadOrg();
                        }}
                        className="flex flex-col items-center gap-1 p-2 rounded-lg border-2 border-border hover:border-primary transition-all hover:scale-105"
                        title={`${color.name} - ${color.hex}`}
                      >
                        <div 
                          className="h-12 w-12 rounded-md shadow-sm"
                          style={{ backgroundColor: color.hex }}
                        />
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {color.hex}
                        </span>
                        <span className="text-[9px] text-muted-foreground max-w-[60px] truncate">
                          {color.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={organization?.brand_color || '#2563eb'}
                  onChange={(e) => organization && setOrganization({ ...organization, brand_color: e.target.value })}
                  className="h-12 w-20 rounded-lg border-2 border-border cursor-pointer"
                />
                <div className="flex-1">
                  <Input
                    type="text"
                    value={organization?.brand_color || '#2563eb'}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (/^#[0-9A-Fa-f]{0,6}$/.test(value) && organization) {
                        setOrganization({ ...organization, brand_color: value });
                      }
                    }}
                    placeholder="#2563eb"
                    className="font-mono uppercase"
                    maxLength={7}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => organization && setOrganization({ ...organization, brand_color: '#2563eb' })}
                >
                  Restablecer
                </Button>
              </div>
            </div>

            {/* Logo Section */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Logo de la Empresa</Label>
              <p className="text-xs text-muted-foreground">
                Sube el logo de tu empresa. Aparecerá en el encabezado y en los PDFs.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              {/* Logo Preview */}
              {orgLogoUrl && (
                <div className="flex-shrink-0">
                  <div className="w-32 h-32 border-2 border-border rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                    <img 
                      src={orgLogoUrl} 
                      alt="Logo de la empresa" 
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                </div>
              )}
              
              {/* Upload/Remove Buttons */}
              <div className="flex flex-col gap-2 flex-1">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={uploadingLogo}
                    onClick={() => document.getElementById('logo-upload')?.click()}
                    className="flex-1 sm:flex-none"
                  >
                    {uploadingLogo ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Subiendo...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        {orgLogoUrl ? 'Cambiar logo' : 'Subir logo'}
                      </>
                    )}
                  </Button>
                  
                  {orgLogoUrl && (
                    <Button
                      variant="outline"
                      disabled={uploadingLogo}
                      onClick={handleRemoveLogo}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Eliminar
                    </Button>
                  )}
                </div>
                
                <input
                  id="logo-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                
                <p className="text-xs text-muted-foreground">
                  Formatos: JPG, PNG, GIF. Tamaño máximo: 2MB
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Fiscal ID */}
            <div className="space-y-2">
              <Label htmlFor="fiscal_id">
                {t('organizationSettings.fiscalId')} <span className="text-red-500">{t('organizationSettings.fiscalIdRequired')}</span>
              </Label>
              <Input
                id="fiscal_id"
                value={organization.fiscal_id || ''}
                onChange={(e) => setOrganization({ ...organization, fiscal_id: e.target.value })}
                placeholder={t('organizationSettings.fiscalIdPlaceholder')}
                className="uppercase"
              />
              <p className="text-xs text-muted-foreground">
                {t('organizationSettings.fiscalIdHelp')}
              </p>
            </div>

            {/* Legal Name */}
            <div className="space-y-2">
              <Label htmlFor="legal_name">{t('organizationSettings.legalName')}</Label>
              <Input
                id="legal_name"
                value={organization.legal_name || ''}
                onChange={(e) => setOrganization({ ...organization, legal_name: e.target.value })}
                placeholder={t('organizationSettings.legalNamePlaceholder')}
              />
              <p className="text-xs text-muted-foreground">
                {t('organizationSettings.legalNameHelp')}
              </p>
            </div>

            {/* Commercial Name */}
            <div className="space-y-2">
              <Label htmlFor="commercial_name">{t('organizationSettings.commercialName')}</Label>
              <Input
                id="commercial_name"
                value={organization.commercial_name || organization.name}
                onChange={(e) => setOrganization({ ...organization, commercial_name: e.target.value })}
                placeholder={t('organizationSettings.commercialNamePlaceholder')}
              />
              <p className="text-xs text-muted-foreground">
                {t('organizationSettings.commercialNameHelp')}
              </p>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">{t('organizationSettings.companyEmail')}</Label>
              <Input
                id="email"
                type="email"
                value={organization.email || ''}
                onChange={(e) => setOrganization({ ...organization, email: e.target.value })}
                placeholder={t('organizationSettings.companyEmailPlaceholder')}
              />
            </div>

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone">{t('organizationSettings.phone')}</Label>
              <Input
                id="phone"
                type="tel"
                value={organization.phone || ''}
                onChange={(e) => setOrganization({ ...organization, phone: e.target.value })}
                placeholder={t('organizationSettings.phonePlaceholder')}
              />
            </div>

            {/* Postal Code */}
            <div className="space-y-2">
              <Label htmlFor="postal_code">{t('organizationSettings.postalCode')}</Label>
              <Input
                id="postal_code"
                value={organization.postal_code || ''}
                onChange={(e) => setOrganization({ ...organization, postal_code: e.target.value })}
                placeholder={t('organizationSettings.postalCodePlaceholder')}
              />
            </div>

            {/* City */}
            <div className="space-y-2">
              <Label htmlFor="city">{t('organizationSettings.city')}</Label>
              <Input
                id="city"
                value={organization.city || ''}
                onChange={(e) => setOrganization({ ...organization, city: e.target.value })}
                placeholder={t('organizationSettings.cityPlaceholder')}
              />
            </div>

            {/* Country */}
            <div className="space-y-2">
              <Label htmlFor="country">{t('organizationSettings.country')}</Label>
              <Input
                id="country"
                value={organization.country || 'España'}
                onChange={(e) => setOrganization({ ...organization, country: e.target.value })}
                placeholder={t('organizationSettings.countryPlaceholder')}
              />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <Label htmlFor="address">{t('organizationSettings.fullAddress')}</Label>
            <Textarea
              id="address"
              value={organization.address || ''}
              onChange={(e) => setOrganization({ ...organization, address: e.target.value })}
              placeholder={t('organizationSettings.addressPlaceholder')}
              rows={3}
            />
          </div>

          {/* Subscription Info */}
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">{t('organizationSettings.currentUsers')}</p>
                <p className="text-2xl font-bold">{organization.current_users}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('organizationSettings.userLimit')}</p>
                <p className="text-2xl font-bold">{organization.max_users}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('organizationSettings.plan')}</p>
                <p className="text-lg font-semibold capitalize">{organization.subscription_status || 'trial'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('organizationSettings.available')}</p>
                <p className="text-2xl font-bold text-primary">
                  {Math.max(0, organization.max_users - organization.current_users)}
                </p>
              </div>
            </div>
          </div>

          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="w-full md:w-auto"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('organizationSettings.saving')}
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {t('organizationSettings.saveChanges')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Company Standardization Section */}
      <CompanyStandardization />

      {/* Custom Holidays Section */}
      <CustomHolidaysManagement />
    </div>
  );
};
