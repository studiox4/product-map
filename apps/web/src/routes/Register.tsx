import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { MIN_PASSWORD_LENGTH } from '@productmap/shared';
import { useRegister, apiErrorMessage, ApiError } from '@/lib/api';
import { safeNext } from '@/routes/Login';
import { Button, Input, Label } from '@productmap/ui';

export default function Register() {
  const register = useRegister();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const [form, setForm] = useState({ email: '', name: '', password: '' });
  const [error, setError] = useState('');
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    register.mutate(form, {
      onSuccess: async (user) => { qc.setQueryData(['me'], user); await qc.invalidateQueries(); navigate(next); },
      onError: (err) => setError(
        err instanceof ApiError && err.status === 403
          ? 'Registration is disabled — ask an admin for an invite.'
          : apiErrorMessage(err, 'Could not create your account.')),
    });
  }

  return (
    <div className="mx-auto mt-24 max-w-sm">
      <h1 className="font-display text-2xl font-bold text-ink">Create your account</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div><Label htmlFor="name">Name</Label><Input id="name" value={form.name} onChange={set('name')} required /></div>
        <div><Label htmlFor="email">Email</Label><Input id="email" type="email" value={form.email} onChange={set('email')} required /></div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" minLength={MIN_PASSWORD_LENGTH} value={form.password} onChange={set('password')} required />
          <p className="mt-1 text-xs text-muted-foreground">At least {MIN_PASSWORD_LENGTH} characters.</p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={register.isPending} className="w-full">Create account</Button>
      </form>
    </div>
  );
}
