/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SITE_ID: string;
  readonly VITE_PUBLIC_ORIGIN: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_CLERK_ISSUER: string;
}
