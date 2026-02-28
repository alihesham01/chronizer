'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

interface ActivityEntry {
  id: string;
  action: string;
  details: any;
  created_at: string;
  email: string;
  first_name: string;
  last_name: string;
  brand_name: string;
}

export default function ActivityLogPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [pagination, setPagination] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchPage = (p: number) => {
    const token = localStorage.getItem('auth_token');
    if (!token) { router.push('/login'); return; }

    setLoading(true);
    fetch(`${API_BASE}/api/admin/activity-log?page=${p}&limit=50`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setEntries(data.data);
          setPagination(data.pagination);
          setPage(p);
        } else {
          setError(data.error || 'Failed to load activity log');
        }
      })
      .catch(() => setError('Failed to connect to server'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPage(1); }, [router]);

  const actionColors: Record<string, string> = {
    account_created: 'bg-green-100 text-green-700',
    admin_password_reset: 'bg-amber-100 text-amber-700',
    store_created: 'bg-blue-100 text-blue-700',
    product_created: 'bg-purple-100 text-purple-700',
    unmapped_sku_resolved: 'bg-indigo-100 text-indigo-700',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Activity Log</h1>
            <p className="text-gray-500 mt-1">Full audit trail of all system actions</p>
          </div>
          <Link href="/admin"><Button variant="outline">Back to Admin</Button></Link>
        </div>

        {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}

        <Card>
          <CardHeader>
            <CardTitle>
              Activity Entries
              {pagination && <span className="text-sm font-normal text-gray-500 ml-2">({pagination.total} total)</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-gray-500 text-center py-8">Loading...</p>
            ) : entries.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No activity logged yet. Activity will appear here as users interact with the system.</p>
            ) : (
              <>
                <div className="space-y-3">
                  {entries.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-4 p-3 border rounded-lg hover:bg-gray-50">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={actionColors[entry.action] || 'bg-gray-100 text-gray-700'}>
                            {entry.action.replace(/_/g, ' ')}
                          </Badge>
                          {entry.brand_name && (
                            <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">{entry.brand_name}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-700">
                          {entry.email && <span className="font-medium">{entry.first_name || entry.email}</span>}
                          {entry.details && typeof entry.details === 'object' && (
                            <span className="text-gray-500 ml-1">
                              {Object.entries(entry.details).map(([k, v]) => `${k}: ${v}`).join(', ')}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>

                {pagination && pagination.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => fetchPage(page - 1)}>Previous</Button>
                    <span className="text-sm text-gray-500">Page {page} of {pagination.totalPages}</span>
                    <Button size="sm" variant="outline" disabled={page >= pagination.totalPages} onClick={() => fetchPage(page + 1)}>Next</Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
