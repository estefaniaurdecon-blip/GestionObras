import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import JSZip from 'jszip';
import type { WorkReport as ExportWorkReport } from '@/types/workReport';
import { generateWorkReportPDF } from '@/utils/pdfGenerator';

export type ExportTransferFile = {
  filename: string;
  blob: Blob;
};

export type DownloadExportFilesResult = {
  directory?: Directory;
  uris: string[];
};

type ShareExportFilesParams = {
  files: ExportTransferFile[];
  title: string;
  text: string;
  savedUris?: string[];
  dialogTitle?: string;
};

type BuildPdfExportFilesParams = {
  reports: ExportWorkReport[];
  includeImages: boolean;
  buildFileName: (report: ExportWorkReport) => string;
};

type BuildZipExportFileParams = {
  files: ExportTransferFile[];
  filename: string;
};

const EXPORT_SUBDIRECTORY = 'PartesTrabajo';
const PUBLIC_DOWNLOADS_EXPORT_PATH = `Download/${EXPORT_SUBDIRECTORY}`;
const PREFERRED_NATIVE_EXPORT_DIRECTORIES: Directory[] = [
  Directory.ExternalStorage,
  Directory.Documents,
  Directory.External,
];

export const isNativeExportPlatform = () => Capacitor.isNativePlatform?.() === true;

const blobToBase64 = async (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const sanitizeExportFilename = (filename: string) => {
  const cleaned = filename
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return cleaned.length > 0 ? cleaned : `archivo_${Date.now()}`;
};

export const getExportDirectoryLabel = (directory: Directory) => {
  switch (directory) {
    case Directory.ExternalStorage:
      return `Descargas/${EXPORT_SUBDIRECTORY}`;
    case Directory.Documents:
      return `Documentos/${EXPORT_SUBDIRECTORY}`;
    case Directory.External:
      return `${EXPORT_SUBDIRECTORY} (almacenamiento de la app)`;
    default:
      return 'almacenamiento local';
  }
};

const saveBlobToNativeFile = async (
  blob: Blob,
  filename: string,
): Promise<{ uri: string; directory: Directory }> => {
  const safeFilename = sanitizeExportFilename(filename);
  const base64 = await blobToBase64(blob);
  let lastError: unknown;

  for (const directory of PREFERRED_NATIVE_EXPORT_DIRECTORIES) {
    const path =
      directory === Directory.ExternalStorage
        ? `${PUBLIC_DOWNLOADS_EXPORT_PATH}/${safeFilename}`
        : `${EXPORT_SUBDIRECTORY}/${safeFilename}`;

    try {
      const writeResult = await Filesystem.writeFile({
        path,
        data: base64,
        directory,
        recursive: true,
      });
      let uri = writeResult.uri;
      try {
        const resolved = await Filesystem.getUri({ path, directory });
        if (resolved?.uri) uri = resolved.uri;
      } catch {
        // Keep write URI as fallback.
      }
      return { uri, directory };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error('No se pudo guardar el archivo en el dispositivo.');
};

const triggerBrowserBlobDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const isShareCancellationError = (error: unknown) => {
  const raw =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : (() => {
            try {
              return JSON.stringify(error);
            } catch {
              return '';
            }
          })();
  const normalized = raw.toLowerCase();
  return (
    normalized.includes('cancel') ||
    normalized.includes('dismiss') ||
    normalized.includes('aborted') ||
    normalized.includes('user did not share')
  );
};

export const buildPdfExportFilesFromReports = async (
  params: BuildPdfExportFilesParams,
): Promise<ExportTransferFile[]> => {
  const files: ExportTransferFile[] = [];

  for (const report of params.reports) {
    const pdfBlob = (await generateWorkReportPDF(
      report,
      params.includeImages,
      undefined,
      undefined,
      true,
    )) as Blob;
    files.push({ filename: `${params.buildFileName(report)}.pdf`, blob: pdfBlob });
  }

  return files;
};

export const buildZipExportFile = async (params: BuildZipExportFileParams): Promise<ExportTransferFile> => {
  const zip = new JSZip();

  for (const file of params.files) {
    zip.file(file.filename, file.blob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  return { filename: params.filename, blob: zipBlob };
};

export const downloadExportFiles = async (files: ExportTransferFile[]): Promise<DownloadExportFilesResult> => {
  if (!isNativeExportPlatform()) {
    files.forEach((file) => triggerBrowserBlobDownload(file.blob, file.filename));
    return { directory: undefined, uris: [] };
  }

  let directoryUsed: Directory | undefined;
  const uris: string[] = [];
  for (const file of files) {
    const saved = await saveBlobToNativeFile(file.blob, file.filename);
    if (!directoryUsed) directoryUsed = saved.directory;
    uris.push(saved.uri);
  }

  return { directory: directoryUsed, uris };
};

export const shareExportFiles = async (params: ShareExportFilesParams): Promise<boolean> => {
  if (!isNativeExportPlatform()) {
    params.files.forEach((file) => triggerBrowserBlobDownload(file.blob, file.filename));
    return false;
  }

  const uris = [...(params.savedUris ?? [])];
  if (uris.length === 0) {
    for (const file of params.files) {
      const saved = await saveBlobToNativeFile(file.blob, file.filename);
      uris.push(saved.uri);
    }
  }

  await Share.share({
    title: params.title,
    text: params.text,
    files: uris,
    dialogTitle: params.dialogTitle ?? 'Compartir exportacion',
  });

  return true;
};
