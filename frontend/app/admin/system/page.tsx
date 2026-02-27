'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SystemInfo {
  server: {
    uptime: number;
    nodeVersion: string;
    memoryUsage: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
    platform: string;
    arch: string;
  };
  database: {
    latencyMs: number;
    size: string;
    activeConnections: number;
    tables: { table_name: string; row_count: number; total_size: string }[];
  };
  timestamp: string;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function SystemStatusPage() {
  const router = useRouter();
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSystem = () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      router.push('/login');
      return;
    }

    fetch(`${API_BASE}/api/admin/system`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setSystem(data.data);
        } else {
          setError(data.error || 'Failed to load system info');
        }
      })
      .catch(() => setError('Failed to connect to server'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSystem();
    const interval = setInterval(fetchSystem, 10000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading system status...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button className="w-full mt-4" onClick={() => router.push('/admin')}>
              Back to Admin
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">System Status</h1>
            <p className="text-gray-500 mt-1">
              Real-time server and database health — auto-refreshes every 10s
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={fetchSystem}>Refresh</Button>
            <Link href="/admin">
              <Button variant="outline">Back to Admin</Button>
            </Link>
          </div>
        </div>

        {system && (
          <>
            {/* Server Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle>Server</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <InfoRow label="Uptime" value={formatUptime(system.server.uptime)} />
                  <InfoRow label="Node.js" value={system.server.nodeVersion} />
                  <InfoRow label="Platform" value={`${system.server.platform} (${system.server.arch})`} />
                  <InfoRow label="Last Check" value={new Date(system.timestamp).toLocaleTimeString()} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Memory Usage</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <MemoryBar
                    label="Heap Used"
                    used={system.server.memoryUsage.heapUsed}
                    total={system.server.memoryUsage.heapTotal}
                  />
                  <MemoryBar
                    label="RSS"
                    used={system.server.memoryUsage.rss}
                    total={system.server.memoryUsage.rss * 1.5}
                  />
                  <InfoRow label="External" value={formatBytes(system.server.memoryUsage.external)} />
                </CardContent>
              </Card>
            </div>

            {/* Database Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card className={system.database.latencyMs < 50 ? 'border-green-200' : system.database.latencyMs < 200 ? 'border-yellow-200' : 'border-red-200'}>
                <CardContent className="pt-4 text-center">
                  <p className="text-3xl font-bold">{system.database.latencyMs}ms</p>
                  <p className="text-sm text-gray-500 mt-1">DB Latency</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-3xl font-bold">{system.database.size}</p>
                  <p className="text-sm text-gray-500 mt-1">Database Size</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <p className="text-3xl font-bold">{system.database.activeConnections}</p>
                  <p className="text-sm text-gray-500 mt-1">Active Connections</p>
                </CardContent>
              </Card>
            </div>

            {/* Table Stats */}
            <Card>
              <CardHeader>
                <CardTitle>Database Tables</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-3 font-medium text-gray-500">Table</th>
                        <th className="pb-3 font-medium text-gray-500 text-right">Rows</th>
                        <th className="pb-3 font-medium text-gray-500 text-right">Size</th>
                      </tr>
                    </thead>
                    <tbody>
                      {system.database.tables.map((table, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 font-mono text-xs">{table.table_name}</td>
                          <td className="py-2 text-right">{parseInt(String(table.row_count)).toLocaleString()}</td>
                          <td className="py-2 text-right text-gray-500">{table.total_size}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function MemoryBar({ label, used, total }: { label: string; used: number; total: number }) {
  const pct = Math.min((used / total) * 100, 100);
  const color = pct < 60 ? 'bg-green-500' : pct < 80 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-500">{label}</span>
        <span className="font-medium">{formatBytes(used)} / {formatBytes(total)}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
