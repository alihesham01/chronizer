'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  LayoutDashboard, 
  Package, 
  Store, 
  CreditCard, 
  Archive, 
  Truck, 
  BarChart3, 
  Settings, 
  LogOut,
  Menu, 
  X,
  Moon,
  Sun,
  Zap,
  Activity,
  GitCompareArrows
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Products', href: '/products', icon: Package },
  { name: 'Stores', href: '/stores', icon: Store },
  { name: 'Transactions', href: '/transactions', icon: CreditCard },
  { name: 'Inventory', href: '/inventory', icon: Archive, badge: 'New' },
  { name: 'Stock Moves', href: '/stock-moves', icon: Truck, badge: 'New' },
  { name: 'SKU Map', href: '/sku-map', icon: GitCompareArrows, badge: 'New' },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [brand, setBrand] = useState<any>(null);
  const [owner, setOwner] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check authentication on mount
    const token = localStorage.getItem('auth_token');
    const brandInfo = localStorage.getItem('brand_info');
    const ownerInfo = localStorage.getItem('owner_info');

    if (!token) {
      router.push('/login');
      return;
    }

    if (brandInfo && ownerInfo) {
      setBrand(JSON.parse(brandInfo));
      setOwner(JSON.parse(ownerInfo));
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('brand_info');
    localStorage.removeItem('owner_info');
    router.push('/login');
  };

  // Don't show layout for auth pages
  const noLayoutRoutes = ['/login', '/register', '/reset-password'];
  if (noLayoutRoutes.includes(pathname)) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar */}
      <div className={cn(
        'fixed inset-0 z-50 lg:hidden',
        sidebarOpen ? 'block' : 'hidden'
      )}>
        <div className="fixed inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
        <div className="fixed left-0 top-0 h-full w-64 bg-card border-r">
          <div className="flex h-16 items-center justify-between px-6">
            <div className="flex items-center gap-2">
              <Zap className="h-8 w-8 text-primary" />
              <div>
                <span className="text-xl font-bold">Chronizer</span>
                <p className="text-xs text-muted-foreground">{brand?.subdomain}.chronizer.com</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <Separator />
          <nav className="px-4 py-4">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors mb-1',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="h-5 w-5" />
                    {item.name}
                  </div>
                  {item.badge && (
                    <Badge variant="secondary" className="text-xs">
                      {item.badge}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </nav>
          <Separator />
          <div className="p-4">
            <div className="mb-3">
              <p className="text-sm font-medium">{owner?.firstName} {owner?.lastName}</p>
              <p className="text-xs text-muted-foreground">{owner?.email}</p>
            </div>
            <Button variant="outline" className="w-full" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:block lg:w-64 lg:overflow-y-auto lg:bg-card lg:border-r">
        <div className="flex h-16 shrink-0 items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Zap className="h-8 w-8 text-primary" />
            <div>
              <span className="text-xl font-bold">{brand?.name || 'Chronizer'}</span>
              <p className="text-xs text-muted-foreground">{brand?.subdomain}.chronizer.com</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Sun className="h-4 w-4" />
            <Switch
              checked={darkMode}
              onCheckedChange={setDarkMode}
            />
            <Moon className="h-4 w-4" />
          </div>
        </div>
        <Separator />
        <nav className="px-4 py-4">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors mb-1',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </div>
                {item.badge && (
                  <Badge variant="secondary" className="text-xs">
                    {item.badge}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>
        <Separator />
        <div className="p-4">
          <div className="mb-3">
            <p className="text-sm font-medium">{owner?.firstName} {owner?.lastName}</p>
            <p className="text-xs text-muted-foreground">{owner?.email}</p>
          </div>
          <Button variant="outline" className="w-full" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b bg-card px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <div className="flex flex-1 items-center">
              <h1 className="text-lg font-semibold">
                {navigation.find(n => n.href === pathname)?.name || 'Dashboard'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-x-4 lg:gap-x-6">
            <Button variant="ghost" size="icon" onClick={() => router.push('/settings')}>
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Page content */}
        <main className="py-6">
          <div className="px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
