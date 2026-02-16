import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Sparkles } from 'lucide-react';

interface SubscriptionPaywallProps {
  onStartTrial?: () => void;
  onRestorePurchases?: () => void;
  onTermsClick?: () => void;
}

export const SubscriptionPaywall = ({ 
  onStartTrial, 
  onRestorePurchases,
  onTermsClick 
}: SubscriptionPaywallProps) => {
  const { t } = useTranslation();

  const benefits = [
    t('subscription.benefits.unlimited'),
    t('subscription.benefits.export'),
    t('subscription.benefits.sync'),
    t('subscription.benefits.support'),
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background p-4 flex items-center justify-center">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center space-y-4 pb-4">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl md:text-3xl font-bold">
            {t('subscription.title')}
          </CardTitle>
          <CardDescription className="text-base">
            {t('subscription.subtitle')}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Benefits List */}
          <div className="space-y-3">
            {benefits.map((benefit, index) => (
              <div key={index} className="flex items-start gap-3">
                <div className="mt-0.5 w-5 h-5 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-success" strokeWidth={3} />
                </div>
                <p className="text-sm text-foreground leading-relaxed">{benefit}</p>
              </div>
            ))}
          </div>

          {/* Pricing Card */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="pt-6 text-center space-y-2">
              <div className="space-y-1">
                <p className="text-4xl font-bold text-primary">€4,99</p>
                <p className="text-sm text-muted-foreground">{t('subscription.perMonth')}</p>
              </div>
              <div className="pt-2">
                <p className="text-xs text-muted-foreground font-medium">
                  {t('subscription.trialInfo')}
                </p>
              </div>
            </CardContent>
          </Card>
        </CardContent>

        <CardFooter className="flex flex-col gap-4 pt-2">
          {/* Main CTA Button */}
          <Button 
            size="lg" 
            className="w-full h-14 text-base font-semibold shadow-lg"
            onClick={onStartTrial}
          >
            {t('subscription.startTrial')}
          </Button>

          {/* Secondary Links */}
          <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
            <button 
              className="hover:text-primary transition-colors underline"
              onClick={onRestorePurchases}
            >
              {t('subscription.restore')}
            </button>
            <span>•</span>
            <button 
              className="hover:text-primary transition-colors underline"
              onClick={onTermsClick}
            >
              {t('subscription.terms')}
            </button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};
