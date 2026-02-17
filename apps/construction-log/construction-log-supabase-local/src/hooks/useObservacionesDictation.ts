import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

interface SpeechRecognitionEventLocal extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEventLocal extends Event {
  error: string;
}

interface SpeechRecognitionInterfaceLocal extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLocal) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLocal) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInterfaceLocal;
    webkitSpeechRecognition: new () => SpeechRecognitionInterfaceLocal;
  }
}

type UseObservacionesDictationOptions = {
  onFinal: (text: string) => void;
  language?: string;
};

type UseObservacionesDictationResult = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isListening: boolean;
  interimText: string;
  error: string | null;
};

const DEFAULT_LANGUAGE = 'es-ES';

const isNativePlatform = (): boolean => Capacitor.isNativePlatform?.() === true;

const getWebSpeechClass = (): (new () => SpeechRecognitionInterfaceLocal) | null => {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

export function useObservacionesDictation({
  onFinal,
  language = DEFAULT_LANGUAGE,
}: UseObservacionesDictationOptions): UseObservacionesDictationResult {
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const webRecognitionRef = useRef<SpeechRecognitionInterfaceLocal | null>(null);
  const nativeListenerHandlesRef = useRef<PluginListenerHandle[]>([]);
  const latestNativeTranscriptRef = useRef('');
  const nativeFinalEmittedRef = useRef(false);

  const clearNativeListeners = useCallback(async () => {
    const handles = nativeListenerHandlesRef.current;
    nativeListenerHandlesRef.current = [];
    await Promise.all(handles.map((handle) => handle.remove().catch(() => undefined)));
  }, []);

  const emitFinalIfAvailable = useCallback(() => {
    if (nativeFinalEmittedRef.current) return;

    const finalText = latestNativeTranscriptRef.current.trim();
    if (!finalText) return;

    nativeFinalEmittedRef.current = true;
    setInterimText('');
    onFinal(finalText);
  }, [onFinal]);

  const ensureNativePermission = useCallback(async (): Promise<boolean> => {
    try {
      const status = await SpeechRecognition.checkPermissions();
      if (status.speechRecognition === 'granted') return true;

      const requested = await SpeechRecognition.requestPermissions();
      if (requested.speechRecognition === 'granted') return true;

      setError('Permiso de micrófono denegado');
      return false;
    } catch {
      setError('No se pudo verificar el permiso de micrófono');
      return false;
    }
  }, []);

  const stopNative = useCallback(async () => {
    try {
      await SpeechRecognition.stop();
    } catch {
      // ignore
    }

    emitFinalIfAvailable();
    await clearNativeListeners();
    setIsListening(false);
  }, [clearNativeListeners, emitFinalIfAvailable]);

  const stopWeb = useCallback(async () => {
    const recognition = webRecognitionRef.current;
    webRecognitionRef.current = null;

    try {
      recognition?.stop();
    } catch {
      // ignore
    }

    setIsListening(false);
  }, []);

  const startNative = useCallback(async () => {
    setError(null);
    setInterimText('');
    latestNativeTranscriptRef.current = '';
    nativeFinalEmittedRef.current = false;

    const available = await SpeechRecognition.available();
    if (!available.available) {
      setError('Reconocimiento de voz no disponible en este dispositivo');
      return;
    }

    const hasPermission = await ensureNativePermission();
    if (!hasPermission) return;

    await clearNativeListeners();

    const partialHandle = await SpeechRecognition.addListener('partialResults', ({ matches }) => {
      const transcript = (matches?.[0] || '').trim();
      if (!transcript) return;
      latestNativeTranscriptRef.current = transcript;
      setInterimText(transcript);
    });

    const stateHandle = await SpeechRecognition.addListener('listeningState', ({ status }) => {
      if (status === 'started') {
        setIsListening(true);
        return;
      }

      setIsListening(false);
      emitFinalIfAvailable();
      void clearNativeListeners();
    });

    nativeListenerHandlesRef.current = [partialHandle, stateHandle];

    try {
      const result = await SpeechRecognition.start({
        language,
        maxResults: 1,
        partialResults: true,
        popup: false,
      });

      const immediateMatch = result.matches?.[0]?.trim();
      if (immediateMatch) {
        latestNativeTranscriptRef.current = immediateMatch;
      }

      setIsListening(true);
    } catch {
      await clearNativeListeners();
      setIsListening(false);
      setError('No se pudo iniciar el dictado');
    }
  }, [clearNativeListeners, emitFinalIfAvailable, ensureNativePermission, language]);

  const startWeb = useCallback(async () => {
    setError(null);
    setInterimText('');

    const SpeechRecognitionClass = getWebSpeechClass();
    if (!SpeechRecognitionClass) {
      setError('Dictado no disponible en este navegador');
      return;
    }

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Permiso de micrófono denegado');
      return;
    }

    const recognition = new SpeechRecognitionClass();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEventLocal) => {
      let finalText = '';
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }

      setInterimText(interim.trim());

      const cleanedFinal = finalText.trim();
      if (cleanedFinal) {
        onFinal(cleanedFinal);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLocal) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      setError('Error de reconocimiento de voz');
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    webRecognitionRef.current = recognition;

    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setError('No se pudo iniciar el dictado');
      setIsListening(false);
    }
  }, [language, onFinal]);

  const start = useCallback(async () => {
    if (isListening) return;
    if (isNativePlatform()) {
      await startNative();
      return;
    }
    await startWeb();
  }, [isListening, startNative, startWeb]);

  const stop = useCallback(async () => {
    if (isNativePlatform()) {
      await stopNative();
      return;
    }
    await stopWeb();
  }, [stopNative, stopWeb]);

  useEffect(() => {
    return () => {
      void clearNativeListeners();

      try {
        webRecognitionRef.current?.stop();
      } catch {
        // ignore
      }

      webRecognitionRef.current = null;
    };
  }, [clearNativeListeners]);

  return {
    start,
    stop,
    isListening,
    interimText,
    error,
  };
}
