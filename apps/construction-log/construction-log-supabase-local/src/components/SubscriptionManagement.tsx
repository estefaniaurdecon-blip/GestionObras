import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Crown, ExternalLink, RefreshCw } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface SubscriptionManagementProps {
  isActive?: boolean;
  isTrialActive?: boolean;
  renewalDate?: string;
  trialEndDate?: string;
  onManageInPlayStore?: () => void;
  onRestorePurchases?: () => void;
}

export const SubscriptionManagement = ({
  isActive = false,
  isTrialActive = false,
  renewalDate = '15/11/2025',
  trialEndDate = '10/11/2025',
  onManageInPlayStore,
  onRestorePurchases
}: SubscriptionManagementProps) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 p-4 max-w-2xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">
          {t('subscription.management.title')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('subscription.management.subtitle')}
        </p>
      </div>

      {/* Status Card */}
      <Card className="shadow-md">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <Crown className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-xl">
                {t('subscription.management.planTitle')}
              </CardTitle>
              <CardDescription>
                {isActive 
                  ? t('subscription.management.activePlan') 
                  : t('subscription.management.noActivePlan')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Active Subscription Info */}
          {isActive && (
            <div className="bg-success/5 border border-success/20 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  {t('subscription.management.status')}
                </p>
                <span className="px-2 py-1 bg-success/10 text-success text-xs font-semibold rounded-full">
                  {t('subscription.management.active')}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('subscription.management.renewalInfo', { date: renewalDate })}
              </p>
            </div>
          )}

          {/* Trial Info */}
          {isTrialActive && !isActive && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  {t('subscription.management.status')}
                </p>
                <span className="px-2 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full">
                  {t('subscription.management.trial')}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('subscription.management.trialInfo', { date: trialEndDate })}
              </p>
            </div>
          )}

          <Separator />

          {/* Manage Button */}
          <div className="space-y-3">
            <Button 
              className="w-full h-12 text-base font-semibold"
              onClick={onManageInPlayStore}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              {t('subscription.management.manageButton')}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              {t('subscription.management.manageInfo')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Help Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {t('subscription.management.help.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('subscription.management.help.description')}
          </p>
          <Button 
            variant="outline" 
            className="w-full"
            onClick={onRestorePurchases}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            {t('subscription.management.help.restoreButton')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
