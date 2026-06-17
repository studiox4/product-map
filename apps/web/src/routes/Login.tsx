import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useLogin, apiErrorMessage } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Only honor same-origin path redirects (leading single slash) — never an absolute/protocol URL. */
export function safeNext(next: string | null): string {
  if (!next || next[0] !== '/' || next[1] === '/' || next[1] === '\\') return '/';
  return next;
}

export default function Login() {
  const login = useLogin();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    login.mutate({ email, password }, {
      onSuccess: async (user) => { qc.setQueryData(['me'], user); await qc.invalidateQueries(); navigate(next); },
      onError: (err) => setError(apiErrorMessage(err, 'Invalid email or password.')),
    });
  }

  return (
    <div className="mx-auto mt-24 max-w-sm">
      <h1 className="font-display text-2xl font-bold text-ink">Sign in</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div><Label htmlFor="email">Email</Label><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div><Label htmlFor="password">Password</Label><Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={login.isPending} className="w-full">Sign in</Button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">No account? <a href={`/register${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-action">Register</a></p>
    </div>
  );
}
