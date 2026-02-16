import { useState, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export interface AddressDetails {
  street_address: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  display_name: string | null;
}

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  addressDetails: AddressDetails | null;
  loading: boolean;
  error: string | null;
  permissionStatus: PermissionState | null;
}

export const useGeolocation = () => {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    address: null,
    addressDetails: null,
    loading: false,
    error: null,
    permissionStatus: null,
  });

  const isNative = Capacitor.isNativePlatform();

  // Check permission status on mount
  useEffect(() => {
    checkPermission();
  }, []);

  const checkPermission = async () => {
    try {
      if (isNative) {
        const status = await Geolocation.checkPermissions();
        const permState: PermissionState = 
          status.location === 'granted' ? 'granted' :
          status.location === 'denied' ? 'denied' : 'prompt';
        setState(prev => ({ ...prev, permissionStatus: permState }));
      } else {
        if (!navigator.permissions) return;
        const result = await navigator.permissions.query({ name: 'geolocation' });
        setState(prev => ({ ...prev, permissionStatus: result.state }));
        result.addEventListener('change', () => {
          setState(prev => ({ ...prev, permissionStatus: result.state }));
        });
      }
    } catch (error) {
      console.error('Error checking geolocation permission:', error);
    }
  };

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (isNative) {
        const status = await Geolocation.requestPermissions();
        const granted = status.location === 'granted';
        setState(prev => ({ 
          ...prev, 
          permissionStatus: granted ? 'granted' : 'denied',
          error: granted ? null : 'Permiso de ubicación denegado. Por favor, actívalo en Ajustes > Aplicaciones.'
        }));
        return granted;
      } else {
        return new Promise((resolve) => {
          if (!navigator.geolocation) {
            setState(prev => ({ 
              ...prev, 
              error: 'Geolocalización no soportada en este navegador',
              permissionStatus: 'denied'
            }));
            resolve(false);
            return;
          }
          navigator.geolocation.getCurrentPosition(
            () => {
              setState(prev => ({ ...prev, permissionStatus: 'granted', error: null }));
              resolve(true);
            },
            (error) => {
              if (error.code === error.PERMISSION_DENIED) {
                setState(prev => ({ 
                  ...prev, 
                  permissionStatus: 'denied',
                  error: 'Permiso de ubicación denegado. Por favor, actívalo en la configuración del navegador.'
                }));
              }
              resolve(false);
            },
            { timeout: 10000 }
          );
        });
      }
    } catch (error) {
      console.error('Error requesting permission:', error);
      return false;
    }
  }, [isNative]);

  const reverseGeocode = async (lat: number, lng: number): Promise<{ address: string; details: AddressDetails }> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        { 
          headers: { 
            'Accept-Language': 'es',
            'User-Agent': 'PartesDeTrabajoApp/1.0',
          } 
        }
      );
      if (!response.ok) throw new Error('Error en geocodificación inversa');
      const data = await response.json();
      const addr = data.address || {};
      
      // Construir la dirección legible
      const parts = [];
      const streetParts = [];
      if (addr.road) streetParts.push(addr.road);
      if (addr.house_number) streetParts.push(addr.house_number);
      const streetAddress = streetParts.join(' ') || null;
      
      if (streetAddress) parts.push(streetAddress);
      
      const city = addr.city || addr.town || addr.village || addr.municipality || null;
      if (city) parts.push(city);
      
      const province = addr.state || addr.province || addr.county || null;
      if (province) parts.push(province);
      
      const country = addr.country || null;
      
      const details: AddressDetails = {
        street_address: streetAddress,
        city,
        province,
        country,
        display_name: data.display_name || null,
      };
      
      return {
        address: parts.length > 0 ? parts.join(', ') : data.display_name || 'Ubicación desconocida',
        details,
      };
    } catch (error) {
      console.error('Error reverse geocoding:', error);
      return {
        address: 'No se pudo obtener la dirección',
        details: {
          street_address: null,
          city: null,
          province: null,
          country: null,
          display_name: null,
        },
      };
    }
  };

  const getCurrentPosition = useCallback(async (): Promise<GeolocationState> => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      if (isNative) {
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
        });
        const { latitude, longitude } = position.coords;
        const { address, details } = await reverseGeocode(latitude, longitude);
        const successState: GeolocationState = {
          latitude,
          longitude,
          address,
          addressDetails: details,
          loading: false,
          error: null,
          permissionStatus: 'granted',
        };
        setState(successState);
        return successState;
      } else {
        return new Promise((resolve) => {
          if (!navigator.geolocation) {
            const errorState: GeolocationState = {
              latitude: null,
              longitude: null,
              address: null,
              addressDetails: null,
              loading: false,
              error: 'Geolocalización no soportada en este navegador',
              permissionStatus: 'denied',
            };
            setState(errorState);
            resolve(errorState);
            return;
          }

          navigator.geolocation.getCurrentPosition(
            async (position) => {
              const { latitude, longitude } = position.coords;
              const { address, details } = await reverseGeocode(latitude, longitude);
              const successState: GeolocationState = {
                latitude,
                longitude,
                address,
                addressDetails: details,
                loading: false,
                error: null,
                permissionStatus: 'granted',
              };
              setState(successState);
              resolve(successState);
            },
            (error) => {
              let errorMessage = 'Error al obtener ubicación';
              let permStatus: PermissionState = 'prompt';
              switch (error.code) {
                case error.PERMISSION_DENIED:
                  errorMessage = 'Permiso de ubicación denegado. Por favor, actívalo en la configuración del navegador.';
                  permStatus = 'denied';
                  break;
                case error.POSITION_UNAVAILABLE:
                  errorMessage = 'Ubicación no disponible. Asegúrate de tener el GPS activado.';
                  break;
                case error.TIMEOUT:
                  errorMessage = 'Tiempo de espera agotado. Intenta de nuevo.';
                  break;
              }
              const errorState: GeolocationState = {
                latitude: null,
                longitude: null,
                address: null,
                addressDetails: null,
                loading: false,
                error: errorMessage,
                permissionStatus: permStatus,
              };
              setState(errorState);
              resolve(errorState);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
          );
        });
      }
    } catch (error: any) {
      const errorMessage = error?.message?.includes('denied') 
        ? 'Permiso de ubicación denegado. Por favor, actívalo en Ajustes > Aplicaciones.'
        : 'Error al obtener ubicación. Asegúrate de tener el GPS activado.';
      const errorState: GeolocationState = {
        latitude: null,
        longitude: null,
        address: null,
        addressDetails: null,
        loading: false,
        error: errorMessage,
        permissionStatus: 'denied',
      };
      setState(errorState);
      return errorState;
    }
  }, [isNative]);

  return {
    ...state,
    getCurrentPosition,
    requestPermission,
    checkPermission,
  };
};
