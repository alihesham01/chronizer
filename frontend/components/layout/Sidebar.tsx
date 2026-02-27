'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  GitCompareArrows
} from 'lucide-react';

interface SidebarProps {
  brand?: any;
  owner?: any;
}

export default function Sidebar({ brand, owner }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('brand_info');
    localStorage.removeItem('owner_info');
    router.push('/login');
  };

  const menuItems = [
    {
      title: 'Dashboard',
      icon: LayoutDashboard,
      href: '/dashboard',
      badge: null
    },
    {
      title: 'Products',
      icon: Package,
      href: '/products',
      badge: null
    },
    {
      title: 'Stores',
      icon: Store,
      href: '/stores',
      badge: null
    },
    {
      title: 'Transactions',
      icon: CreditCard,
      href: '/transactions',
      badge: null
    },
    {
      title: 'Inventory',
      icon: Archive,
      href: '/inventory',
      badge: 'New'
    },
    {
      title: 'Stock Moves',
      icon: Truck,
      href: '/stock-moves',
      badge: 'New'
    },
    {
      title: 'SKU Map',
      icon: GitCompareArrows,
      href: '/sku-map',
      badge: 'New'
    },
    {
      title: 'Analytics',
      icon: BarChart3,
      href: '/analytics',
      badge: null
    },
    {
      title: 'Settings',
      icon: Settings,
      href: '/settings',
      badge: null
    }
  ];

  return (
    <div className={`${isCollapsed ? 'w-16' : 'w-64'} bg-white border-r border-gray-200 h-full transition-all duration-300 flex flex-col`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          {!isCollapsed && (
            <div>
              <h2 className="font-semibold text-gray-900">{brand?.name || 'Chronizer'}</h2>
              <p className="text-xs text-gray-500">{brand?.subdomain}.chronizer.com</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? <Menu className="h-4 w-4" /> : <X className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center">
                  <Icon className="h-5 w-5" />
                  {!isCollapsed && <span className="ml-3">{item.title}</span>}
                </div>
                {!isCollapsed && item.badge && (
                  <Badge variant="secondary" className="text-xs">
                    {item.badge}
                  </Badge>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        {!isCollapsed && (
          <div className="mb-3">
            <p className="text-sm font-medium text-gray-900">
              {owner?.firstName} {owner?.lastName}
            </p>
            <p className="text-xs text-gray-500">{owner?.email}</p>
          </div>
        )}
        <Button
          variant="outline"
          className="w-full"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          {!isCollapsed && <span className="ml-2">Logout</span>}
        </Button>
      </div>
    </div>
  );
}
