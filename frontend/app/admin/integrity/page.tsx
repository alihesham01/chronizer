'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

interface IntegrityData {
  healthy: boolean;
  issues: string[];
  dbSize: string;
  tables: { name: string; rows: number }[];
  checkedAt: string;
}

export default function IntegrityCheckPage() {
  const router = useRouter();
  const [data, setData] = useState<IntegrityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const runCheck = () => {
    const token = localStorage.getItem('auth_token');
    if (!token) { router.push('/login'); return; }

    setLoading(true);
    setError('');
    fetch(`${API_BASE}/api/admin/integrity-check`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) setData(res.data);
        else setError(res.error || 'Failed to run integrity check');
      })
      .catch(() => setError('Failed to connect to server'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { runCheck(); }, [router]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Data Integrity Check</h1>
            <p className="text-gray-500 mt-1">Verify database consistency and detect issues</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={runCheck} disabled={loading}>{loading ? 'Checking...' : 'Re-run Check'}</Button>
            <Link href="/admin"><Button variant="outline">Back to Admin</Button></Link>
          </div>
        </div>

        {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}

        {data && (
          <div className="space-y-6">
            {/* Health Status */}
            <Card className={data.healthy ? 'border-green-200' : 'border-red-200'}>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  {data.healthy ? (
                    <Badge className="bg-green-100 text-green-700 text-sm px-3 py-1">HEALTHY</Badge>
                  ) : (
                    <Badge className="bg-red-100 text-red-700 text-sm px-3 py-1">ISSUES FOUND</Badge>
                  )}
                  <span className="text-sm font-normal text-gray-500">Checked at {new Date(data.checkedAt).toLocaleString()}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.issues.length === 0 ? (
                  <p className="text-green-700">No integrity issues detected. All data references are valid.</p>
                ) : (
                  <div className="space-y-2">
                    {data.issues.map((issue, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-red-50 rounded border border-red-100">
                        <span className="text-red-500 font-bold">!</span>
                        <span className="text-red-800 text-sm">{issue}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Database Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader><CardTitle>Database Size</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-4xl font-bold text-gray-900">{data.dbSize}</p>
                  <p className="text-sm text-gray-500 mt-1">Total database size on disk</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Table Row Counts</CardTitle></CardHeader>
                <CardContent>
                  {data.tables.length === 0 ? (
                    <p className="text-gray-500">No tables found</p>
                  ) : (
                    <div className="space-y-2">
                      {data.tables.map((t, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="font-mono text-gray-700">{t.name}</span>
                          <span className="font-semibold">{Number(t.rows).toLocaleString()} rows</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
