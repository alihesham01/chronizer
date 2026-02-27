'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface InviteLink {
  id: string;
  token: string;
  inviteUrl?: string;
  recipient_email: string | null;
  is_used: boolean;
  used_by_email: string | null;
  used_by_name: string | null;
  used_at: string | null;
  expires_at: string;
  notes: string | null;
  created_at: string;
}

function getStatus(link: InviteLink): { label: string; class: string } {
  if (link.is_used) return { label: 'Used', class: 'bg-blue-100 text-blue-700' };
  if (new Date(link.expires_at) < new Date()) return { label: 'Expired', class: 'bg-gray-100 text-gray-700' };
  return { label: 'Active', class: 'bg-green-100 text-green-700' };
}

function timeLeft(expires: string): string {
  const diff = new Date(expires).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

export default function InviteLinksPage() {
  const router = useRouter();
  const [links, setLinks] = useState<InviteLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [creating, setCreating] = useState(false);
  const [newLink, setNewLink] = useState({ recipientEmail: '', notes: '' });
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [, setTick] = useState(0);

  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;

  // Refresh timers every second
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchLinks = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE}/api/admin/invite-links`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        setLinks(data.data);
      } else {
        setError(data.error || 'Failed to load invite links');
      }
    } catch {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    fetchLinks();
  }, [token, router, fetchLinks]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    setSuccess('');
    setGeneratedUrl('');

    try {
      const response = await fetch(`${API_BASE}/api/admin/invite-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          recipientEmail: newLink.recipientEmail || undefined,
          notes: newLink.notes || undefined,
        }),
      });
      const data = await response.json();

      if (data.success) {
        setGeneratedUrl(data.data.inviteUrl);
        setSuccess(`Invite link created! Expires in ${data.data.expiresInMinutes} minutes.`);
        setNewLink({ recipientEmail: '', notes: '' });
        fetchLinks();
      } else {
        setError(data.error || 'Failed to create invite link');
      }
    } catch {
      setError('Failed to create invite link');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this invite link?')) return;
    try {
      const response = await fetch(`/api/admin/invite-links/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (data.success) {
        setSuccess('Invite link revoked');
        fetchLinks();
      } else {
        setError(data.error || 'Failed to revoke');
      }
    } catch {
      setError('Failed to revoke');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copied to clipboard!');
    setTimeout(() => setSuccess(''), 2000);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p className="text-gray-500">Loading...</p></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Invite Links</h1>
            <p className="text-gray-500 mt-1">Generate one-time invite links that expire in 10 minutes</p>
          </div>
          <Link href="/admin"><Button variant="outline">Back to Admin</Button></Link>
        </div>

        {error && <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert>}
        {success && <Alert className="mb-4 border-green-200 bg-green-50"><AlertDescription className="text-green-700">{success}</AlertDescription></Alert>}

        {/* Generate New Link */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Generate Invite Link</CardTitle>
            <CardDescription>Each link is single-use and expires in 10 minutes</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Label htmlFor="recipientEmail">Recipient Email (optional)</Label>
                  <Input
                    id="recipientEmail"
                    type="email"
                    value={newLink.recipientEmail}
                    onChange={(e) => setNewLink({ ...newLink, recipientEmail: e.target.value })}
                    placeholder="brand-owner@example.com"
                  />
                  <p className="text-xs text-gray-500 mt-1">If set, only this email can use the link</p>
                </div>
                <div className="flex-1">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Input
                    id="notes"
                    value={newLink.notes}
                    onChange={(e) => setNewLink({ ...newLink, notes: e.target.value })}
                    placeholder="e.g., For Acme Corp onboarding"
                  />
                </div>
              </div>
              <Button type="submit" disabled={creating}>
                {creating ? 'Generating...' : 'Generate Invite Link'}
              </Button>
            </form>

            {generatedUrl && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm font-medium text-green-800 mb-2">Send this link to the brand owner:</p>
                <div className="flex gap-2">
                  <Input value={generatedUrl} readOnly className="font-mono text-xs bg-white" />
                  <Button onClick={() => copyToClipboard(generatedUrl)} variant="outline">Copy</Button>
                </div>
                <p className="text-xs text-green-600 mt-2">This link expires in 10 minutes and can only be used once.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Links History */}
        <Card>
          <CardHeader>
            <CardTitle>Invite Link History ({links.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {links.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No invite links generated yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-3 font-medium text-gray-500">Status</th>
                      <th className="pb-3 font-medium text-gray-500">Recipient</th>
                      <th className="pb-3 font-medium text-gray-500">Time Left</th>
                      <th className="pb-3 font-medium text-gray-500">Used By</th>
                      <th className="pb-3 font-medium text-gray-500">Notes</th>
                      <th className="pb-3 font-medium text-gray-500">Created</th>
                      <th className="pb-3 font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((link) => {
                      const status = getStatus(link);
                      const isActive = !link.is_used && new Date(link.expires_at) > new Date();
                      return (
                        <tr key={link.id} className={`border-b last:border-0 ${!isActive ? 'opacity-60' : ''}`}>
                          <td className="py-3">
                            <span className={`px-2 py-1 rounded-full text-xs ${status.class}`}>{status.label}</span>
                          </td>
                          <td className="py-3 text-gray-600">{link.recipient_email || 'Anyone'}</td>
                          <td className="py-3">
                            {link.is_used ? (
                              <span className="text-gray-400">—</span>
                            ) : (
                              <span className={isActive ? 'text-orange-600 font-mono text-xs' : 'text-gray-400'}>
                                {timeLeft(link.expires_at)}
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-gray-600">
                            {link.used_by_email ? (
                              <span>{link.used_by_name} ({link.used_by_email})</span>
                            ) : '—'}
                          </td>
                          <td className="py-3 text-gray-500 max-w-[150px] truncate">{link.notes || '—'}</td>
                          <td className="py-3 text-gray-500">{new Date(link.created_at).toLocaleString()}</td>
                          <td className="py-3">
                            {isActive && (
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline"
                                  onClick={() => copyToClipboard(`${window.location.origin}/register?invite=${link.token}`)}>
                                  Copy
                                </Button>
                                <Button size="sm" variant="outline" className="text-red-600"
                                  onClick={() => handleRevoke(link.id)}>
                                  Revoke
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
