import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Map as MapIcon } from 'lucide-react';
import { useIntakeMeta, useSubmitIntake } from '@/lib/api';
import { Button, Input, Label, Textarea, Skeleton } from '@productmap/ui';

export default function IntakePage() {
  const { token = '' } = useParams<{ token: string }>();
  const meta = useIntakeMeta(token);
  const submitMut = useSubmitIntake(token);
  const [title, setTitle] = useState('');
  const [bodyMd, setBodyMd] = useState('');
  const [submitterName, setName] = useState('');
  const [submitterEmail, setEmail] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [done, setDone] = useState(false);

  useEffect(() => {
    const m = document.createElement('meta');
    m.name = 'robots';
    m.content = 'noindex, nofollow';
    document.head.appendChild(m);
    return () => { document.head.removeChild(m); };
  }, []);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitMut.isPending || title.trim() === '') return;
    submitMut.mutate(
      { title, bodyMd, submitterName: submitterName || undefined, submitterEmail: submitterEmail || undefined, website },
      { onSuccess: () => setDone(true) },
    );
  }

  return (
    <>
      {/* Honeypot — always in DOM (even during loading) so bots find it immediately.
          Visually hidden, off-screen, not announced to screen readers. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
      />
      <IntakeFrame>
        {meta.isLoading ? (
          <>
            <Skeleton className="h-8 w-64" />
            <Skeleton className="mt-6 h-48 w-full rounded-2xl" />
          </>
        ) : meta.isError || !meta.data ? (
          <div className="mx-auto mt-24 max-w-md rounded-2xl bg-card p-10 text-center shadow-card">
            <h1 className="font-display text-xl font-bold tracking-tight text-ink">This form isn't active</h1>
            <p className="mt-2 text-sm text-muted-foreground">The intake link expired, was revoked, or never existed.</p>
          </div>
        ) : done ? (
          <div className="mx-auto mt-24 max-w-md rounded-2xl bg-card p-10 text-center shadow-card">
            <h1 className="font-display text-xl font-bold tracking-tight text-ink">Thanks!</h1>
            <p className="mt-2 text-sm text-muted-foreground">Your idea was received.</p>
          </div>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{meta.data.projectName}</h1>
            {meta.data.introMd ? <p className="mt-2 text-sm text-muted-foreground">{meta.data.introMd}</p> : null}
            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <div>
                <Label htmlFor="title">Title</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
              </div>
              <div>
                <Label htmlFor="body">Description</Label>
                <Textarea id="body" value={bodyMd} onChange={(e) => setBodyMd(e.target.value)} maxLength={5000} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="name">Your name (optional)</Label>
                  <Input id="name" value={submitterName} onChange={(e) => setName(e.target.value)} maxLength={100} />
                </div>
                <div>
                  <Label htmlFor="email">Your email (optional)</Label>
                  <Input id="email" type="email" value={submitterEmail} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
                </div>
              </div>
              <Button type="submit" disabled={submitMut.isPending || title.trim() === ''}>
                {submitMut.isPending ? 'Submitting…' : 'Submit idea'}
              </Button>
              {submitMut.isError ? <p className="text-sm text-destructive">Something went wrong. Try again.</p> : null}
            </form>
          </>
        )}
      </IntakeFrame>
    </>
  );
}

function IntakeFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <main className="mx-auto w-full max-w-2xl px-6 py-10">{children}</main>
      <footer className="mx-auto flex w-full max-w-2xl justify-center px-6 pb-10">
        <Link
          to="/"
          className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground shadow-card transition-colors duration-150 ease-out hover:text-ink"
        >
          <MapIcon className="h-3.5 w-3.5 text-action" aria-hidden />
          Made with ProductMap
        </Link>
      </footer>
    </div>
  );
}
