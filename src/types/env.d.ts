/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_AUTH_MODE?: string;
  readonly VITE_KINDE_CLIENT_ID?: string;
  readonly VITE_KINDE_DOMAIN?: string;
  readonly VITE_KINDE_REDIRECT_URI?: string;
  readonly VITE_KINDE_LOGOUT_URI?: string;
  readonly VITE_KINDE_AUDIENCE?: string;
  readonly VITE_VAPI_PUBLIC_KEY?: string;
  readonly VITE_VAPI_ASSISTANT_ID?: string;
  readonly VITE_FEATURE_CALLING?: string;
  readonly VITE_FEATURE_VOICE_NOTES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
