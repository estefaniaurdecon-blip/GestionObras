import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { UserWithAssignments, AppRole } from '@/types/user';
import { useUsers } from '@/hooks/useUsers';
import { Loader2, UserPlus, Settings2, Crown, Building2, Mail, Phone } from 'lucide-react';
import { useOrganization } from '@/hooks/useOrganization';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SubscriptionManagement } from '@/components/SubscriptionManagement';
import { OrganizationSettings } from '@/components/OrganizationSettings';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  listProjects,
  addManagedUserRole,
  removeManagedUserRole,
  assignManagedUserToWork,
  removeManagedUserFromWork,
} from '@/integrations/api/client';

const getRoleLabel = (role: AppRole, t: any): string => {
  const labels: Record<AppRole, string> = {
    master: t('roles.master'),
    admin: t('roles.admin'),
    site_manager: t('roles.siteManager'),
    foreman: t('roles.foreman'),
    reader: t('roles.reader'),
    ofi: t('roles.ofi', 'Oficina'),
  };
  return labels[role];
};

const roleColors: Record<AppRole, string> = {
  master: 'bg-purple-100 text-purple-800 border-purple-300 border-2',
  admin: 'bg-red-100 text-red-800',
  site_manager: 'bg-blue-100 text-blue-800',
  foreman: 'bg-green-100 text-green-800',
  reader: 'bg-gray-100 text-gray-800',
  ofi: 'bg-orange-100 text-orange-800',
};

export const UserManagement = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { users, loading, loadUsers, getUserRoles, getUserAssignments, approveUser, deleteUser } = useUsers();
  const { organization } = useOrganization();
  const [usersWithData, setUsersWithData] = useState<UserWithAssignments[]>([]);
  const [pendingUsers, setPendingUsers] = useState<UserWithAssignments[]>([]);
  const [assignableWorks, setAssignableWorks] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserWithAssignments | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AppRole>('foreman');

  // Load works available for assignment via API
  useEffect(() => {
    const loadWorks = async () => {
      try {
        const projects = await listProjects();
        setAssignableWorks(projects);
      } catch (error) {
        console.error('Error loading works:', error);
      }
    };
    loadWorks();
  }, []);

  // Load user roles and assignments
  useEffect(() => {
    const loadUserData = async () => {
      const data = await Promise.all(
        users.map(async (user) => {
          const roles = await getUserRoles(user.id);
          const assigned_works = await getUserAssignments(user.id);
          return { ...user, roles, assigned_works };
        })
      );
      
      // Separate approved and pending users
      const approved = data.filter(u => u.approved !== false);
      const pending = data.filter(u => u.approved === false);
      
      setUsersWithData(approved);
      setPendingUsers(pending);
    };

    if (users.length > 0) {
      loadUserData();
    }
  }, [users, getUserRoles, getUserAssignments]);

  const handleManageUser = (user: UserWithAssignments) => {
    setSelectedUser(user);
    setIsDialogOpen(true);
  };

  const handleAddRole = async (role: AppRole) => {
    if (!selectedUser) return;

    console.log('handleAddRole - selectedUser:', selectedUser);
    console.log('handleAddRole - organization_id:', selectedUser.organization_id);

    try {
      await addManagedUserRole(Number(selectedUser.id), role);

      toast({
        title: t('userManagement.roleAdded'),
        description: t('userManagement.roleAddedDesc', { role: getRoleLabel(role, t) }),
      });

      await loadUsers();
      
      // Reload the user completely from database
      const updatedUser = users.find(u => u.id === selectedUser.id);
      if (updatedUser) {
        const roles = await getUserRoles(selectedUser.id);
        const assigned_works = await getUserAssignments(selectedUser.id);
        setSelectedUser({ ...updatedUser, roles, assigned_works });
      }
    } catch (error: any) {
      console.error('Error adding role:', error);
      toast({
        title: t('userManagement.errorAddingRole'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRemoveRole = async (role: AppRole) => {
    if (!selectedUser) return;

    try {
      await removeManagedUserRole(Number(selectedUser.id), role);

      toast({
        title: t('userManagement.roleRemoved'),
        description: t('userManagement.roleRemovedDesc', { role: getRoleLabel(role, t) }),
      });

      await loadUsers();
      // Reload the dialog's user data
      const roles = await getUserRoles(selectedUser.id);
      const assigned_works = await getUserAssignments(selectedUser.id);
      setSelectedUser({ ...selectedUser, roles, assigned_works });
      
      toast({
        title: t('userManagement.roleRemoved'),
        description: t('userManagement.roleRemovedDesc', { role: getRoleLabel(role, t) }),
      });
    } catch (error: any) {
      toast({
        title: t('userManagement.errorRemovingRole'),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleStartTrial = () => {
    // TODO: Integrar con Google Play Billing
    toast({
      title: "Iniciando periodo de prueba",
      description: "Se abrirá la ventana de pago de Google Play...",
    });
  };

  const handleRestorePurchases = async () => {
    // TODO: Integrar con Google Play Billing para restaurar compras
    toast({
      title: "Restaurando compras",
      description: "Verificando compras anteriores...",
    });
  };

  const handleManageInPlayStore = () => {
    // TODO: Abrir la URL de gestión de suscripciones en Google Play
    const playStoreUrl = 'https://play.google.com/store/account/subscriptions';
    window.open(playStoreUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Tabs defaultValue="users" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="users" className="flex items-center gap-2">
          <UserPlus className="h-4 w-4" />
          <span className="hidden sm:inline">{t('navigation.userManagement')}</span>
          <span className="sm:hidden">{t('userManagement.user')}</span>
        </TabsTrigger>
        <TabsTrigger value="organization" className="flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          <span className="hidden sm:inline">{t('userManagement.organization')}</span>
          <span className="sm:hidden">{t('userManagement.company')}</span>
        </TabsTrigger>
        <TabsTrigger value="subscription" className="flex items-center gap-2">
          <Crown className="h-4 w-4" />
          <span className="hidden sm:inline">{t('subscription.management.title')}</span>
          <span className="sm:hidden">{t('userManagement.plan')}</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="users" className="space-y-4 mt-6">
      {/* Pending Users Section */}
      {pendingUsers.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-800">
              <UserPlus className="h-5 w-5" />
              {t('common.pending')} {t('navigation.userManagement')}
            </CardTitle>
            <CardDescription className="text-yellow-700">
              {t('common.approve')} {t('common.status')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingUsers.map((user) => (
                <div key={user.id} className={`p-3 bg-white border rounded-lg ${isMobile ? 'space-y-3' : 'flex items-center justify-between'}`}>
                  <div>
                    <p className="font-medium">{user.full_name}</p>
                    <p className="text-sm text-muted-foreground">{t('userManagement.pendingApproval')}</p>
                  </div>
                  <div className={`flex ${isMobile ? 'flex-col' : 'items-center'} gap-2`}>
                    <Select value={selectedRole} onValueChange={(value) => setSelectedRole(value as AppRole)}>
                      <SelectTrigger className={isMobile ? 'w-full' : 'w-40'}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(['master', 'admin', 'site_manager', 'foreman', 'reader', 'ofi'] as AppRole[]).map((role) => (
                          <SelectItem key={role} value={role}>
                            {getRoleLabel(role, t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className={`flex gap-2 ${isMobile ? 'w-full' : ''}`}>
                      <Button
                        onClick={() => approveUser(user.id, selectedRole)}
                        size="sm"
                        className={isMobile ? 'flex-1' : ''}
                      >
                        {t('common.approve')}
                      </Button>
                      <Button
                        onClick={() => {
                          if (confirm(t('userManagement.deleteUserPendingConfirm'))) {
                            deleteUser(user.id);
                          }
                        }}
                        variant="destructive"
                        size="sm"
                        className={isMobile ? 'flex-1' : ''}
                      >
                        {t('common.reject')}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Approved Users Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {t('navigation.userManagement')}
          </CardTitle>
          <CardDescription>
            {t('userManagement.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isMobile ? (
            // Vista móvil con cards
            <div className="space-y-4">
              {usersWithData.map((user) => (
                <Card key={user.id} className="border shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-bold text-lg">{user.full_name}</p>
                        {user.position && (
                          <p className="text-sm text-muted-foreground">{user.position}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleManageUser(user)}
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(t('userManagement.deleteUserConfirm', { userName: user.full_name }))) {
                              deleteUser(user.id);
                            }
                          }}
                          className="text-destructive hover:text-destructive"
                        >
                          🗑️
                        </Button>
                      </div>
                    </div>
                    
                    {(user.email || user.phone) && (
                      <div className="space-y-2 pt-2 border-t">
                        <p className="text-xs font-medium text-muted-foreground">{t('userManagement.contact')}</p>
                        {user.email && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            <span className="truncate">{user.email}</span>
                          </div>
                        )}
                        {user.phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-3 w-3 text-muted-foreground" />
                            <span>{user.phone}</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className="pt-2 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-2">{t('userManagement.roles')}</p>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length > 0 ? (
                          user.roles.map((role) => (
                            <Badge key={role} className={roleColors[role]}>
                              {getRoleLabel(role, t)}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-sm">{t('userManagement.noRole')}</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="pt-2 border-t">
                      <p className="text-xs font-medium text-muted-foreground">{t('userManagement.works')}</p>
                      <p className="text-sm mt-1">
                        {user.assigned_works.length} {t('userManagement.worksCount')}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            // Vista desktop con tabla
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('userManagement.user')}</TableHead>
                  <TableHead>{t('userManagement.contact')}</TableHead>
                  <TableHead>{t('userManagement.roles')}</TableHead>
                  <TableHead>{t('userManagement.works')}</TableHead>
                  <TableHead className="text-right">{t('userManagement.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersWithData.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{user.full_name}</p>
                        {user.email && (
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        )}
                        {user.position && (
                          <p className="text-xs text-muted-foreground">{user.position}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {user.email && (
                          <div className="flex items-center gap-1 text-xs">
                            <Mail className="h-3 w-3" />
                            <span className="truncate max-w-[150px]">{user.email}</span>
                          </div>
                        )}
                        {user.phone && (
                          <div className="flex items-center gap-1 text-xs">
                            <Phone className="h-3 w-3" />
                            <span>{user.phone}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length > 0 ? (
                          user.roles.map((role) => (
                            <Badge key={role} className={roleColors[role]}>
                              {getRoleLabel(role, t)}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-sm">{t('userManagement.noRole')}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {user.assigned_works.length} {t('userManagement.worksCount')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleManageUser(user)}
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(t('userManagement.deleteUserConfirm', { userName: user.full_name }))) {
                              deleteUser(user.id);
                            }
                          }}
                          className="text-destructive hover:text-destructive"
                        >
                          🗑️
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('userManagement.manageUser')}: {selectedUser?.full_name}</DialogTitle>
            <DialogDescription>
              {t('userManagement.manageUserDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Roles Section */}
            <div>
              <h3 className="font-semibold mb-3">{t('userManagement.currentRoles')}</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {selectedUser?.roles.map((role) => (
                  <Badge key={role} className={roleColors[role]}>
                    {getRoleLabel(role, t)}
                    <button
                      onClick={() => handleRemoveRole(role)}
                      className="ml-2 hover:text-red-600"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
              <Select onValueChange={(value) => handleAddRole(value as AppRole)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('userManagement.addRole')} />
                </SelectTrigger>
                <SelectContent>
                  {(['master', 'admin', 'site_manager', 'foreman', 'reader', 'ofi'] as AppRole[]).map((role) => (
                    <SelectItem key={role} value={role}>
                      {getRoleLabel(role, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Works Assignment Section */}
            <div>
              <h3 className="font-semibold mb-3">{t('userManagement.assignedWorks')}</h3>
              <div className="space-y-2">
                {assignableWorks.map((work) => {
                  const isAssigned = selectedUser?.assigned_works.includes(work.id);
                  return (
                    <div key={work.id} className="flex items-center justify-between p-2 border rounded">
                      <span className="text-sm">{work.name}</span>
                      <Button
                        size="sm"
                        variant={isAssigned ? "destructive" : "default"}
                        onClick={async () => {
                          if (!selectedUser) return;
                          try {
                            if (isAssigned) {
                              await removeManagedUserFromWork(Number(selectedUser.id), Number(work.id));

                              toast({
                                title: t('userManagement.workRemoved'),
                                description: t('userManagement.workRemovedDesc'),
                              });
                            } else {
                              await assignManagedUserToWork(Number(selectedUser.id), Number(work.id));

                              toast({
                                title: t('userManagement.workAssigned'),
                                description: t('userManagement.workAssignedDesc'),
                              });
                            }
                            
                            await loadUsers();
                            // Reload the dialog's user data
                            const roles = await getUserRoles(selectedUser.id);
                            const assigned_works = await getUserAssignments(selectedUser.id);
                            setSelectedUser({ ...selectedUser, roles, assigned_works });
                          } catch (error: any) {
                            toast({
                              title: t('common.error'),
                              description: error.message,
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        {isAssigned ? t('userManagement.remove') : t('userManagement.assign')}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </TabsContent>

      <TabsContent value="organization" className="mt-6">
        <OrganizationSettings />
      </TabsContent>

      <TabsContent value="subscription" className="mt-6">
        <SubscriptionManagement
          isActive={false}
          isTrialActive={true}
          renewalDate="15/11/2025"
          trialEndDate="10/11/2025"
          onManageInPlayStore={handleManageInPlayStore}
          onRestorePurchases={handleRestorePurchases}
        />
      </TabsContent>
    </Tabs>
  );
};
