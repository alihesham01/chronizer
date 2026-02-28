'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  is_admin: boolean;
  last_login: string | null;
  last_active: string | null;
  created_at: string;
  brand_name: string;
  subdomain: string;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [search, setSearch] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

  useEffect(() => {
    if (!token) { router.push('/login'); return; }

    fetch(`${API_BASE}/api/admin/all-users`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.success) setUsers(data.data);
        else setError(data.error || 'Failed to load users');
      })
      .catch(() => setError('Failed to connect to server'))
      .finally(() => setLoading(false));
  }, [router, token]);

  const handleResetPassword = async () => {
    if (!resetUserId || !newPassword) return;
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters' });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/admin/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: resetUserId, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');
      setMessage({ type: 'success', text: data.message || 'Password reset successfully' });
      setResetUserId(null);
      setNewPassword('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.first_name?.toLowerCase().includes(search.toLowerCase()) ||
    u.brand_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading users...</p></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-500 mt-1">{users.length} total users across all brands</p>
          </div>
          <Link href="/admin"><Button variant="outline">Back to Admin</Button></Link>
        </div>

        {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}
        {message && (
          <Alert className={`mb-4 ${message.type === 'error' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
            <AlertDescription className={message.type === 'error' ? 'text-red-800' : 'text-green-800'}>{message.text}</AlertDescription>
          </Alert>
        )}

        <div className="mb-4">
          <Input placeholder="Search by email, name, or brand..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-md" />
        </div>

        {/* Reset password modal */}
        {resetUserId && (
          <Card className="mb-4 border-amber-200 bg-amber-50">
            <CardContent className="pt-4">
              <p className="font-medium mb-2">Reset password for: <span className="text-amber-700">{users.find(u => u.id === resetUserId)?.email}</span></p>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label>New Password (min 8 chars)</Label>
                  <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter new password" />
                </div>
                <Button onClick={handleResetPassword}>Reset</Button>
                <Button variant="outline" onClick={() => { setResetUserId(null); setNewPassword(''); }}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle>All Users ({filtered.length})</CardTitle></CardHeader>
          <CardContent>
            {filtered.length === 0 ? <p className="text-gray-500 text-center py-8">No users found</p> : (
              <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="border-b text-left">
                  <th className="pb-3 font-medium text-gray-500">Email</th>
                  <th className="pb-3 font-medium text-gray-500">Name</th>
                  <th className="pb-3 font-medium text-gray-500">Brand</th>
                  <th className="pb-3 font-medium text-gray-500">Status</th>
                  <th className="pb-3 font-medium text-gray-500">Last Login</th>
                  <th className="pb-3 font-medium text-gray-500">Created</th>
                  <th className="pb-3 font-medium text-gray-500">Actions</th>
                </tr></thead>
                <tbody>{filtered.map(u => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="py-3">{u.email}</td>
                    <td className="py-3">{u.first_name} {u.last_name}</td>
                    <td className="py-3"><span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">{u.brand_name}</span></td>
                    <td className="py-3">{u.is_active ? <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge> : <Badge className="bg-red-100 text-red-700 text-xs">Inactive</Badge>}</td>
                    <td className="py-3 text-xs text-gray-500">{u.last_login ? new Date(u.last_login).toLocaleString() : 'Never'}</td>
                    <td className="py-3 text-xs text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="py-3">
                      <Button size="sm" variant="outline" className="text-xs" onClick={() => { setResetUserId(u.id); setNewPassword(''); setMessage(null); }}>
                        Reset Password
                      </Button>
                    </td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
