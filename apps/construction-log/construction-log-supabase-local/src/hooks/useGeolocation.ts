import { useState, useCallback, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

const DENIED_ANDROID_MESSAGE = 'Permiso de ubicación denegado. Actívalo en Ajustes > Apps > Partes de Trabajo > Permisos.';
const DENIED_WEB_MESSAGE = 'Permiso de ubicación denegado. Actívalo en la configuración del navegador.';
const GPS_UNAVAILABLE_MESSAGE = 'Ubicación no disponible. Asegúrate de tener GPS y ubicación del dispositivo activados.';
const GENERIC_LOCATION_ERROR_MESSAGE = 'No se pudo obtener la ubicación. Inténtalo de nuevo.';

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

const normalizeNativePermission = (locationStatus: string): PermissionState => {
  if (locationStatus === 'granted') return 'granted';
  if (locationStatus === 'denied') return 'denied';
  return 'prompt';
};

const resolveErrorMessage = (error: unknown, isNative: boolean): { message: string; permission: PermissionState } => {
  const raw = String((error as { message?: string })?.message ?? '').toLowerCase();

  if (raw.includes('denied') || raw.includes('permission')) {
    return {
      message: isNative ? DENIED_ANDROID_MESSAGE : DENIED_WEB_MESSAGE,
      permission: 'denied',
    };
  }
  if (raw.includes('timeout')) {
    return { message: 'Tiempo de espera agotado al obtener la ubicación. Inténtalo de nuevo.', permission: 'prompt' };
  }
  if (raw.includes('unavailable') || raw.includes('location services are disabled')) {
    return { message: GPS_UNAVAILABLE_MESSAGE, permission: 'prompt' };
  }
  return { message: GENERIC_LOCATION_ERROR_MESSAGE, permission: 'prompt' };
};

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

  const checkPermission = useCallback(async (): Promise<PermissionState | null> => {
    try {
      if (isNative) {
        const status = await Geolocation.checkPermissions();
        const permissionStatus = normalizeNativePermission(status.location);
        setState((prev) => ({ ...prev, permissionStatus }));
        return permissionStatus;
      }

      if (!navigator.permissions) {
        setState((prev) => ({ ...prev, permissionStatus: 'prompt' }));
        return 'prompt';
      }

      const result = await navigator.permissions.query({ name: 'geolocation' });
      setState((prev) => ({ ...prev, permissionStatus: result.state }));
      return result.state;
    } catch (error) {
      console.error('Error checking geolocation permission:', error);
      return null;
    }
  }, [isNative]);

  useEffect(() => {
    void checkPermission();
  }, [checkPermission]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (isNative) {
        const status = await Geolocation.requestPermissions();
        const permissionStatus = normalizeNativePermission(status.location);
        const granted = permissionStatus === 'granted';
        setState((prev) => ({
          ...prev,
          permissionStatus,
          error: granted ? null : DENIED_ANDROID_MESSAGE,
        }));
        return granted;
      }

      return new Promise((resolve) => {
        if (!navigator.geolocation) {
          setState((prev) => ({
            ...prev,
            error: 'Geolocalización no soportada en este navegador.',
            permissionStatus: 'denied',
          }));
          resolve(false);
          return;
        }

        navigator.geolocation.getCurrentPosition(
          () => {
            setState((prev) => ({ ...prev, permissionStatus: 'granted', error: null }));
            resolve(true);
          },
          (error) => {
            const denied = error.code === error.PERMISSION_DENIED;
            setState((prev) => ({
              ...prev,
              permissionStatus: denied ? 'denied' : 'prompt',
              error: denied ? DENIED_WEB_MESSAGE : GENERIC_LOCATION_ERROR_MESSAGE,
            }));
            resolve(false);
          },
          { timeout: 10000 }
        );
      });
    } catch (error) {
      console.error('Error requesting permission:', error);
      setState((prev) => ({ ...prev, error: isNative ? DENIED_ANDROID_MESSAGE : DENIED_WEB_MESSAGE }));
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
          },
        }
      );
      if (!response.ok) throw new Error('Reverse geocoding failed');
      const data = await response.json();
      const addr = data.address || {};

      const parts: string[] = [];
      const streetParts: string[] = [];
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
        address: 'No se pudo resolver la dirección desde la ubicación',
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
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const permission = await checkPermission();
      if (permission !== 'granted') {
        const granted = await requestPermission();
        if (!granted) {
          const deniedState: GeolocationState = {
            latitude: null,
            longitude: null,
            address: null,
            addressDetails: null,
            loading: false,
            error: isNative ? DENIED_ANDROID_MESSAGE : DENIED_WEB_MESSAGE,
            permissionStatus: 'denied',
          };
          setState((prev) => ({ ...prev, ...deniedState }));
          return deniedState;
        }
      }

      if (isNative) {
        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
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
        setState((prev) => ({ ...prev, ...successState }));
        return successState;
      }

      return new Promise((resolve) => {
        if (!navigator.geolocation) {
          const unsupportedState: GeolocationState = {
            latitude: null,
            longitude: null,
            address: null,
            addressDetails: null,
            loading: false,
            error: 'Geolocalización no soportada en este navegador.',
            permissionStatus: 'denied',
          };
          setState((prev) => ({ ...prev, ...unsupportedState }));
          resolve(unsupportedState);
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
            setState((prev) => ({ ...prev, ...successState }));
            resolve(successState);
          },
          (error) => {
            let errorMessage = GENERIC_LOCATION_ERROR_MESSAGE;
            let permissionStatus: PermissionState = 'prompt';

            if (error.code === error.PERMISSION_DENIED) {
              errorMessage = DENIED_WEB_MESSAGE;
              permissionStatus = 'denied';
            } else if (error.code === error.POSITION_UNAVAILABLE) {
              errorMessage = GPS_UNAVAILABLE_MESSAGE;
            } else if (error.code === error.TIMEOUT) {
              errorMessage = 'Tiempo de espera agotado al obtener la ubicación. Inténtalo de nuevo.';
            }

            const errorState: GeolocationState = {
              latitude: null,
              longitude: null,
              address: null,
              addressDetails: null,
              loading: false,
              error: errorMessage,
              permissionStatus,
            };
            setState((prev) => ({ ...prev, ...errorState }));
            resolve(errorState);
          },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
      });
    } catch (error) {
      const mapped = resolveErrorMessage(error, isNative);
      const errorState: GeolocationState = {
        latitude: null,
        longitude: null,
        address: null,
        addressDetails: null,
        loading: false,
        error: mapped.message,
        permissionStatus: mapped.permission,
      };
      setState((prev) => ({ ...prev, ...errorState }));
      return errorState;
    }
  }, [checkPermission, isNative, requestPermission]);

  return {
    ...state,
    getCurrentPosition,
    requestPermission,
    checkPermission,
  };
};
