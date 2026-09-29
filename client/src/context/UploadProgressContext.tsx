import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { type UploadProgressInfo } from '../api/uploadWithProgress';

export interface UploadFileItem {
  id: string;
  name: string;
  size: number;
  loaded: number;
  percent: number;
  status: 'pending' | 'uploading' | 'processing' | 'done' | 'error';
  error?: string;
}

export interface UploadBatchResult<T> {
  results: T[];
  cancelled: boolean;
  errors: { file: File; error: unknown }[];
}

export type OperationKind = 'upload' | 'download';

export interface UploadProgressContextValue {
  isUploading: boolean;
  operationKind: OperationKind;
  open: boolean;
  minimized: boolean;
  title: string;
  files: UploadFileItem[];
  currentIndex: number;
  currentFile: UploadFileItem | null;
  currentPercent: number;
  currentLoaded: number;
  currentTotal: number;
  currentSpeed: number; // bytes/sec
  remainingSeconds: number | null;
  isServerProcessing: boolean;
  overallPercent: number;
  overallLoaded: number;
  overallTotal: number;
  cancelUpload: () => void;
  minimize: () => void;
  maximize: () => void;
  closeModal: () => void;
  startUploadBatch: <T = unknown>(
    title: string,
    files: File[],
    uploadFn: (
      file: File,
      signal: AbortSignal,
      onProgress: (p: UploadProgressInfo) => void,
      index: number,
    ) => Promise<T>,
  ) => Promise<UploadBatchResult<T>>;
  startDownload: (
    title: string,
    filename: string,
    downloadFn: (
      signal: AbortSignal,
      onProgress: (p: UploadProgressInfo) => void,
    ) => Promise<string | void>,
  ) => Promise<{ filename: string; cancelled: boolean }>;
}

const UploadProgressContext = createContext<UploadProgressContextValue | null>(null);

export function UploadProgressProvider({ children }: { children: ReactNode }) {
  const [operationKind, setOperationKind] = useState<OperationKind>('upload');
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<UploadFileItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [currentPercent, setCurrentPercent] = useState(0);
  const [currentLoaded, setCurrentLoaded] = useState(0);
  const [currentTotal, setCurrentTotal] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isServerProcessing, setIsServerProcessing] = useState(false);

  const [overallPercent, setOverallPercent] = useState(0);
  const [overallLoaded, setOverallLoaded] = useState(0);
  const [overallTotal, setOverallTotal] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isCancelledRef = useRef(false);

  const cancelUpload = useCallback(() => {
    isCancelledRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsUploading(false);
  }, []);

  const minimize = useCallback(() => setMinimized(true), []);
  const maximize = useCallback(() => setMinimized(false), []);
  const closeModal = useCallback(() => {
    if (!isUploading) {
      setOpen(false);
      setMinimized(false);
    }
  }, [isUploading]);

  const startUploadBatch = useCallback(
    async <T = unknown,>(
      batchTitle: string,
      uploadFileList: File[],
      uploadFn: (
        file: File,
        signal: AbortSignal,
        onProgress: (p: UploadProgressInfo) => void,
        index: number,
      ) => Promise<T>,
    ): Promise<UploadBatchResult<T>> => {
      setOperationKind('upload');
      if (!uploadFileList.length) {
        return { results: [], cancelled: false, errors: [] };
      }

      // Initialize items
      const initialItems: UploadFileItem[] = uploadFileList.map((f, idx) => ({
        id: `${f.name}-${f.size}-${idx}`,
        name: f.name,
        size: f.size,
        loaded: 0,
        percent: 0,
        status: 'pending',
      }));

      const totalBatchBytes = uploadFileList.reduce((acc, f) => acc + Math.max(1, f.size), 0);

      setTitle(batchTitle);
      setFiles(initialItems);
      setCurrentIndex(0);
      setCurrentPercent(0);
      setCurrentLoaded(0);
      setCurrentTotal(uploadFileList[0]?.size || 0);
      setCurrentSpeed(0);
      setRemainingSeconds(null);
      setIsServerProcessing(false);
      setOverallPercent(0);
      setOverallLoaded(0);
      setOverallTotal(totalBatchBytes);

      setOpen(true);
      setMinimized(false);
      setIsUploading(true);

      isCancelledRef.current = false;
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const results: T[] = [];
      const errors: { file: File; error: unknown }[] = [];
      let completedPriorBytes = 0;

      for (let i = 0; i < uploadFileList.length; i++) {
        if (isCancelledRef.current) break;

        const file = uploadFileList[i];
        setCurrentIndex(i);
        setCurrentTotal(file.size);
        setCurrentLoaded(0);
        setCurrentPercent(0);
        setIsServerProcessing(false);

        setFiles((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: 'uploading' } : item,
          ),
        );

        const onProgress = (p: UploadProgressInfo) => {
          if (isCancelledRef.current) return;
          setCurrentLoaded(p.loaded);
          setCurrentTotal(p.total);
          setCurrentPercent(p.percent);
          setCurrentSpeed(p.speed);
          setRemainingSeconds(p.remainingSeconds);
          setIsServerProcessing(p.isServerProcessing);

          const currentTotalLoaded = completedPriorBytes + p.loaded;
          setOverallLoaded(currentTotalLoaded);
          const overallPct = Math.min(
            100,
            Math.round((currentTotalLoaded / Math.max(1, totalBatchBytes)) * 100),
          );
          setOverallPercent(overallPct);

          setFiles((prev) =>
            prev.map((item, idx) =>
              idx === i
                ? {
                    ...item,
                    loaded: p.loaded,
                    percent: p.percent,
                    status: p.isServerProcessing ? 'processing' : 'uploading',
                  }
                : item,
            ),
          );
        };

        try {
          const res = await uploadFn(file, abortController.signal, onProgress, i);
          results.push(res);
          completedPriorBytes += Math.max(1, file.size);

          setFiles((prev) =>
            prev.map((item, idx) =>
              idx === i
                ? { ...item, loaded: file.size, percent: 100, status: 'done' }
                : item,
            ),
          );
        } catch (err) {
          if (
            isCancelledRef.current ||
            (err instanceof DOMException && err.name === 'AbortError')
          ) {
            isCancelledRef.current = true;
            break;
          }

          errors.push({ file, error: err });
          const rawErr = err instanceof Error ? err.message : String(err);

          setFiles((prev) =>
            prev.map((item, idx) =>
              idx === i
                ? { ...item, status: 'error', error: rawErr }
                : item,
            ),
          );
        }
      }

      setIsUploading(false);
      abortControllerRef.current = null;

      const wasCancelled = isCancelledRef.current;

      // If finished cleanly with no errors, schedule close dialog after 1.2s
      if (!wasCancelled && errors.length === 0) {
        setTimeout(() => {
          setOpen(false);
          setMinimized(false);
        }, 1200);
      }

      return {
        results,
        cancelled: wasCancelled,
        errors,
      };
    },
    [],
  );

  const currentFile = files[currentIndex] || null;

  const startDownload = useCallback(
    async (
      downloadTitle: string,
      initialFilename: string,
      downloadFn: (
        signal: AbortSignal,
        onProgress: (p: UploadProgressInfo) => void,
      ) => Promise<string | void>,
    ): Promise<{ filename: string; cancelled: boolean }> => {
      setOperationKind('download');
      setTitle(downloadTitle);
      setOpen(true);
      setMinimized(false);
      setIsUploading(true);
      setIsServerProcessing(true);
      setCurrentSpeed(0);
      setRemainingSeconds(null);
      setCurrentPercent(0);
      setCurrentLoaded(0);
      setCurrentTotal(0);
      setOverallPercent(0);
      setOverallLoaded(0);
      setOverallTotal(0);

      const item: UploadFileItem = {
        id: 'dl-1',
        name: initialFilename,
        size: 0,
        loaded: 0,
        percent: 0,
        status: 'uploading',
      };
      setFiles([item]);
      setCurrentIndex(0);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      isCancelledRef.current = false;

      let finalName = initialFilename;

      try {
        const res = await downloadFn(controller.signal, (info: UploadProgressInfo) => {
          if (isCancelledRef.current) return;
          setIsServerProcessing(Boolean(info.isServerProcessing));
          setCurrentLoaded(info.loaded);
          setCurrentTotal(info.total);
          setCurrentPercent(info.percent);
          setCurrentSpeed(info.speed);
          setRemainingSeconds(info.remainingSeconds);

          setFiles((prev) =>
            prev.map((f) =>
              f.id === 'dl-1'
                ? {
                    ...f,
                    name: info.filename || f.name,
                    loaded: info.loaded,
                    size: info.total,
                    percent: info.percent,
                    status: info.percent === 100 ? 'done' : 'uploading',
                  }
                : f,
            ),
          );
        });

        if (typeof res === 'string' && res) {
          finalName = res;
        }

        if (isCancelledRef.current) {
          return { filename: finalName, cancelled: true };
        }

        setCurrentPercent(100);
        setFiles((prev) =>
          prev.map((f) =>
            f.id === 'dl-1' ? { ...f, name: finalName, status: 'done', percent: 100 } : f,
          ),
        );

        setTimeout(() => {
          setOpen((prevOpen) => {
            if (prevOpen) {
              setMinimized(false);
              return false;
            }
            return prevOpen;
          });
        }, 1200);

        return { filename: finalName, cancelled: false };
      } catch (err) {
        if (controller.signal.aborted || isCancelledRef.current) {
          return { filename: finalName, cancelled: true };
        }
        setFiles((prev) =>
          prev.map((f) =>
            f.id === 'dl-1'
              ? {
                  ...f,
                  status: 'error',
                  error: err instanceof Error ? err.message : String(err),
                }
              : f,
          ),
        );
        throw err;
      } finally {
        setIsUploading(false);
      }
    },
    [],
  );

  return (
    <UploadProgressContext.Provider
      value={{
        isUploading,
        operationKind,
        open,
        minimized,
        title,
        files,
        currentIndex,
        currentFile,
        currentPercent,
        currentLoaded,
        currentTotal,
        currentSpeed,
        remainingSeconds,
        isServerProcessing,
        overallPercent,
        overallLoaded,
        overallTotal,
        cancelUpload,
        minimize,
        maximize,
        closeModal,
        startUploadBatch,
        startDownload,
      }}
    >
      {children}
    </UploadProgressContext.Provider>
  );
}

export function useUploadProgress(): UploadProgressContextValue {
  const ctx = useContext(UploadProgressContext);
  if (!ctx) {
    throw new Error('useUploadProgress must be used within an UploadProgressProvider');
  }
  return ctx;
}
