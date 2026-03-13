import React, { useState, useEffect, useRef } from 'react';
import { Pencil, Trash2, Plus, Search, Building2, Phone, Mail, MapPin, FileText, Settings, Upload, Users } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { readVCFFile, VCFContact } from '@/utils/vcfParser';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import {
  createCompanyPortfolioItem,
  createCompanyType,
  deleteCompanyPortfolioItem,
  deleteCompanyType,
  listCompanyPortfolio,
  listCompanyTypes,
  renameCompanyType,
  updateCompanyPortfolioItem,
  type ApiCompanyPortfolioItem,
} from '@/integrations/api/client';

import { useTranslation } from 'react-i18next';

interface CompanyPortfolioItem {
  id: string;
  company_name: string;
  company_type: string[];
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  fiscal_id?: string;
  notes?: string;
  created_at: string;
  created_by?: string;
  updated_by?: string;
  creator_name?: string;
  editor_name?: string;
}

type CompanyImportPayload = {
  company_name: string;
  company_type: string[];
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  fiscal_id: string | null;
  notes: string | null;
};

const mapApiCompany = (item: ApiCompanyPortfolioItem): CompanyPortfolioItem => ({
  id: String(item.id),
  company_name: item.company_name,
  company_type: item.company_type || [],
  contact_person: item.contact_person ?? undefined,
  contact_phone: item.contact_phone ?? undefined,
  contact_email: item.contact_email ?? undefined,
  address: item.address ?? undefined,
  city: item.city ?? undefined,
  postal_code: item.postal_code ?? undefined,
  country: item.country ?? undefined,
  fiscal_id: item.fiscal_id ?? undefined,
  notes: item.notes ?? undefined,
  created_at: item.created_at,
  created_by: item.created_by_id != null ? String(item.created_by_id) : undefined,
  updated_by: item.updated_by_id != null ? String(item.updated_by_id) : undefined,
  creator_name: item.creator_name ?? undefined,
  editor_name: item.editor_name ?? undefined,
});

const toNumericId = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error('ID invalido');
  }
  return parsed;
};

const normalizeText = (value?: string | null): string => (value || '').trim().toLowerCase();

const normalizePhone = (value?: string | null): string =>
  normalizeText(value).replace(/[\s\-().]/g, '');

const buildCompanySignature = (company: CompanyImportPayload): string =>
  JSON.stringify({
    company_name: normalizeText(company.company_name),
    contact_person: normalizeText(company.contact_person),
    contact_phone: normalizePhone(company.contact_phone),
    contact_email: normalizeText(company.contact_email),
    address: normalizeText(company.address),
    city: normalizeText(company.city),
    postal_code: normalizeText(company.postal_code),
    country: normalizeText(company.country),
    fiscal_id: normalizeText(company.fiscal_id),
    notes: normalizeText(company.notes),
  });


export const CompanyPortfolio: React.FC = () => {
  const isAndroidPlatform = Capacitor.getPlatform() === 'android';
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isAdmin, isSiteManager, isMaster } = useUserPermissions();
  const canDelete = isAdmin || isSiteManager || isMaster;
  const canEditAll = isAdmin || isSiteManager || isMaster;
  const [companies, setCompanies] = useState<CompanyPortfolioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyPortfolioItem | null>(null);
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const [isAddingNewType, setIsAddingNewType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [isManageTypesDialogOpen, setIsManageTypesDialogOpen] = useState(false);
  const [editingTypeIndex, setEditingTypeIndex] = useState<number | null>(null);
  const [editingTypeName, setEditingTypeName] = useState('');
  
  // VCF Import state
  const [isVCFDialogOpen, setIsVCFDialogOpen] = useState(false);
  const [vcfContacts, setVcfContacts] = useState<VCFContact[]>([]);
  const [selectedVCFContacts, setSelectedVCFContacts] = useState<Set<number>>(new Set());
  const [importingVCF, setImportingVCF] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateCandidateName, setDuplicateCandidateName] = useState('');
  const duplicateDialogResolverRef = useRef<((value: boolean) => void) | null>(null);
  const vcfInputRef = useRef<HTMLInputElement>(null);
  // Form state
  const [formData, setFormData] = useState({
    company_name: '',
    company_type: [] as string[],
    contact_person: '',
    contact_phone: '',
    contact_email: '',
    address: '',
    city: '',
    postal_code: '',
    country: 'España',
    fiscal_id: '',
    notes: ''
  });

  useEffect(() => {
    if (user) {
      loadCompanies();
      loadCustomTypes();
    }
  }, [user]);

  const loadCustomTypes = async () => {
    try {
      const data = await listCompanyTypes();
      setCustomTypes((data || []).map((item) => item.type_name));
    } catch (error) {
      console.error('Error loading company types:', error);
    }
  };

  const allCompanyTypes = customTypes;

  const addCustomType = async () => {
    if (!newTypeName.trim() || allCompanyTypes.includes(newTypeName.trim())) return;

    try {
      await createCompanyType(newTypeName.trim());

      setNewTypeName('');
      setIsAddingNewType(false);
      await loadCustomTypes();
      
      const newTypeToast = toast({
        title: t('common.success'),
        description: t('companyPortfolio.typeAdded')
      });
      setTimeout(() => newTypeToast.dismiss(), 1000);
    } catch (error) {
      console.error('Error adding custom type:', error);
      toast({
        title: t('common.error'),
        description: t('companyPortfolio.errorAddingType'),
        variant: 'destructive'
      });
    }
  };

  const deleteCustomType = async (typeName: string) => {
    // Check if type is in use
    const isInUse = companies.some(company => company.company_type?.includes(typeName));
    if (isInUse) {
      toast({
        title: t('common.error'),
        description: t('companyPortfolio.cannotDelete'),
        variant: 'destructive'
      });
      return;
    }

    try {
      await deleteCompanyType(typeName);

      await loadCustomTypes();
      
      const deleteTypeToast = toast({
        title: t('common.success'),
        description: t('companyPortfolio.typeDeleted')
      });
      setTimeout(() => deleteTypeToast.dismiss(), 1000);
    } catch (error) {
      console.error('Error deleting custom type:', error);
      toast({
        title: t('common.error'),
        description: t('companyPortfolio.errorDeletingType'),
        variant: 'destructive'
      });
    }
  };

  const startEditType = (typeName: string) => {
    setEditingTypeIndex(customTypes.indexOf(typeName));
    setEditingTypeName(typeName);
  };

  const saveEditType = async () => {
    if (editingTypeIndex === null) return;
    
    const oldTypeName = customTypes[editingTypeIndex];
    
    if (!editingTypeName.trim() || customTypes.includes(editingTypeName.trim())) {
      toast({
        title: t('common.error'),
        description: t('companyPortfolio.invalidName'),
        variant: 'destructive'
      });
      return;
    }

    try {
      await renameCompanyType(oldTypeName, editingTypeName.trim());

      setEditingTypeIndex(null);
      setEditingTypeName('');
      
      await loadCustomTypes();
      await loadCompanies();
      
      const updateTypeToast = toast({
        title: t('common.success'),
        description: t('companyPortfolio.typeUpdated')
      });
      setTimeout(() => updateTypeToast.dismiss(), 1000);
    } catch (error) {
      console.error('Error updating custom type:', error);
      toast({
        title: t('common.error'),
        description: t('companyPortfolio.errorUpdatingType'),
        variant: 'destructive'
      });
    }
  };

  const cancelEditType = () => {
    setEditingTypeIndex(null);
    setEditingTypeName('');
  };

  const loadCompanies = async () => {
    try {
      setLoading(true);
      const data = await listCompanyPortfolio();
      setCompanies((data || []).map(mapApiCompany));
    } catch (error) {
      console.error('Error loading companies:', error);
      toast({
        title: t('common.error'),
        description: t('companyPortfolio.errorLoading'),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.company_name || formData.company_type.length === 0) {
      toast({
        title: t('common.error'),
        description: t('companyPortfolio.nameTypeRequired'),
        variant: 'destructive'
      });
      return;
    }

    try {
      const payload = {
        company_name: formData.company_name,
        company_type: formData.company_type,
        contact_person: formData.contact_person || null,
        contact_phone: formData.contact_phone || null,
        contact_email: formData.contact_email || null,
        address: formData.address || null,
        city: formData.city || null,
        postal_code: formData.postal_code || null,
        country: formData.country || null,
        fiscal_id: formData.fiscal_id || null,
        notes: formData.notes || null,
      };

      if (editingCompany) {
        await updateCompanyPortfolioItem(toNumericId(editingCompany.id), payload);
        const updateToast = toast({
          title: t('common.success'),
          description: t('companyPortfolio.companyUpdated')
        });
        setTimeout(() => updateToast.dismiss(), 1000);
      } else {
        await createCompanyPortfolioItem(payload);
        const createToast = toast({
          title: t('common.success'),
          description: t('companyPortfolio.companyAdded')
        });
        setTimeout(() => createToast.dismiss(), 1000);
      }

      setIsDialogOpen(false);
      resetForm();
      loadCompanies();
    } catch (error) {
      console.error('Error saving company:', error);
      toast({
        title: t('common.error'),
        description: t('companyPortfolio.errorSaving'),
        variant: 'destructive'
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('companyPortfolio.deleteConfirm'))) return;

    try {
      await deleteCompanyPortfolioItem(toNumericId(id));

      const deleteToast = toast({
        title: t('common.success'),
        description: t('companyPortfolio.companyDeleted')
      });
      setTimeout(() => deleteToast.dismiss(), 1000);
      loadCompanies();
    } catch (error) {
      console.error('Error deleting company:', error);
      toast({
        title: t('common.error'),
        description: t('companyPortfolio.errorDeleting'),
        variant: 'destructive'
      });
    }
  };

  const handleEdit = (company: CompanyPortfolioItem) => {
    setEditingCompany(company);
    setFormData({
      company_name: company.company_name,
      company_type: company.company_type,
      contact_person: company.contact_person || '',
      contact_phone: company.contact_phone || '',
      contact_email: company.contact_email || '',
      address: company.address || '',
      city: company.city || '',
      postal_code: company.postal_code || '',
      country: company.country || 'España',
      fiscal_id: company.fiscal_id || '',
      notes: company.notes || ''
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      company_name: '',
      company_type: [],
      contact_person: '',
      contact_phone: '',
      contact_email: '',
      address: '',
      city: '',
      postal_code: '',
      country: 'España',
      fiscal_id: '',
      notes: ''
    });
    setEditingCompany(null);
  };

  const filteredCompanies = companies.filter(company => {
    const matchesSearch = company.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         company.contact_person?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         company.fiscal_id?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || company.company_type?.includes(filterType);
    return matchesSearch && matchesType;
  });

  const toggleType = (type: string) => {
    setFormData(prev => ({
      ...prev,
      company_type: prev.company_type.includes(type)
        ? prev.company_type.filter(t => t !== type)
        : [...prev.company_type, type]
    }));
  };

  // VCF Import handlers
  const handleVCFFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const contacts = await readVCFFile(file);
      if (contacts.length === 0) {
        toast({
          title: t('common.warning'),
          description: t('companyPortfolio.noContactsFound'),
          variant: 'destructive'
        });
        return;
      }
      
      setVcfContacts(contacts);
      setSelectedVCFContacts(new Set(contacts.map((_, i) => i)));
      setIsVCFDialogOpen(true);
    } catch (error) {
      console.error('Error reading VCF file:', error);
      toast({
        title: t('common.error'),
        description: t('companyPortfolio.errorImportingVCF'),
        variant: 'destructive'
      });
    }
    
    // Reset input
    if (vcfInputRef.current) {
      vcfInputRef.current.value = '';
    }
  };

  const toggleVCFContact = (index: number) => {
    setSelectedVCFContacts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  const selectAllVCFContacts = () => {
    setSelectedVCFContacts(new Set(vcfContacts.map((_, i) => i)));
  };

  const deselectAllVCFContacts = () => {
    setSelectedVCFContacts(new Set());
  };

  const importSelectedVCFContacts = async () => {
    if (selectedVCFContacts.size === 0) return;
    
    setImportingVCF(true);
    try {
      let importedCount = 0;
      let skippedDuplicatesCount = 0;
      const existingSignatures = new Set(
        companies.map((company) =>
          buildCompanySignature({
            company_name: company.company_name || '',
            company_type: company.company_type || [],
            contact_person: company.contact_person || null,
            contact_phone: company.contact_phone || null,
            contact_email: company.contact_email || null,
            address: company.address || null,
            city: company.city || null,
            postal_code: company.postal_code || null,
            country: company.country || null,
            fiscal_id: company.fiscal_id || null,
            notes: company.notes || null,
          })
        )
      );
      
      for (const index of selectedVCFContacts) {
        const contact = vcfContacts[index];
        
        const companyData: CompanyImportPayload = {
          company_name: contact.organization || contact.fullName || 'Contacto importado',
          company_type: [],
          contact_person: contact.fullName || null,
          contact_phone: contact.phone || null,
          contact_email: contact.email || null,
          address: contact.address || null,
          city: contact.city || null,
          postal_code: contact.postalCode || null,
          country: contact.country || 'España',
          fiscal_id: null,
          notes: contact.notes || null,
        };

        const signature = buildCompanySignature(companyData);
        if (existingSignatures.has(signature)) {
          const duplicateName = companyData.company_name || companyData.contact_person || 'Contacto';
          const shouldContinue = await new Promise<boolean>((resolve) => {
            duplicateDialogResolverRef.current = resolve;
            setDuplicateCandidateName(duplicateName);
            setDuplicateDialogOpen(true);
          });
          if (!shouldContinue) {
            skippedDuplicatesCount++;
            continue;
          }
        }

        try {
          await createCompanyPortfolioItem(companyData);
          importedCount++;
          existingSignatures.add(signature);
        } catch (error) {
          console.error('Error importing VCF contact:', error);
        }
      }
      
      setIsVCFDialogOpen(false);
      setVcfContacts([]);
      setSelectedVCFContacts(new Set());
      loadCompanies();
      
      const importToast = toast({
        title: t('common.success'),
        description: t('companyPortfolio.contactsImported', { count: importedCount })
      });
      setTimeout(() => importToast.dismiss(), 2000);

      if (skippedDuplicatesCount > 0) {
        const duplicatesToast = toast({
          title: t('common.info'),
          description: t('companyPortfolio.duplicatesSkipped', { count: skippedDuplicatesCount })
        });
        setTimeout(() => duplicatesToast.dismiss(), 2200);
      }
    } catch (error) {
      console.error('Error importing VCF contacts:', error);
      toast({
        title: t('common.error'),
        description: t('companyPortfolio.errorImportingVCF'),
        variant: 'destructive'
      });
    } finally {
      setImportingVCF(false);
    }
  };

  const handleDuplicateDialogAnswer = (allowDuplicate: boolean) => {
    const resolver = duplicateDialogResolverRef.current;
    duplicateDialogResolverRef.current = null;
    setDuplicateDialogOpen(false);
    if (resolver) resolver(allowDuplicate);
  };

  const getTypeColor = (type: string) => {
    const index = customTypes.indexOf(type);
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-indigo-500', 'bg-pink-500', 'bg-yellow-500', 'bg-red-500'];
    return colors[index % colors.length] || 'bg-gray-500';
  };
  const primaryPortfolioButtonClass = isAndroidPlatform
    ? 'h-11 w-[158px] justify-center gap-1.5 border border-cyan-500 bg-slate-100 text-[16px] font-semibold text-cyan-700 shadow-none hover:bg-cyan-50 hover:text-cyan-800'
    : 'h-10 w-[148px] justify-center gap-1.5 border border-cyan-500 bg-slate-100 text-[15px] font-semibold text-cyan-700 shadow-none hover:bg-cyan-50 hover:text-cyan-800';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col items-center gap-4">
        <div className="w-full text-center">
          <h2 className="text-xl font-semibold text-slate-900 sm:text-3xl">Cartera de empresas</h2>
          <p className="text-[15px] text-muted-foreground">Supervisión de obra</p>
        </div>

        {/* Hidden VCF file input */}
        <input
          ref={vcfInputRef}
          type="file"
          accept=".vcf,.vcard"
          onChange={handleVCFFileChange}
          className="hidden"
        />

        <div className="flex w-full flex-wrap justify-center gap-2">
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button variant="outline" className={primaryPortfolioButtonClass}>
              <Plus className={isAndroidPlatform ? 'mr-2 h-5 w-5' : 'mr-2 h-[18px] w-[18px]'} />
              Nuevo registro
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingCompany ? 'Editar empresa' : 'Nueva empresa'}
              </DialogTitle>
              <DialogDescription>
                Completa los datos de la empresa
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="company_name">Nombre de empresa *</Label>
                  <Input
                    id="company_name"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    required
                  />
                </div>
                
                <div className="md:col-span-2">
                  <Label>Tipos * (Selecciona uno o más)</Label>
                  <div className="border rounded-lg p-4 space-y-2 max-h-[200px] overflow-y-auto">
                    {allCompanyTypes.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No hay tipos disponibles. Añade uno nuevo abajo.
                      </p>
                    ) : (
                      allCompanyTypes.map((type) => (
                        <div key={type} className="flex items-center space-x-2">
                          <Checkbox
                            id={`type-${type}`}
                            checked={formData.company_type.includes(type)}
                            onCheckedChange={() => toggleType(type)}
                          />
                          <Label
                            htmlFor={`type-${type}`}
                            className="text-sm font-normal cursor-pointer"
                          >
                            {type}
                          </Label>
                        </div>
                      ))
                    )}
                  </div>
                  
                  {!isAddingNewType ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full"
                      onClick={() => setIsAddingNewType(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Añadir nuevo tipo
                    </Button>
                  ) : (
                    <div className="flex gap-2 mt-2">
                      <Input
                        placeholder="Nombre del nuevo tipo"
                        value={newTypeName}
                        onChange={(e) => setNewTypeName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addCustomType();
                          }
                        }}
                        autoFocus
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={addCustomType}
                      >
                        Añadir
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setIsAddingNewType(false);
                          setNewTypeName('');
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="fiscal_id">CIF/NIF</Label>
                  <Input
                    id="fiscal_id"
                    value={formData.fiscal_id}
                    onChange={(e) => setFormData({ ...formData, fiscal_id: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="contact_person">Persona de contacto</Label>
                  <Input
                    id="contact_person"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="contact_phone">Teléfono</Label>
                  <Input
                    id="contact_phone"
                    type="tel"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  />
                </div>
                
                <div className="md:col-span-2">
                  <Label htmlFor="contact_email">Email</Label>
                  <Input
                    id="contact_email"
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  />
                </div>
                
                <div className="md:col-span-2">
                  <Label htmlFor="address">Dirección</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="city">Ciudad</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="postal_code">Código postal</Label>
                  <Input
                    id="postal_code"
                    value={formData.postal_code}
                    onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                  />
                </div>
                
                <div className="md:col-span-2">
                  <Label htmlFor="country">País</Label>
                  <Input
                    id="country"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  />
                </div>
                
                <div className="md:col-span-2">
                  <Label htmlFor="notes">Notas</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    resetForm();
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingCompany ? 'Actualizar' : 'Añadir'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

          <Button
            variant="outline"
            onClick={() => setIsManageTypesDialogOpen(true)}
          >
            <Settings className="mr-2 h-4 w-4" />
            Gestión de tipos
          </Button>

          <Button
            variant="outline"
            onClick={() => vcfInputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            Importar contactos
          </Button>
        </div>
      </div>

      {/* Manage Types Dialog */}
      <Dialog open={isManageTypesDialogOpen} onOpenChange={setIsManageTypesDialogOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Gestionar tipos de empresa</DialogTitle>
            <DialogDescription>
              Edita o elimina los tipos personalizados
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {customTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No hay tipos personalizados creados
              </p>
            ) : (
              customTypes.map((type, index) => (
                <div key={type} className="flex items-center gap-2 p-2 border rounded-lg">
                  {editingTypeIndex === index ? (
                    <>
                      <Input
                        value={editingTypeName}
                        onChange={(e) => setEditingTypeName(e.target.value)}
                        className="flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditType();
                          if (e.key === 'Escape') cancelEditType();
                        }}
                      />
                      <Button size="sm" onClick={saveEditType}>
                        Guardar
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEditType}>
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1">{type}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => startEditType(type)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {canDelete && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteCustomType(type)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={duplicateDialogOpen}
        onOpenChange={(open) => {
          if (!open && duplicateDialogOpen) {
            handleDuplicateDialogAnswer(false);
          } else {
            setDuplicateDialogOpen(open);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Posible duplicado detectado</AlertDialogTitle>
            <AlertDialogDescription>
              Se detectó que "{duplicateCandidateName}" ya existe con los mismos datos.
              ¿Quieres importarlo igualmente como duplicado?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleDuplicateDialogAnswer(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleDuplicateDialogAnswer(true)}>
              Duplicar igualmente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* VCF Import Dialog */}
      <Dialog open={isVCFDialogOpen} onOpenChange={(open) => {
        setIsVCFDialogOpen(open);
        if (!open) {
          setVcfContacts([]);
          setSelectedVCFContacts(new Set());
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t('companyPortfolio.selectContactsToImport')}
            </DialogTitle>
            <DialogDescription>
              {t('companyPortfolio.importVCFDesc')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Select/Deselect all */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={selectAllVCFContacts}
              >
                {t('companyPortfolio.selectAll')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={deselectAllVCFContacts}
              >
                {t('companyPortfolio.deselectAll')}
              </Button>
            </div>
            
            {/* Contacts list */}
            <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
              {vcfContacts.map((contact, index) => (
                <div
                  key={index}
                  className={`p-3 flex items-start gap-3 cursor-pointer hover:bg-muted/50 transition-colors ${
                    selectedVCFContacts.has(index) ? 'bg-primary/5' : ''
                  }`}
                  onClick={() => toggleVCFContact(index)}
                >
                  <Checkbox
                    checked={selectedVCFContacts.has(index)}
                    onCheckedChange={() => toggleVCFContact(index)}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {contact.organization || contact.fullName || 'Sin nombre'}
                    </div>
                    {contact.fullName && contact.organization && (
                      <div className="text-sm text-muted-foreground truncate">
                        {contact.fullName}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                      {contact.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {contact.phone}
                        </span>
                      )}
                      {contact.email && (
                        <span className="flex items-center gap-1 truncate max-w-[200px]">
                          <Mail className="h-3 w-3" />
                          {contact.email}
                        </span>
                      )}
                      {contact.city && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {contact.city}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {/* Actions */}
            <div className="flex justify-between items-center pt-2">
              <span className="text-sm text-muted-foreground">
                {selectedVCFContacts.size} / {vcfContacts.length} {t('companyPortfolio.selectContactsToImport').toLowerCase()}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsVCFDialogOpen(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={importSelectedVCFContacts}
                  disabled={selectedVCFContacts.size === 0 || importingVCF}
                >
                  {importingVCF ? (
                    <>
                      {t('companyPortfolio.importingContacts')}
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      {t('companyPortfolio.importSelected')} ({selectedVCFContacts.size})
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, contacto o CIF..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Filtrar por tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {allCompanyTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Companies Grid */}
      {loading ? (
        <div className="text-center py-8">{t('companyPortfolio.loadingCompanies')}</div>
      ) : filteredCompanies.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {searchTerm || filterType !== 'all'
              ? 'No se encontraron empresas con los filtros seleccionados'
              : 'No hay empresas registradas. Añade la primera empresa.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCompanies.map((company) => {
            const isOwnedByCurrentUser =
              company.created_by != null &&
              user?.id != null &&
              String(company.created_by) === String(user.id);
            const canEditCompany = canEditAll || isOwnedByCurrentUser;

            return (
            <Card 
              key={company.id} 
              className="hover:shadow-2xl transition-all duration-300 shadow-[0_4px_30px_rgba(128,145,85,0.35)] hover:shadow-[0_8px_40px_rgba(128,145,85,0.5)] relative"
            >
              {/* Marca de agua */}
              <div className="absolute top-3 right-3 text-[10px] text-muted-foreground/40 font-mono leading-tight max-w-[180px] text-right">
                {company.creator_name && (
                  <div className="truncate">
                    {t('companyPortfolio.createdBy')}: {company.creator_name}
                  </div>
                )}
                {company.editor_name && company.editor_name !== company.creator_name && (
                  <div className="truncate">
                    {t('companyPortfolio.editedBy')}: {company.editor_name}
                  </div>
                )}
              </div>
              
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="h-5 w-5" />
                      {company.company_name}
                    </CardTitle>
                    <CardDescription className="mt-2 flex flex-wrap gap-1">
                      {company.company_type?.map((type, idx) => (
                        <Badge key={idx} className={getTypeColor(type)}>
                          {type}
                        </Badge>
                      ))}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(company)}
                      disabled={!canEditCompany}
                      title={!canEditCompany ? t('companyPortfolio.cannotEditOthers') : ''}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(company.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {company.fiscal_id && (
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{company.fiscal_id}</span>
                  </div>
                )}
                {company.contact_person && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{company.contact_person}</span>
                  </div>
                )}
                {company.contact_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <a href={`tel:${company.contact_phone}`} className="hover:underline">
                      {company.contact_phone}
                    </a>
                  </div>
                )}
                {company.contact_email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${company.contact_email}`} className="hover:underline truncate">
                      {company.contact_email}
                    </a>
                  </div>
                )}
                {company.city && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{company.city}</span>
                  </div>
                )}
                {company.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <span className="text-muted-foreground">
                      {company.address}
                      {company.city && `, ${company.city}`}
                      {company.postal_code && ` (${company.postal_code})`}
                    </span>
                  </div>
                )}
                {company.notes && (
                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground italic text-xs line-clamp-2">
                      {company.notes}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
          })}
        </div>
      )}
    </div>
  );
};


