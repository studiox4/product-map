const ETHOS = [
  { title: 'Offline', body: 'Runs as a single process with no third-party calls in the critical path.' },
  { title: 'Air-gapped', body: 'No outbound dependencies required — point AI and SMTP at your own services or skip them.' },
  { title: 'Your markdown is yours', body: 'Docs are plain markdown you can export and version-control any time.' },
  { title: 'Open source', body: 'MIT-licensed and self-hostable — read the code, fork it, deploy your own.' },
] as const;

export default function EthosBand() {
  return (
    <section className="border-y border-border bg-muted/30">
      <div className="mx-auto grid max-w-screen-xl gap-8 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
        {ETHOS.map(({ title, body }) => (
          <div key={title}>
            <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
