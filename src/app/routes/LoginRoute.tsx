import { useEffect } from 'react';
import { LoginScreen } from '@/features/auth';

export default function LoginRoute() {
  useEffect(() => {
    document.title = 'Sign in · Lam13';
  }, []);
  return <LoginScreen />;
}
