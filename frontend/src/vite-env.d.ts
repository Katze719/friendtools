/// <reference types="vite/client" />

declare module "*?raw" {
  const content: string;
  export default content;
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_LANDING_MODE?: "login" | "landing";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
