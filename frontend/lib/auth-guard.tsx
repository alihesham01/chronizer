'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      router.replace('/login');
      return;
    }
    setAuthorized(true);
  }, [router]);

  if (!authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-gray-500">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
}

export function useAuth() {
  const getToken = () => typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const getBrand = () => {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem('brand_info');
    return raw ? JSON.parse(raw) : null;
  };
  const getOwner = () => {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem('owner_info');
    return raw ? JSON.parse(raw) : null;
  };
  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('brand_info');
    localStorage.removeItem('owner_info');
    window.location.href = '/login';
  };
  const isAuthenticated = () => !!getToken();

  return { getToken, getBrand, getOwner, logout, isAuthenticated };
}
