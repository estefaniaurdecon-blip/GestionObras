import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { Package, Wrench, Download, Trash2, Search, RefreshCw, Loader2, Pencil, Minus, ArrowLeft, FileText, GitMerge, CheckCircle, LayoutDashboard, FileCheck, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { saveBase64File } from '@/utils/nativeFile';
import { InventoryAIAnalysis } from './InventoryAIAnalysis';
import { DeliveryNoteReview } from './DeliveryNoteReview';
import { InventoryDashboard } from './InventoryDashboard';
import { useDeliveryNotes } from '@/hooks/useDeliveryNotes';
import {
  deleteInventoryItem,
  listInventoryItems,
  mergeInventorySuppliers,
  updateInventoryItem,
  validateFixInventory,
  cleanInventory as cleanInventoryApi,
  populateInventoryFromReports as populateInventoryFromReportsApi,
} from '@/integrations/api/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

interface InventoryItem {
  id: string;
  work_id: string;
  item_type: 'material' | 'herramienta';
  category: string | null;
  name: string;
  quantity: number;
  unit: string;
  last_entry_date: string | null;
  last_supplier: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  product_code?: string | null;
  unit_price?: number | null;
  total_price?: number | null;
  delivery_note_number?: string | null;
  batch_number?: string | null;
  brand?: string | null;
  model?: string | null;
  condition?: string | null;
  location?: string | null;
  exit_date?: string | null;
  delivery_note_image?: string | null;
  observations?: string | null;
}

interface WorkInventoryProps {
  workId: string;
  workName: string;
  onBack?: () => void;
}

export const WorkInventory: React.FC<WorkInventoryProps> = ({ workId, workName, onBack }) => {
  const { t } = useTranslation();
  const [materials, setMaterials] = useState<InventoryItem[]>([]);
  const [tools, setTools] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [mergingSuppliers, setMergingSuppliers] = useState(false);
  const [exportingNotes, setExportingNotes] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [showRecalculateConfirm, setShowRecalculateConfirm] = useState(false);
  const [validating, setValidating] = useState(false);
  const [filterMonth, setFilterMonth] = useState<number | null>(null);
  const [filterYear, setFilterYear] = useState<number | null>(null);
  const [activeInventoryTab, setActiveInventoryTab] = useState<'dashboard' | 'pending' | 'materials' | 'tools'>('dashboard');
  const [activeTopPanel, setActiveTopPanel] = useState<'actions' | 'maintenance' | 'search' | null>('search');

  const formSchema = z.object({
    name: z.string().min(1, "El nombre es obligatorio"),
    quantity: z.number().min(0, "La cantidad debe ser mayor o igual a 0"),
    unit: z.string().min(1, "La unidad es obligatoria"),
    category: z.string().optional(),
    last_supplier: z.string().optional(),
    last_entry_date: z.string().optional(),
    notes: z.string().optional(),
    product_code: z.string().optional(),
    unit_price: z.number().optional(),
    delivery_note_number: z.string().optional(),
    batch_number: z.string().optional(),
    brand: z.string().optional(),
    model: z.string().optional(),
    condition: z.string().optional(),
    location: z.string().optional(),
    exit_date: z.string().optional(),
    observations: z.string().optional(),
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      quantity: 0,
      unit: "ud",
      category: "",
      notes: "",
      product_code: "",
      unit_price: undefined,
      delivery_note_number: "",
      batch_number: "",
      brand: "",
      model: "",
      condition: "nuevo",
      location: "",
      exit_date: "",
      observations: "",
    },
  });

  const syncInventoryFromReports = async () => {
    if (!workId) return;
    
    setSyncing(true);
    try {
      const data = await populateInventoryFromReportsApi({ work_id: workId, force: true });

      const messages = [];
      if (data.itemsInserted > 0) messages.push(`${data.itemsInserted} nuevos`);
      if (data.itemsUpdated > 0) messages.push(`${data.itemsUpdated} actualizados`);
      if (data.immediateConsumptionItems > 0) messages.push(`${data.immediateConsumptionItems} consumo directo`);
      
      toast.success(`Inventario recalculado`, {
        description: messages.join(', ') + ` de ${data.reportsAnalyzed} partes analizados`
      });
      loadInventory();
    } catch (error) {
      console.error('Error syncing inventory:', error);
      toast.error('Error al recalcular el inventario');
    } finally {
      setSyncing(false);
    }
  };

  const cleanInventory = async () => {
    if (!workId) return;
    
    setCleaning(true);
    try {
      const data = await cleanInventoryApi({ work_id: workId });

      toast.success(data.message || `Limpieza completada: ${data.deletedCount} items eliminados de servicios/alquileres`);
      loadInventory();
    } catch (error) {
      console.error('Error cleaning inventory:', error);
      toast.error('Error al limpiar el inventario');
    } finally {
      setCleaning(false);
    }
  };

  const mergeSuppliers = async () => {
    if (!workId) return;
    if (selectedSuppliers.length < 2) {
      toast.error('Selecciona al menos 2 proveedores para fusionar');
      return;
    }

    setMergingSuppliers(true);
    try {
      const targetSupplier = selectedSuppliers[0];
      const suppliersToMerge = selectedSuppliers.slice(1);
      const response = await mergeInventorySuppliers({
        work_id: workId,
        target_supplier: targetSupplier,
        suppliers_to_merge: suppliersToMerge,
      });

      toast.success(`Proveedores fusionados en "${targetSupplier}"`, {
        description: `${response.inventoryUpdated} elementos actualizados`,
      });
      setSelectedSuppliers([]);
      setShowMergeConfirm(false);
      loadInventory();
    } catch (error) {
      console.error('Error merging suppliers:', error);
      toast.error('Error al fusionar proveedores');
    } finally {
      setMergingSuppliers(false);
    }
  };

  const toggleSupplierSelection = (supplier: string) => {
    setSelectedSuppliers(prev => 
      prev.includes(supplier) 
        ? prev.filter(s => s !== supplier)
        : [...prev, supplier]
    );
  };

  const validateAndFixInventory = async () => {
    if (!workId) return;

    setValidating(true);
    try {
      const data = await validateFixInventory(workId);

      toast.success('Validación completada', {
        description: `${data.fixedCount} items corregidos, ${data.deletedCount} items eliminados`,
      });

      loadInventory();
    } catch (error) {
      console.error('Error validating inventory:', error);
      toast.error('Error al validar el inventario');
    } finally {
      setValidating(false);
    }
  };

  const loadInventory = async () => {
    if (!workId) return;

    setLoading(true);
    try {
      const data = await listInventoryItems(workId);
      const typedData = data as InventoryItem[];
      setMaterials(typedData.filter(item => item.item_type === 'material'));
      setTools(typedData.filter(item => item.item_type === 'herramienta'));
    } catch (error) {
      console.error('Error loading inventory:', error);
      toast.error('No se pudo cargar el inventario');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, [workId]);

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    form.reset({
      name: item.name,
      quantity: Number(item.quantity) || 0,
      unit: item.unit || "ud",
      category: item.category || "",
      last_supplier: item.last_supplier || "",
      last_entry_date: item.last_entry_date || "",
      notes: item.notes || "",
      product_code: item.product_code || "",
      unit_price: item.unit_price || undefined,
      delivery_note_number: item.delivery_note_number || "",
      batch_number: item.batch_number || "",
      brand: item.brand || "",
      model: item.model || "",
      condition: item.condition || "nuevo",
      location: item.location || "",
      exit_date: item.exit_date || "",
      observations: item.observations || "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async (values: z.infer<typeof formSchema>) => {
    if (!editingItem) return;

    try {
      const totalPrice = values.unit_price && values.quantity 
        ? values.unit_price * values.quantity 
        : null;

      // Normalizar la unidad antes de guardar
      const normalizedUnit = values.unit.toLowerCase().trim();

      await updateInventoryItem(workId, editingItem.id, {
        name: values.name,
        quantity: values.quantity,
        unit: normalizedUnit,
        category: values.category || null,
        last_supplier: values.last_supplier || null,
        last_entry_date: values.last_entry_date || null,
        notes: values.notes || null,
        product_code: values.product_code || null,
        unit_price: values.unit_price ?? null,
        total_price: totalPrice,
        delivery_note_number: values.delivery_note_number || null,
        batch_number: values.batch_number || null,
        brand: values.brand || null,
        model: values.model || null,
        condition: values.condition || null,
        location: values.location || null,
        exit_date: values.exit_date || null,
        observations: values.observations || null,
      });

      toast.success("Elemento actualizado correctamente");
      setEditDialogOpen(false);
      setEditingItem(null);
      loadInventory();
    } catch (error: any) {
      console.error("Error updating item:", error);
      const errorMsg = error?.message || "No se pudo actualizar el elemento";
      if (errorMsg.includes("duplicate key") || errorMsg.includes("unique constraint")) {
        toast.error("Ya existe un elemento con ese nombre y unidad en el inventario");
      } else {
        toast.error(`Error: ${errorMsg}`);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de eliminar este elemento del inventario?')) return;

    try {
      await deleteInventoryItem(workId, id);

      toast.success("Elemento eliminado del inventario");
      await loadInventory();
    } catch (error) {
      console.error('Error deleting inventory item:', error);
      toast.error("No se pudo eliminar el elemento");
    }
  };
  const exportToExcel = async () => {
    setExportingNotes(true);
  
    const allItems = [...materials, ...tools];
  
    if (allItems.length === 0) {
      toast.error('No hay elementos para exportar.');
      setExportingNotes(false);
      return;
    }
  
    const XLSX = await import('xlsx-js-style');
    const wb = XLSX.utils.book_new();
  
    // Function to generate worksheet from items
    const generateWorksheet = (items: InventoryItem[], sheetName: string) => {
      const wsData = [
        [
          'Nombre', 'Tipo', 'Categoría', 'Código', 'Marca', 'Modelo', 'Cantidad', 'Unidad',
          'Precio Unitario', 'Precio Total', 'Nº Albarán', 'Lote/Serie', 'Proveedor', 'Ubicación',
          'Estado', 'Fecha Entrada', 'Fecha Salida', 'Observaciones'
        ],
        ...items.map(item => [
          item.name, item.item_type, item.category || '', item.product_code || '', item.brand || '', item.model || '', item.quantity, item.unit,
          item.unit_price || '', item.total_price || '', item.delivery_note_number || '', item.batch_number || '', item.last_supplier || '', item.location || '',
          item.condition || '', item.last_entry_date || '', item.exit_date || '', item.observations || ''
        ])
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    };
  
    generateWorksheet(materials, 'Materiales');
    generateWorksheet(tools, 'Herramientas');
  
    // Function to convert workbook to base64
    const workbookToBase64 = (workbook: import('xlsx-js-style').WorkBook): string => {
      return XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
    };
  
    // Convert workbook to base64
    const wbBase64 = workbookToBase64(wb);
  
    // Save the file
    await saveBase64File(`inventario-${workName}.xlsx`, wbBase64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  
    setExportingNotes(false);
  };
  
  const exportMaterialDeliveryNotes = async () => {
    setExportingNotes(true);
  
    const allItems = [...materials, ...tools];
  
    if (allItems.length === 0) {
      toast.error('No hay elementos para exportar.');
      setExportingNotes(false);
      return;
    }
  
    // Filter items that have a delivery note number
    const itemsWithDeliveryNotes = allItems.filter(item => item.delivery_note_number);
  
    if (itemsWithDeliveryNotes.length === 0) {
      toast.error('No hay elementos con albarán para exportar.');
      setExportingNotes(false);
      return;
    }
  
    const XLSX = await import('xlsx-js-style');
    const wb = XLSX.utils.book_new();
  
    // Function to generate worksheet from items
    const generateWorksheet = (items: InventoryItem[], sheetName: string) => {
      const wsData = [
        [
          'Nombre', 'Tipo', 'Categoría', 'Código', 'Marca', 'Modelo', 'Cantidad', 'Unidad',
          'Precio Unitario', 'Precio Total', 'Nº Albarán', 'Lote/Serie', 'Proveedor', 'Ubicación',
          'Estado', 'Fecha Entrada', 'Fecha Salida', 'Observaciones'
        ],
        ...items.map(item => [
          item.name, item.item_type, item.category || '', item.product_code || '', item.brand || '', item.model || '', item.quantity, item.unit,
          item.unit_price || '', item.total_price || '', item.delivery_note_number || '', item.batch_number || '', item.last_supplier || '', item.location || '',
          item.condition || '', item.last_entry_date || '', item.exit_date || '', item.observations || ''
        ])
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    };
  
    generateWorksheet(itemsWithDeliveryNotes, 'Albaranes');
  
    // Function to convert workbook to base64
    const workbookToBase64 = (workbook: import('xlsx-js-style').WorkBook): string => {
      return XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' });
    };
  
    // Convert workbook to base64
    const wbBase64 = workbookToBase64(wb);
  
    // Save the file
    await saveBase64File(`albaranes-inventario-${workName}.xlsx`, wbBase64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  
    setExportingNotes(false);
  };

  const filterItems = (items: InventoryItem[]) => {
    let filtered = items;
    
    // Filtrar por búsqueda de texto
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(term) ||
        item.category?.toLowerCase().includes(term) ||
        item.last_supplier?.toLowerCase().includes(term) ||
        item.product_code?.toLowerCase().includes(term) ||
        item.brand?.toLowerCase().includes(term)
      );
    }
    
    // Filtrar por mes y año
    if (filterMonth !== null || filterYear !== null) {
      filtered = filtered.filter(item => {
        if (!item.last_entry_date) return false;
        
        const entryDate = new Date(item.last_entry_date);
        const itemMonth = entryDate.getMonth(); // 0-11
        const itemYear = entryDate.getFullYear();
        
        if (filterMonth !== null && filterYear !== null) {
          return itemMonth === filterMonth && itemYear === filterYear;
        } else if (filterMonth !== null) {
          return itemMonth === filterMonth;
        } else if (filterYear !== null) {
          return itemYear === filterYear;
        }
        
        return true;
      });
    }
    
    return filtered;
  };

  const filteredMaterials = useMemo(
    () => filterItems(materials),
    [materials, searchTerm, filterMonth, filterYear],
  );
  const filteredTools = useMemo(
    () => filterItems(tools),
    [tools, searchTerm, filterMonth, filterYear],
  );

  // Agrupar items por proveedor, luego por fecha y número de albarán
  const groupItemsByDelivery = (items: InventoryItem[]) => {
    const grouped: Record<string, Record<string, InventoryItem[]>> = {};

    items.forEach(item => {
      const supplier = item.last_supplier || 'Sin proveedor';
      const deliveryKey = `${item.delivery_note_number || 'Sin albarán'}_${item.last_entry_date || 'Sin fecha'}`;
      
      if (!grouped[supplier]) {
        grouped[supplier] = {};
      }
      if (!grouped[supplier][deliveryKey]) {
        grouped[supplier][deliveryKey] = [];
      }
      grouped[supplier][deliveryKey].push(item);
    });

    return grouped;
  };

  const renderInventoryTable = (filteredItems: InventoryItem[], type: 'material' | 'herramienta') => {
    if (filteredItems.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          {searchTerm || filterMonth !== null || filterYear !== null 
            ? 'No se encontraron resultados con los filtros aplicados' 
            : `No hay ${type === 'material' ? 'materiales' : 'herramientas'} en el inventario`}
        </div>
      );
    }

    const groupedItems = groupItemsByDelivery(filteredItems);

    return (
      <Accordion type="multiple" className="w-full space-y-2">
        {Object.entries(groupedItems).map(([supplier, deliveries]) => {
          const supplierTotal = Object.values(deliveries)
            .flat()
            .reduce((sum, item) => sum + (item.total_price || 0), 0);
          const supplierItemCount = Object.values(deliveries).flat().length;

          return (
            <AccordionItem key={supplier} value={supplier} className="border rounded-lg">
              <AccordionTrigger className="hover:no-underline px-4">
                <div className="flex items-center justify-between w-full pr-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedSuppliers.includes(supplier)}
                      onCheckedChange={() => toggleSupplierSelection(supplier)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Package className="h-5 w-5 text-primary" />
                    <div className="text-left">
                      <div className="font-semibold">{supplier}</div>
                      <div className="text-sm text-muted-foreground">
                        {supplierItemCount} elementos • {Object.keys(deliveries).length} albaranes
                      </div>
                    </div>
                  </div>
                  {supplierTotal > 0 && (
                    <Badge variant="secondary" className="text-base font-semibold">
                      {supplierTotal.toFixed(2)}€
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <Accordion type="multiple" className="space-y-2">
                  {Object.entries(deliveries).map(([deliveryKey, deliveryItems]) => {
                    const [deliveryNote, entryDate] = deliveryKey.split('_');
                    const deliveryTotal = deliveryItems.reduce((sum, item) => sum + (item.total_price || 0), 0);

                    return (
                      <AccordionItem 
                        key={deliveryKey} 
                        value={deliveryKey}
                        className="border rounded-md bg-muted/30"
                      >
                        <AccordionTrigger className="hover:no-underline px-3 py-2">
                          <div className="flex items-center justify-between w-full pr-4">
                            <div className="text-left">
                              <div className="font-medium text-sm">
                                {deliveryNote !== 'Sin albarán' && (
                                  <span className="font-mono">{deliveryNote}</span>
                                )}
                                {deliveryNote === 'Sin albarán' && (
                                  <span className="text-muted-foreground">{deliveryNote}</span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {entryDate !== 'Sin fecha' 
                                  ? format(new Date(entryDate), "d 'de' MMMM, yyyy", { locale: es })
                                  : 'Sin fecha'
                                } • {deliveryItems.length} elementos
                              </div>
                            </div>
                            {deliveryTotal > 0 && (
                              <Badge variant="outline" className="font-semibold">
                                {deliveryTotal.toFixed(2)}€
                              </Badge>
                            )}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-3 pb-3">
                          {/* Desktop Table */}
                          <div className="hidden lg:block mt-2">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="h-8">Código</TableHead>
                                  <TableHead className="h-8">Nombre</TableHead>
                                  <TableHead className="h-8">Marca/Modelo</TableHead>
                                  <TableHead className="h-8">Cantidad</TableHead>
                                  <TableHead className="h-8">P. Unit.</TableHead>
                                  <TableHead className="h-8">P. Total</TableHead>
                                  <TableHead className="h-8">Ubicación</TableHead>
                                  <TableHead className="h-8">Estado</TableHead>
                                  <TableHead className="h-8">Acciones</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {deliveryItems.map((item) => (
                                  <TableRow key={item.id}>
                                    <TableCell className="font-mono text-sm">{item.product_code || '-'}</TableCell>
                                    <TableCell className="font-medium">{item.name}</TableCell>
                                    <TableCell>
                                      {item.brand && item.model ? `${item.brand} ${item.model}` : item.brand || item.model || '-'}
                                    </TableCell>
                                    <TableCell>{item.quantity} {item.unit}</TableCell>
                                    <TableCell>{item.unit_price ? `${item.unit_price.toFixed(2)}€` : '-'}</TableCell>
                                    <TableCell className="font-semibold">
                                      {item.total_price ? `${item.total_price.toFixed(2)}€` : '-'}
                                    </TableCell>
                                    <TableCell>{item.location || '-'}</TableCell>
                                    <TableCell>
                                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                        item.condition === 'nuevo' ? 'bg-green-100 text-green-800' :
                                        item.condition === 'usado' ? 'bg-yellow-100 text-yellow-800' :
                                        item.condition === 'dañado' ? 'bg-red-100 text-red-800' :
                                        'bg-gray-100 text-gray-800'
                                      }`}>
                                        {item.condition || 'nuevo'}
                                      </span>
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex gap-2">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleEdit(item)}
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => handleDelete(item.id)}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>

                          {/* Mobile Cards */}
                          <div className="lg:hidden space-y-2 mt-2">
                            {deliveryItems.map((item) => (
                              <Card key={item.id} className="p-3">
                                <div className="space-y-3">
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <div className="font-medium">{item.name}</div>
                                      {item.product_code && (
                                        <div className="text-xs font-mono text-muted-foreground mt-1">
                                          {item.product_code}
                                        </div>
                                      )}
                                    </div>
                                    {item.total_price && (
                                      <Badge variant="secondary" className="font-semibold">
                                        {item.total_price.toFixed(2)}€
                                      </Badge>
                                    )}
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-2 text-sm">
                                    {item.brand && (
                                      <div>
                                        <span className="text-muted-foreground">Marca:</span>
                                        <p className="font-medium">{item.brand}</p>
                                      </div>
                                    )}
                                    {item.model && (
                                      <div>
                                        <span className="text-muted-foreground">Modelo:</span>
                                        <p className="font-medium">{item.model}</p>
                                      </div>
                                    )}
                                    <div>
                                      <span className="text-muted-foreground">Cantidad:</span>
                                      <p className="font-medium">{item.quantity} {item.unit}</p>
                                    </div>
                                    {item.unit_price && (
                                      <div>
                                        <span className="text-muted-foreground">P. Unit.:</span>
                                        <p className="font-medium">{item.unit_price.toFixed(2)}€</p>
                                      </div>
                                    )}
                                    {item.location && (
                                      <div>
                                        <span className="text-muted-foreground">Ubicación:</span>
                                        <p className="font-medium">{item.location}</p>
                                      </div>
                                    )}
                                    <div>
                                      <span className="text-muted-foreground">Estado:</span>
                                      <p className="font-medium capitalize">{item.condition || 'nuevo'}</p>
                                    </div>
                                  </div>

                                  {item.observations && (
                                    <div className="text-sm">
                                      <span className="text-muted-foreground">Observaciones:</span>
                                      <p className="mt-1 text-xs">{item.observations}</p>
                                    </div>
                                  )}

                                  <div className="flex gap-2 pt-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleEdit(item)}
                                      className="flex-1"
                                    >
                                      <Pencil className="h-4 w-4 mr-2" />
                                      Editar
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleDelete(item.id)}
                                      className="flex-1"
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      Eliminar
                                    </Button>
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    );
  };

  return (
    <Card className="w-full">
      <CardHeader className="space-y-4">
        <div className="relative min-h-10">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              className="absolute left-0 top-1/2 -translate-y-1/2"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="text-center">
            <CardTitle className="text-2xl">Inventario de Obra</CardTitle>
            <CardDescription>{workName}</CardDescription>
            <div className="text-[11px] text-muted-foreground">UI Inventario v2</div>
          </div>
        </div>


        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Button
            variant={activeTopPanel === 'actions' ? 'default' : 'outline'}
            onClick={() => setActiveTopPanel((prev) => (prev === 'actions' ? null : 'actions'))}
          >
            Acciones de Obra
          </Button>
          <Button
            variant={activeTopPanel === 'maintenance' ? 'default' : 'outline'}
            onClick={() => setActiveTopPanel((prev) => (prev === 'maintenance' ? null : 'maintenance'))}
          >
            Mantenimiento
          </Button>
          <Button
            variant={activeTopPanel === 'search' ? 'default' : 'outline'}
            onClick={() => setActiveTopPanel((prev) => (prev === 'search' ? null : 'search'))}
          >
            Busqueda
          </Button>
        </div>

        {activeTopPanel === 'actions' && (
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Acciones de obra</div>
                <p className="text-xs text-muted-foreground">
                  Exportacion global: incluye toda la obra y no depende de filtros ni pestana.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setActiveTopPanel(null)}>
                Ocultar
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowRecalculateConfirm(true)}
                disabled={syncing}
              >
                {syncing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Recalcular desde partes
              </Button>
              <Button variant="outline" size="sm" onClick={exportToExcel} disabled={exportingNotes}>
                {exportingNotes ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Exportar Excel
              </Button>
              <Button variant="outline" size="sm" onClick={exportMaterialDeliveryNotes} disabled={exportingNotes}>
                {exportingNotes ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                Exportar Albaranes
              </Button>
            </div>
          </div>
        )}

        {activeTopPanel === 'maintenance' && (
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Mantenimiento</div>
                <p className="text-xs text-muted-foreground">Correcciones avanzadas del inventario.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setActiveTopPanel(null)}>
                Ocultar
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={cleanInventory} disabled={cleaning}>
                {cleaning ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Limpiar Servicios
              </Button>
              <Button variant="outline" size="sm" onClick={validateAndFixInventory} disabled={validating}>
                {validating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Validar y Corregir
              </Button>
              {selectedSuppliers.length >= 2 && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setShowMergeConfirm(true)}
                  disabled={mergingSuppliers}
                >
                  {mergingSuppliers ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <GitMerge className="h-4 w-4 mr-2" />
                  )}
                  Fusionar ({selectedSuppliers.length})
                </Button>
              )}
            </div>
          </div>
        )}

        {activeTopPanel === 'search' && (
          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Busqueda y filtros</div>
                <p className="text-xs text-muted-foreground">
                  Filtran la visualizacion de materiales y herramientas de esta obra.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setActiveTopPanel(null)}>
                Ocultar
              </Button>
            </div>
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Buscar por nombre, codigo, marca..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[150px]">
                  <label className="text-sm font-medium mb-1 block">Mes</label>
                  <Select
                    value={filterMonth !== null ? filterMonth.toString() : "all"}
                    onValueChange={(value) => setFilterMonth(value === "all" ? null : parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos los meses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los meses</SelectItem>
                      <SelectItem value="0">Enero</SelectItem>
                      <SelectItem value="1">Febrero</SelectItem>
                      <SelectItem value="2">Marzo</SelectItem>
                      <SelectItem value="3">Abril</SelectItem>
                      <SelectItem value="4">Mayo</SelectItem>
                      <SelectItem value="5">Junio</SelectItem>
                      <SelectItem value="6">Julio</SelectItem>
                      <SelectItem value="7">Agosto</SelectItem>
                      <SelectItem value="8">Septiembre</SelectItem>
                      <SelectItem value="9">Octubre</SelectItem>
                      <SelectItem value="10">Noviembre</SelectItem>
                      <SelectItem value="11">Diciembre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[150px]">
                  <label className="text-sm font-medium mb-1 block">Ano</label>
                  <Select
                    value={filterYear !== null ? filterYear.toString() : "all"}
                    onValueChange={(value) => setFilterYear(value === "all" ? null : parseInt(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Todos los anos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los anos</SelectItem>
                      {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map(year => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(filterMonth !== null || filterYear !== null || searchTerm.trim().length > 0) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFilterMonth(null);
                      setFilterYear(null);
                      setSearchTerm('');
                    }}
                  >
                    Limpiar filtros
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <Tabs
          value={activeInventoryTab}
          onValueChange={(value) => setActiveInventoryTab(value as 'dashboard' | 'pending' | 'materials' | 'tools')}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="dashboard">
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="pending" className="relative">
              <FileCheck className="h-4 w-4 mr-2" />
              Albaranes
            </TabsTrigger>
            <TabsTrigger value="materials">
              <Package className="h-4 w-4 mr-2" />
              Materiales ({filteredMaterials.length})
            </TabsTrigger>
            <TabsTrigger value="tools">
              <Wrench className="h-4 w-4 mr-2" />
              Herramientas ({filteredTools.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-4">
            {activeInventoryTab === 'dashboard' ? <InventoryDashboard workId={workId} workName={workName} /> : null}
          </TabsContent>

          <TabsContent value="pending" className="mt-4">
            {activeInventoryTab === 'pending' ? <DeliveryNoteReview workId={workId} workName={workName} /> : null}
          </TabsContent>

          <TabsContent value="materials">
            {loading ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto" />
              </div>
            ) : (
              activeInventoryTab === 'materials' ? renderInventoryTable(filteredMaterials, 'material') : null
            )}
          </TabsContent>

          <TabsContent value="tools">
            {loading ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto" />
              </div>
            ) : (
              activeInventoryTab === 'tools' ? renderInventoryTable(filteredTools, 'herramienta') : null
            )}
          </TabsContent>
        </Tabs>

        {/* AI Analysis Section */}
        <div className="mt-6">
          <InventoryAIAnalysis 
            workId={workId} 
            onAnalysisComplete={loadInventory}
          />
        </div>
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Elemento</DialogTitle>
            <DialogDescription>
              Modifica los datos del elemento del inventario
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSaveEdit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="product_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ej: MAT-001" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoría</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="brand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Marca</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="model"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Modelo</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cantidad</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unidad</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona unidad" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-background z-50">
                          <SelectItem value="ud">ud (Unidades)</SelectItem>
                          <SelectItem value="kg">kg (Kilogramos)</SelectItem>
                          <SelectItem value="t">t (Toneladas)</SelectItem>
                          <SelectItem value="m">m (Metros)</SelectItem>
                          <SelectItem value="m²">m² (Metros cuadrados)</SelectItem>
                          <SelectItem value="m³">m³ (Metros cúbicos)</SelectItem>
                          <SelectItem value="l">l (Litros)</SelectItem>
                          <SelectItem value="ml">ml (Mililitros)</SelectItem>
                          <SelectItem value="g">g (Gramos)</SelectItem>
                          <SelectItem value="h">h (Horas)</SelectItem>
                          <SelectItem value="día">día (Días)</SelectItem>
                          <SelectItem value="mes">mes (Meses)</SelectItem>
                          <SelectItem value="pza">pza (Piezas)</SelectItem>
                          <SelectItem value="caja">caja (Cajas)</SelectItem>
                          <SelectItem value="pallet">pallet (Pallets)</SelectItem>
                          <SelectItem value="pack">pack (Paquetes)</SelectItem>
                          <SelectItem value="rollo">rollo (Rollos)</SelectItem>
                          <SelectItem value="saco">saco (Sacos)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unit_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Precio Unitario (€)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="delivery_note_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nº Albarán</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="batch_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lote/Serie</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="last_supplier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Proveedor</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ubicación</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Planta 2, Zona A" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="condition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="nuevo">Nuevo</SelectItem>
                          <SelectItem value="usado">Usado</SelectItem>
                          <SelectItem value="dañado">Dañado</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="last_entry_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha Entrada</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="exit_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fecha Salida</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="observations"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Observaciones</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Guardar</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showRecalculateConfirm} onOpenChange={setShowRecalculateConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recalcular inventario desde partes</AlertDialogTitle>
            <AlertDialogDescription>
              Se reprocesarán todos los partes completados de esta obra para actualizar el inventario.
              Esta acción puede modificar cantidades y clasificaciones actuales.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={syncInventoryFromReports} disabled={syncing}>
              {syncing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Recalculando...
                </>
              ) : (
                'Recalcular'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Merge Suppliers Confirmation Dialog */}
      <AlertDialog open={showMergeConfirm} onOpenChange={setShowMergeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fusionar Proveedores</AlertDialogTitle>
            <AlertDialogDescription>
              Los siguientes proveedores se fusionarán en <strong>"{selectedSuppliers[0]}"</strong>:
              <ul className="mt-2 ml-4 list-disc space-y-1">
                {selectedSuppliers.slice(1).map(supplier => (
                  <li key={supplier} className="text-sm">{supplier}</li>
                ))}
              </ul>
              <p className="mt-3 text-destructive font-medium">
                Todos los albaranes e ítems de los proveedores fusionados se asignarán a "{selectedSuppliers[0]}".
                Esta acción no se puede deshacer.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={mergeSuppliers} disabled={mergingSuppliers}>
              {mergingSuppliers ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Fusionando...
                </>
              ) : (
                'Fusionar Proveedores'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};




