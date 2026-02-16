import React, { useState, useEffect, useRef } from 'react';
import { Pencil, Trash2, Plus, Search, Building2, Phone, Mail, MapPin, FileText, Settings, Upload, Users } from 'lucide-react';
import { readVCFFile, VCFContact } from '@/utils/vcfParser';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';

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


export const CompanyPortfolio: React.FC = () => {
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
      const { data, error } = await supabase
        .from('company_types')
        .select('type_name')
        .order('type_name');

      if (error) throw error;
      setCustomTypes(data?.map(t => t.type_name) || []);
    } catch (error) {
      console.error('Error loading company types:', error);
    }
  };

  const allCompanyTypes = customTypes;

  const addCustomType = async () => {
    if (!newTypeName.trim() || allCompanyTypes.includes(newTypeName.trim())) return;

    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user?.id)
        .single();

      const { error } = await supabase
        .from('company_types')
        .insert({
          organization_id: profile?.organization_id,
          type_name: newTypeName.trim(),
          created_by: user?.id
        });

      if (error) throw error;

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
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user?.id)
        .single();

      const { error } = await supabase
        .from('company_types')
        .delete()
        .eq('organization_id', profile?.organization_id)
        .eq('type_name', typeName);

      if (error) throw error;

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
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user?.id)
        .single();

      // Update the type in company_types table
      const { error: typeError } = await supabase
        .from('company_types')
        .update({ type_name: editingTypeName.trim() })
        .eq('organization_id', profile?.organization_id)
        .eq('type_name', oldTypeName);

      if (typeError) throw typeError;

      // Update companies that use this type
      const companiesToUpdate = companies.filter(c => c.company_type?.includes(oldTypeName));
      
      for (const company of companiesToUpdate) {
        const newTypes = company.company_type.map(t => t === oldTypeName ? editingTypeName.trim() : t);
        await supabase
          .from('company_portfolio')
          .update({ company_type: newTypes })
          .eq('id', company.id);
      }

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

      // Usar RPC con SECURITY DEFINER para obtener nombres de creador/editor sin chocar con RLS de profiles
      const { data, error } = await supabase.rpc('get_company_portfolio_with_names');

      if (error) throw error;

      // data ya incluye creator_name y editor_name
      setCompanies((data as any[]) as CompanyPortfolioItem[]);
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
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user?.id)
        .single();

      if (editingCompany) {
        const { error } = await supabase
          .from('company_portfolio')
          .update(formData)
          .eq('id', editingCompany.id);

        if (error) throw error;
        const updateToast = toast({
          title: t('common.success'),
          description: t('companyPortfolio.companyUpdated')
        });
        setTimeout(() => updateToast.dismiss(), 1000);
      } else {
        const { error } = await supabase
          .from('company_portfolio')
          .insert({
            ...formData,
            organization_id: profile?.organization_id,
            created_by: user?.id
          });

        if (error) throw error;
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
      const { error } = await supabase
        .from('company_portfolio')
        .delete()
        .eq('id', id);

      if (error) throw error;

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
      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user?.id)
        .single();
      
      let importedCount = 0;
      
      for (const index of selectedVCFContacts) {
        const contact = vcfContacts[index];
        
        const companyData = {
          company_name: contact.organization || contact.fullName || 'Contacto importado',
          company_type: [] as string[],
          contact_person: contact.fullName || '',
          contact_phone: contact.phone || '',
          contact_email: contact.email || '',
          address: contact.address || '',
          city: contact.city || '',
          postal_code: contact.postalCode || '',
          country: contact.country || 'España',
          fiscal_id: '',
          notes: contact.notes || '',
          organization_id: profile?.organization_id,
          created_by: user?.id
        };
        
        const { error } = await supabase
          .from('company_portfolio')
          .insert(companyData);
        
        if (!error) {
          importedCount++;
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

  const getTypeColor = (type: string) => {
    const index = customTypes.indexOf(type);
    const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-indigo-500', 'bg-pink-500', 'bg-yellow-500', 'bg-red-500'];
    return colors[index % colors.length] || 'bg-gray-500';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold">{t('companyPortfolio.title')}</h2>
          <p className="text-muted-foreground">
            {t('companyPortfolio.description')}
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {/* Hidden VCF file input */}
          <input
            ref={vcfInputRef}
            type="file"
            accept=".vcf,.vcard"
            onChange={handleVCFFileChange}
            className="hidden"
          />
          
          <Button
            variant="outline"
            onClick={() => vcfInputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            {t('companyPortfolio.importVCF')}
          </Button>
          
          <Button
            variant="outline"
            onClick={() => setIsManageTypesDialogOpen(true)}
          >
            <Settings className="mr-2 h-4 w-4" />
            {t('companyPortfolio.manageTypes')}
          </Button>
        
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              {t('companyPortfolio.newCompany')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingCompany ? t('companyPortfolio.editCompany') : t('companyPortfolio.newCompany')}
              </DialogTitle>
              <DialogDescription>
                {t('companyPortfolio.fillComplete')}
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="company_name">{t('companyPortfolio.companyName')} {t('companyPortfolio.required')}</Label>
                  <Input
                    id="company_name"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    required
                  />
                </div>
                
                <div className="md:col-span-2">
                  <Label>{t('companyPortfolio.companyType')} {t('companyPortfolio.required')} ({t('companyPortfolio.companyTypeDesc')})</Label>
                  <div className="border rounded-lg p-4 space-y-2 max-h-[200px] overflow-y-auto">
                    {allCompanyTypes.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {t('companyPortfolio.noTypesAvailable')}
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
                      {t('companyPortfolio.addNewType')}
                    </Button>
                  ) : (
                    <div className="flex gap-2 mt-2">
                      <Input
                        placeholder={t('companyPortfolio.newTypePlaceholder')}
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
                        {t('common.add')}
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
                        {t('common.cancel')}
                      </Button>
                    </div>
                  )}
                </div>
                
                <div>
                  <Label htmlFor="fiscal_id">{t('companyPortfolio.fiscalId')}</Label>
                  <Input
                    id="fiscal_id"
                    value={formData.fiscal_id}
                    onChange={(e) => setFormData({ ...formData, fiscal_id: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="contact_person">{t('companyPortfolio.contactPerson')}</Label>
                  <Input
                    id="contact_person"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="contact_phone">{t('companyPortfolio.contactPhone')}</Label>
                  <Input
                    id="contact_phone"
                    type="tel"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                  />
                </div>
                
                <div className="md:col-span-2">
                  <Label htmlFor="contact_email">{t('companyPortfolio.contactEmail')}</Label>
                  <Input
                    id="contact_email"
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                  />
                </div>
                
                <div className="md:col-span-2">
                  <Label htmlFor="address">{t('companyPortfolio.address')}</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="city">{t('companyPortfolio.city')}</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                
                <div>
                  <Label htmlFor="postal_code">{t('companyPortfolio.postalCode')}</Label>
                  <Input
                    id="postal_code"
                    value={formData.postal_code}
                    onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                  />
                </div>
                
                <div className="md:col-span-2">
                  <Label htmlFor="country">{t('companyPortfolio.country')}</Label>
                  <Input
                    id="country"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  />
                </div>
                
                <div className="md:col-span-2">
                  <Label htmlFor="notes">{t('companyPortfolio.notes')}</Label>
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
                  {t('common.cancel')}
                </Button>
                <Button type="submit">
                  {editingCompany ? t('common.update') : t('common.add')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Manage Types Dialog */}
      <Dialog open={isManageTypesDialogOpen} onOpenChange={setIsManageTypesDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('companyPortfolio.manageTypesTitle')}</DialogTitle>
            <DialogDescription>
              {t('companyPortfolio.manageTypesDesc')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {customTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {t('companyPortfolio.noCustomTypes')}
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
                        {t('common.save')}
                      </Button>
                      <Button size="sm" variant="outline" onClick={cancelEditType}>
                        {t('common.cancel')}
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
            placeholder={t('companyPortfolio.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder={t('companyPortfolio.filterByType')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('companyPortfolio.allTypes')}</SelectItem>
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
              ? t('companyPortfolio.noCompaniesFound')
              : t('companyPortfolio.noCompanies')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCompanies.map((company) => (
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
                      disabled={!canEditAll && company.created_by !== user?.id}
                      title={!canEditAll && company.created_by !== user?.id ? t('companyPortfolio.cannotEditOthers') : ''}
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
          ))}
        </div>
      )}
    </div>
  );
};
