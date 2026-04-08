import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import {
  createMessage,
  deleteConversationMessages,
  deleteMessage,
  listMessages,
  listContactUsersByTenant,
  type ApiUser,
} from '@/integrations/api/client';
import { getActiveTenantId } from '@/offline-db/tenantScope';
import { toast } from '@/hooks/use-toast';
import helpCatalogData from '@/content/helpCatalog.json';
import { 
  Send, 
  BookOpen, 
  HelpCircle, 
  MessageSquare, 
  Loader2,
  Search,
  FileText,
  Users,
  Building2,
  Package,
  Briefcase,
  TrendingUp,
  Shield,
  Globe,
  FileCheck,
  Zap,
  Trash2,
  Trash,
  Mic,
  Bot,
  Calendar,
  Share2,
  WifiOff,
  Bell,
  Building,
  Scan,
  ChevronRight,
  CheckCircle2,
  Clock,
  Truck,
  Wrench,
  BarChart3,
  Lock,
  Key,
  UserCheck,
  Printer,
  Upload,
  Download,
  Settings,
  Play,
  Camera,
  ClipboardList,
  FolderOpen,
  Navigation,
  Copy
} from 'lucide-react';

interface Message {
  id: string;
  from_user_id: string;
  to_user_id: string;
  message: string;
  created_at: string;
  from_user_name?: string;
}

interface FeatureCategory {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  gradient: string;
  features: FeatureCard[];
}

interface FeatureCard {
  id: string;
  icon: string;
  title: string;
  description: string;
  steps: string[];
  tips?: string[];
  roles: string[];
}

type CurrentHelpRole = 'super_admin' | 'tenant_admin' | 'usuario';

const ADMIN_ROLE_NAMES = new Set([
  'admin',
  'master',
  'super_admin',
  'tenant_admin',
]);

const hasAdminRole = (candidate: ApiUser): boolean => {
  if (candidate.is_super_admin) return true;
  const roleNames = Array.isArray(candidate.roles)
    ? candidate.roles
    : candidate.role_name
      ? [String(candidate.role_name)]
      : [];
  return roleNames.some((role) => ADMIN_ROLE_NAMES.has(String(role).trim().toLowerCase()));
};

const CURRENT_ROLE_META: Record<
  CurrentHelpRole,
  { label: string; badge: string; description: string }
> = {
  super_admin: {
    label: 'Super Admin',
    badge: 'bg-purple-100 text-purple-800 border-purple-300 border-2',
    description: 'Acceso global de plataforma y administracion transversal.',
  },
  tenant_admin: {
    label: 'Tenant Admin',
    badge: 'bg-destructive/10 text-destructive border-destructive/30',
    description: 'Administra usuarios, obras y configuracion operativa de su tenant.',
  },
  usuario: {
    label: 'Usuario',
    badge: 'bg-muted text-muted-foreground border-border',
    description: 'Uso operativo diario de la aplicacion segun los permisos asignados.',
  },
};

const getCurrentHelpRole = (
  candidate:
    | {
        is_super_admin?: boolean | null;
        roles?: unknown;
        role_name?: unknown;
      }
    | null
    | undefined,
): CurrentHelpRole => {
  if (candidate?.is_super_admin) return 'super_admin';

  const normalizedRoles = new Set(
    (Array.isArray(candidate?.roles) ? candidate.roles : [candidate?.role_name])
      .map((role) => String(role ?? '').trim().toLowerCase())
      .filter(Boolean),
  );

  if (normalizedRoles.has('super_admin') || normalizedRoles.has('master')) {
    return 'super_admin';
  }

  if (
    normalizedRoles.has('tenant_admin') ||
    normalizedRoles.has('admin') ||
    normalizedRoles.has('site_manager')
  ) {
    return 'tenant_admin';
  }

  return 'usuario';
};

const featureMatchesCurrentRole = (featureRoles: string[], currentRole: CurrentHelpRole): boolean => {
  if (currentRole === 'super_admin' || currentRole === 'tenant_admin') {
    return true;
  }

  const normalized = new Set(featureRoles.map((role) => role.trim().toLowerCase()));
  return (
    normalized.has('usuario') ||
    normalized.has('foreman') ||
    normalized.has('ofi') ||
    normalized.has('reader')
  );
};

const LEGACY_HELP_CATEGORY_IDS = new Set(['office-role', 'reader-role']);

const HELP_ICON_MAP = {
  Send,
  BookOpen,
  HelpCircle,
  MessageSquare,
  Loader2,
  Search,
  FileText,
  Users,
  Building2,
  Package,
  Briefcase,
  TrendingUp,
  Shield,
  Globe,
  FileCheck,
  Zap,
  Trash2,
  Trash,
  Mic,
  Bot,
  Calendar,
  Share2,
  WifiOff,
  Bell,
  Building,
  Scan,
  ChevronRight,
  CheckCircle2,
  Clock,
  Truck,
  Wrench,
  BarChart3,
  Lock,
  Key,
  UserCheck,
  Printer,
  Upload,
  Download,
  Settings,
  Play,
  Camera,
  ClipboardList,
  FolderOpen,
  Navigation,
  Copy,
} as const;

const getHelpIcon = (iconName: string) => HELP_ICON_MAP[iconName as keyof typeof HELP_ICON_MAP] ?? HelpCircle;

export const HelpCenter = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const currentUserId = user ? String(user.id) : null;
  const [adminId, setAdminId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);

  useEffect(() => {
    void loadAdmin();
  }, [user?.id, user?.tenant_id, currentUserId]);

  useEffect(() => {
    if (adminId && currentUserId) {
      loadMessages();
      const channel = subscribeToMessages();
      return () => {
        channel.unsubscribe();
      };
    }
  }, [adminId, currentUserId]);

  const loadAdmin = async () => {
    if (!user || !currentUserId) {
      setAdminId(null);
      return;
    }

    try {
      const activeTenantId = await getActiveTenantId(user);
      if (!activeTenantId) {
        setAdminId(null);
        return;
      }

      const users = await listContactUsersByTenant(Number(activeTenantId));
      const adminUser = users.find(
        (candidate) =>
          candidate.is_active &&
          String(candidate.id) !== currentUserId &&
          hasAdminRole(candidate)
      );
      setAdminId(adminUser ? String(adminUser.id) : null);
    } catch (error) {
      console.error('Error loading admin:', error);
      setAdminId(null);
    }
  };

  const loadMessages = async () => {
    if (!currentUserId || !adminId) return;
    
    setLoading(true);
    try {
      const response = await listMessages({ limit: 500, offset: 0 });
      const messagesWithNames = response.items
        .filter(
          (msg) =>
            (msg.from_user_id === currentUserId && msg.to_user_id === adminId) ||
            (msg.from_user_id === adminId && msg.to_user_id === currentUserId)
        )
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )
        .map((msg) => ({
          id: String(msg.id),
          from_user_id: msg.from_user_id,
          to_user_id: msg.to_user_id,
          message: msg.message,
          created_at: msg.created_at,
          from_user_name: msg.from_user?.full_name || 'Usuario',
        }));
      
      setMessages(messagesWithNames);
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const subscribeToMessages = () => {
    const pollId = window.setInterval(() => {
      void loadMessages();
    }, 10000);
    return {
      unsubscribe: () => window.clearInterval(pollId),
    };
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !currentUserId || !adminId) return;

    setSendingMessage(true);
    try {
      await createMessage({
        to_user_id: adminId,
        message: newMessage.trim(),
      });

      setNewMessage('');
      toast({ title: t('help.messageSent'), description: t('help.messageSentDesc') });
      loadMessages();
    } catch (error: any) {
      console.error('Error sending message:', error);
      toast({ title: t('help.errorSending'), description: t('help.errorSendingDesc'), variant: 'destructive' });
    } finally {
      setSendingMessage(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    const numericId = Number(messageId);
    if (!Number.isFinite(numericId)) return;
    try {
      await deleteMessage(numericId);
      toast({ title: t('help.messageDeleted'), description: t('help.messageDeletedDesc') });
      loadMessages();
    } catch (error: any) {
      console.error('Error deleting message:', error);
      toast({ title: t('help.errorDeleting'), description: t('help.errorDeletingDesc'), variant: 'destructive' });
    }
  };

  const handleClearConversation = async () => {
    if (!currentUserId || !adminId) return;
    if (!confirm(t('help.clearConfirm'))) return;

    try {
      await deleteConversationMessages(adminId);
      toast({ title: t('help.conversationCleared'), description: t('help.conversationClearedDesc') });
      loadMessages();
    } catch (error: any) {
      console.error('Error clearing conversation:', error);
      toast({ title: t('help.errorClearing'), description: t('help.errorClearingDesc'), variant: 'destructive' });
    }
  };

  const currentRole = getCurrentHelpRole(user);
  const currentRoleMeta = CURRENT_ROLE_META[currentRole];

  // Definir categorías con sus funcionalidades
  const featureCategories: FeatureCategory[] = helpCatalogData as FeatureCategory[];

  const filteredCategories = featureCategories
    .filter((category) => !LEGACY_HELP_CATEGORY_IDS.has(category.id))
    .filter(category =>
      category.features.some(feature => featureMatchesCurrentRole(feature.roles, currentRole))
    ).map(category => ({
      ...category,
      features: category.features.filter(feature => featureMatchesCurrentRole(feature.roles, currentRole))
    }));

  // Filtrar por búsqueda
  const searchFilteredCategories = searchQuery
    ? filteredCategories.map(category => ({
        ...category,
        features: category.features.filter(feature =>
          feature.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          feature.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          feature.steps.some(step => step.toLowerCase().includes(searchQuery.toLowerCase()))
        )
      })).filter(category => category.features.length > 0)
    : filteredCategories;

  const faqItems = [
    { q: 'isMyDataSecure', a: 'isMyDataSecureAnswer' },
    { q: 'whatIsRLS', a: 'whatIsRLSAnswer' },
    { q: 'whatIsJWTAuth', a: 'whatIsJWTAuthAnswer' },
    { q: 'complianceStandards', a: 'complianceStandardsAnswer' },
    { q: 'canEditAfterSave', a: 'canEditAfterSaveAnswer' },
    { q: 'autoSync', a: 'autoSyncAnswer' },
    { q: 'approveReports', a: 'approveReportsAnswer' },
    { q: 'manageLanguage', a: 'manageLanguageAnswer' },
    { q: 'exportFormats', a: 'exportFormatsAnswer' },
    { q: 'offlineUse', a: 'offlineUseAnswer' },
    { q: 'recoverPassword', a: 'recoverPasswordAnswer' },
    { q: 'duplicateReport', a: 'duplicateReportAnswer' },
    { q: 'whatIsSubscription', a: 'whatIsSubscriptionAnswer' },
    { q: 'howToUpdateApp', a: 'howToUpdateAppAnswer' },
    { q: 'customBranding', a: 'customBrandingAnswer' },
    { q: 'aiAnalysisFeatures', a: 'aiAnalysisFeaturesAnswer' },
    { q: 'ocrScanning', a: 'ocrScanningAnswer' },
    { q: 'economicReports', a: 'economicReportsAnswer' },
    { q: 'advancedReports', a: 'advancedReportsAnswer' },
    { q: 'duplicateInvoices', a: 'duplicateInvoicesAnswer' },
    { q: 'autoRelocateInvoices', a: 'autoRelocateInvoicesAnswer' },
    { q: 'globalDuplicateCheck', a: 'globalDuplicateCheckAnswer' },
    { q: 'autoCreateWorkReport', a: 'autoCreateWorkReportAnswer' },
    { q: 'rentalMachineryManagement', a: 'rentalMachineryManagementAnswer' },
    { q: 'voiceCommands', a: 'voiceCommandsAnswer' },
    { q: 'howToNotifications', a: 'howToNotificationsAnswer' },
  ];

  const filteredFaq = faqItems.filter(item =>
    searchQuery === '' || 
    t(`help.${item.q}`).toLowerCase().includes(searchQuery.toLowerCase()) ||
    t(`help.${item.a}`).toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderFeatureDetail = (feature: FeatureCard) => {
    const FeatureIcon = getHelpIcon(feature.icon);

    return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/50">
        <FeatureIcon className="h-6 w-6 text-primary mt-0.5 shrink-0" />
        <div>
          <h4 className="font-semibold text-lg">{feature.title}</h4>
          <p className="text-muted-foreground text-sm">{feature.description}</p>
        </div>
      </div>
      
      <div className="space-y-3">
        <h5 className="font-medium flex items-center gap-2">
          <Play className="h-4 w-4 text-primary" />
          Pasos a seguir
        </h5>
        <div className="space-y-2">
          {feature.steps.map((step, index) => (
            <div 
              key={index} 
              className="flex items-start gap-3 p-3 rounded-lg border bg-background hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-sm font-medium shrink-0">
                {index + 1}
              </div>
              <p className="text-sm pt-0.5">{step}</p>
            </div>
          ))}
        </div>
      </div>

      {feature.tips && feature.tips.length > 0 && (
        <div className="space-y-3 mt-4">
          <h5 className="font-medium flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            Consejos útiles
          </h5>
          <div className="grid gap-2">
            {feature.tips.map((tip, index) => (
              <div 
                key={index} 
                className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20"
              >
                <CheckCircle2 className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-900 dark:text-amber-100">{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button 
        variant="outline" 
        size="sm" 
        className="mt-4"
        onClick={() => setExpandedFeature(null)}
      >
        ← Volver a la categoría
      </Button>
    </div>
    );
  };

  const renderCategoryContent = (category: FeatureCategory) => {
    const CategoryIcon = getHelpIcon(category.icon);

    return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className={`p-4 rounded-lg bg-gradient-to-r ${category.gradient} border`}>
        <div className="flex items-center gap-3">
          <CategoryIcon className={`h-8 w-8 ${category.color}`} />
          <div>
            <h3 className="font-bold text-lg">{category.title}</h3>
            <p className="text-muted-foreground text-sm">{category.description}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {category.features.map((feature) => {
          const FeatureIcon = getHelpIcon(feature.icon);

          return (
            <button
              key={feature.id}
              onClick={() => setExpandedFeature(feature.id)}
              className="flex items-center gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-all duration-200 hover:shadow-md text-left group"
            >
              <div className={`p-2 rounded-lg ${category.gradient}`}>
                <FeatureIcon className={`h-5 w-5 ${category.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium group-hover:text-primary transition-colors">{feature.title}</h4>
                <p className="text-sm text-muted-foreground truncate">{feature.description}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
            </button>
          );
        })}
      </div>

      <Button 
        variant="outline" 
        size="sm"
        onClick={() => setSelectedCategory(null)}
      >
        ← Volver a categorías
      </Button>
    </div>
    );
  };

  const renderCategories = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {searchFilteredCategories.map((category) => {
        const CategoryIcon = getHelpIcon(category.icon);

        return (
        <button
          key={category.id}
          onClick={() => setSelectedCategory(category.id)}
          className={`p-4 rounded-xl border bg-gradient-to-br ${category.gradient} hover:shadow-lg transition-all duration-300 text-left group hover:-translate-y-1`}
        >
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-xl bg-background/80 shadow-sm">
              <CategoryIcon className={`h-6 w-6 ${category.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold group-hover:text-primary transition-colors">{category.title}</h3>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{category.description}</p>
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <span>{category.features.length}</span>
                <span>guías disponibles</span>
              </div>
            </div>
          </div>
        </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header con búsqueda */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl sm:text-3xl flex items-center gap-2">
                <HelpCircle className="h-7 w-7 text-primary" />
                {t('help.title')}
              </CardTitle>
              <CardDescription className="text-base mt-2">
                {t('help.description')}
              </CardDescription>
              <p className="mt-2 text-sm text-muted-foreground">
                Roles vigentes: <span className="font-medium text-foreground">super_admin</span>, <span className="font-medium text-foreground">tenant_admin</span> y <span className="font-medium text-foreground">usuario</span>.
              </p>
            </div>
            <Badge className={currentRoleMeta.badge}>{currentRoleMeta.label}</Badge>
          </div>
          
          <div className="mt-4 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('help.searchHelp')}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedCategory(null);
                setExpandedFeature(null);
              }}
              className="pl-10"
            />
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="features" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="features" className="text-xs sm:text-sm">
            <BookOpen className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">{t('help.features')}</span>
            <span className="sm:hidden">{t('help.guide')}</span>
          </TabsTrigger>
          <TabsTrigger value="faq" className="text-xs sm:text-sm">
            <HelpCircle className="h-4 w-4 mr-1 sm:mr-2" />
            <span>FAQ</span>
          </TabsTrigger>
          <TabsTrigger value="chat" className="text-xs sm:text-sm">
            <MessageSquare className="h-4 w-4 mr-1 sm:mr-2" />
            <span className="hidden sm:inline">{t('help.chat')}</span>
            <span className="sm:hidden">Chat</span>
          </TabsTrigger>
        </TabsList>

        {/* Features Tab */}
        <TabsContent value="features" className="space-y-4">
          {expandedFeature ? (
            (() => {
              const feature = searchFilteredCategories
                .flatMap(c => c.features)
                .find(f => f.id === expandedFeature);
              return feature ? renderFeatureDetail(feature) : null;
            })()
          ) : selectedCategory ? (
            (() => {
              const category = searchFilteredCategories.find(c => c.id === selectedCategory);
              return category ? renderCategoryContent(category) : null;
            })()
          ) : (
            <>
              {searchFilteredCategories.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="text-muted-foreground">No se encontraron resultados para "{searchQuery}"</p>
                    <Button 
                      variant="link" 
                      onClick={() => setSearchQuery('')}
                      className="mt-2"
                    >
                      Limpiar búsqueda
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                renderCategories()
              )}

              {/* Roles Section - Solo roles administrativos actuales */}
              {currentRole !== 'usuario' && !searchQuery && (
                <Card className="mt-6 border-primary/20">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      {t('help.permissionsRoles')}
                    </CardTitle>
                    <CardDescription>
                      Roles actuales de la plataforma. Algunas guías antiguas todavía pueden usar nomenclatura legacy mientras terminamos la migración.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {(Object.entries(CURRENT_ROLE_META) as Array<[CurrentHelpRole, typeof CURRENT_ROLE_META[CurrentHelpRole]]>).map(([role, meta]) => (
                        <div key={role} className="p-4 border rounded-lg hover:shadow-sm transition-shadow">
                          <Badge className={meta.badge}>
                            {meta.label}
                          </Badge>
                          <p className="text-sm text-muted-foreground mt-2">{meta.description}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* FAQ Tab */}
        <TabsContent value="faq" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              {filteredFaq.length === 0 ? (
                <div className="py-12 text-center">
                  <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-muted-foreground">No se encontraron preguntas para "{searchQuery}"</p>
                </div>
              ) : (
                <Accordion type="single" collapsible className="w-full">
                  {filteredFaq.map((item, index) => (
                    <AccordionItem key={index} value={`faq-${index}`}>
                      <AccordionTrigger className="text-left hover:no-underline">
                        <span className="flex items-center gap-2">
                          <HelpCircle className="h-4 w-4 text-primary shrink-0" />
                          {t(`help.${item.q}`)}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="text-sm sm:text-base text-muted-foreground pl-6">
                        {t(`help.${item.a}`)}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Chat Tab */}
        <TabsContent value="chat" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              {!adminId ? (
                <div className="text-center py-12">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p className="text-muted-foreground">{t('help.noAdminAvailable')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.length > 0 && (
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleClearConversation}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash className="h-4 w-4 mr-2" />
                        {t('help.clearConversation')}
                      </Button>
                    </div>
                  )}
                  <ScrollArea className="h-[300px] sm:h-[400px] w-full rounded-lg border p-4 bg-muted/30">
                    {loading ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center py-12">
                        <MessageSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                        <p className="text-sm text-muted-foreground">{t('help.noMessages')}</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {messages.map((message) => {
                          const isMe = message.from_user_id === currentUserId;
                          return (
                            <div
                              key={message.id}
                              className={`flex ${isMe ? 'justify-end' : 'justify-start'} group`}
                            >
                              <div className="flex items-start gap-2 max-w-[85%]">
                                {isMe && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1"
                                    onClick={() => handleDeleteMessage(message.id)}
                                    title={t('help.deleteMessage')}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </Button>
                                )}
                                <div
                                  className={`rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                                    isMe
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-background border'
                                  }`}
                                >
                                  <p className="font-medium text-xs mb-1 opacity-70">
                                    {isMe ? t('help.you') : t('help.administrator')}
                                  </p>
                                  <p className="break-words">{message.message}</p>
                                  <p className="text-xs opacity-60 mt-1.5">
                                    {new Date(message.created_at).toLocaleString('es-ES', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>

                  <div className="flex gap-2">
                    <Textarea
                      placeholder={t('help.writeMessage')}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      className="min-h-[80px] text-sm resize-none"
                      disabled={sendingMessage}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={!newMessage.trim() || sendingMessage}
                      size="icon"
                      className="h-[80px] w-14 shrink-0"
                    >
                      {sendingMessage ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Send className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

