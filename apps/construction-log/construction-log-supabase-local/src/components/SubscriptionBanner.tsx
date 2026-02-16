import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { Crown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SubscriptionBannerProps {
  daysRemaining?: number;
  isTrialActive?: boolean;
  onUpgradeClick?: () => void;
  onDismiss?: () => void;
}

export const SubscriptionBanner = ({ 
  daysRemaining = 0, 
  isTrialActive = true,
  onUpgradeClick,
  onDismiss
}: SubscriptionBannerProps) => {
  const { t } = useTranslation();

  return (
    <Card className="bg-gradient-to-r from-primary/10 to-secondary/10 border-primary/20 shadow-sm">
      <div className="p-4 flex items-center gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
          <Crown className="w-5 h-5 text-primary" />
        </div>
        
        <div className="flex-1 min-w-0">
          {isTrialActive ? (
            <>
              <p className="text-sm font-semibold text-foreground">
                {t('subscription.banner.trialActive', { days: daysRemaining })}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('subscription.banner.tapToActivate')}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">
                {t('subscription.banner.trialEnded')}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('subscription.banner.subscribeNow')}
              </p>
            </>
          )}
        </div>

        <Button
          size="sm"
          className="flex-shrink-0"
          onClick={onUpgradeClick}
        >
          {t('subscription.banner.upgrade')}
        </Button>

        {onDismiss && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 p-1 hover:bg-primary/10 rounded-full transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
      </div>
    </Card>
  );
};
