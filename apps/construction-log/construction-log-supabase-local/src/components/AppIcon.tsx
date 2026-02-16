import React from 'react';
import iconBase from '@/assets/icon-option-4.png';

interface AppIconProps {
  size?: number;
  companyLogo?: string;
  organizationLogo?: string; // Logo de la organización (prioridad alta)
  className?: string;
}

export const AppIcon: React.FC<AppIconProps> = ({ 
  size = 64, 
  companyLogo,
  organizationLogo,
  className = "" 
}) => {
  return (
    <div 
      className={`relative inline-block ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Si hay logo de organización, mostrarlo en lugar del icono base */}
      {organizationLogo ? (
        <img 
          src={organizationLogo} 
          alt="Organization Logo" 
          className="w-full h-full object-contain rounded-lg"
        />
      ) : (
        <>
          {/* Base icon */}
          <img 
            src={iconBase} 
            alt="Construction Log" 
            className="w-full h-full object-contain"
          />
          
          {/* Company logo overlay positioned on helmet area */}
          {companyLogo && (
            <div 
              className="absolute top-[20%] left-[35%] w-[30%] h-[30%] rounded-full overflow-hidden bg-white/90 border border-primary/20 shadow-sm"
              style={{
                backdropFilter: 'blur(2px)',
              }}
            >
              <img 
                src={companyLogo}
                alt="Company Logo"
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AppIcon;