import { createContext, useContext, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { User } from '@productmap/shared';
import { useMe } from './api';
import { wasDemoSession } from '@/demo/demoState';

interface AuthCtx { me: User | null; isLoading: boolean; }
const Ctx = createContext<AuthCtx>({ me: null, isLoading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useMe();
  return <Ctx.Provider value={{ me: data ?? null, isLoading }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }

/** Gate: render children only when authenticated; else redirect to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { me, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return null;
  if (!me) {
    // A reloaded demo tab has no live runtime yet — send it back to /demo to
    // re-bootstrap a fresh workspace rather than to the (irrelevant) login form.
    if (wasDemoSession()) return <Navigate to="/demo" replace />;
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}
