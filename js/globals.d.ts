// Types for globals that only exist in the browser or are injected by Vite, used by `npm run typecheck`.
interface ImportMetaEnv {
  readonly PROD: boolean;
  readonly DEV: boolean;
  readonly VITE_TIP_URL?: string;
  readonly VITE_ERROR_ENDPOINT?: string;
  readonly [key: string]: any;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
interface Window {
  supabase?: { createClient: (...args: any[]) => any };
}
declare const __APP_VERSION__: string | undefined;
declare const __APP_SEMVER__: string | undefined;
