import { REPO_URL } from '@/lib/marketing';

export default function MarketingFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-screen-xl flex-wrap items-center justify-between gap-4 px-6 py-10 text-sm text-muted-foreground">
        <span>Powered by ProductMap</span>
        <nav className="flex items-center gap-6">
          <a href={REPO_URL} target="_blank" rel="noreferrer noopener" className="hover:text-ink">
            GitHub
          </a>
          <a href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer noopener" className="hover:text-ink">
            Docs
          </a>
          <a
            href={`${REPO_URL}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer noopener"
            className="hover:text-ink"
          >
            License
          </a>
        </nav>
      </div>
    </footer>
  );
}
