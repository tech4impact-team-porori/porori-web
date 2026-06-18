/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_ENABLE_DEMO_LOGIN?: string;
  readonly VITE_DEMO_HELPER_EMAIL?: string;
  readonly VITE_DEMO_HELPER_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
