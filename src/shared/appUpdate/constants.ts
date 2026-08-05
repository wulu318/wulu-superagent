export const AppUpdateStatus = {
  Idle: 'idle',
  Checking: 'checking',
  Available: 'available',
  Downloading: 'downloading',
  Ready: 'ready',
  Installing: 'installing',
  Error: 'error',
} as const;

export type AppUpdateStatus = typeof AppUpdateStatus[keyof typeof AppUpdateStatus];

export const AppUpdateSource = {
  Auto: 'auto',
  Manual: 'manual',
} as const;

export type AppUpdateSource = typeof AppUpdateSource[keyof typeof AppUpdateSource];

export const AppUpdateIpc = {
  GetState: 'appUpdate:getState',
  CheckNow: 'appUpdate:checkNow',
  RetryDownload: 'appUpdate:retryDownload',
  CancelDownload: 'appUpdate:cancelDownload',
  InstallReady: 'appUpdate:installReady',
  StateChanged: 'appUpdate:stateChanged',
  GetCompletedUpdate: 'appUpdate:getCompletedUpdate',
} as const;

/**
 * Marker stored in AppUpdateRuntimeState.errorMessage when the user declined
 * the Windows UAC elevation prompt for a silent install. The OS-provided
 * exception text is localized, so this stable token is what crosses the IPC
 * boundary; the renderer maps it to a translated message.
 */
export const APP_UPDATE_ELEVATION_DECLINED_ERROR = 'update-elevation-declined';

export interface ChangeLogEntry {
  title: string;
  content: string[];
}

export interface AppUpdateDownloadProgress {
  received: number;
  total: number | undefined;
  percent: number | undefined;
  speed: number | undefined;
}

export interface AppUpdateInfo {
  latestVersion: string;
  date: string;
  changeLog: { zh: ChangeLogEntry; en: ChangeLogEntry };
  url: string;
  /** Incremental patch info when the client's current version matches the declared base version. */
  incremental?: {
    baseVersion: string;
    url: string;
    size?: number;
    sha256?: string;
  };
}

export interface AppUpdateRuntimeState {
  status: AppUpdateStatus;
  source: AppUpdateSource | null;
  info: AppUpdateInfo | null;
  progress: AppUpdateDownloadProgress | null;
  readyFilePath: string | null;
  readyFileHash: string | null;
  errorMessage: string | null;
  /** True when a previous install attempt quit the app but never completed. */
  installIncomplete?: boolean;
}

export interface AppUpdateCheckResult {
  success: boolean;
  state: AppUpdateRuntimeState;
  updateFound: boolean;
  error?: string;
}

export const APP_UPDATE_POLL_INTERVAL_MS = 2 * 60 * 60 * 1000;
export const APP_UPDATE_HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000;

/**
 * True when the update URL points at a download landing page that the user
 * must visit in a browser, rather than a direct installer file the app can
 * download and run itself.
 */
export function isManualDownloadUrl(url: string): boolean {
  return url.includes('#') || url.endsWith('/download-list');
}
