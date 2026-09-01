/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AGENT_IO_FEED?: string;
  readonly VITE_AGENT_IO_SSE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
