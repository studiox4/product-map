import { useState } from 'react';
import { toast } from 'sonner';
import { Pencil } from 'lucide-react';
import type { Product } from '@productmap/shared';
import { useUpdateProduct } from '@/lib/api';
import { Input } from '@/components/ui/input';

export function VisionHeader({ product }: { product: Product }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(product.vision);
  const updateProduct = useUpdateProduct();

  function startEditing() {
    setDraft(product.vision);
    setEditing(true);
  }

  function save() {
    setEditing(false);
    const vision = draft.trim();
    if (vision === product.vision) return;
    updateProduct.mutate(
      { id: product.id, vision },
      {
        onSuccess: () => toast.success('Vision saved'),
        onError: () => toast.error("Couldn't save the vision — restored"),
      },
    );
  }

  return (
    <header>
      <h1 className="w-fit bg-gradient-to-r from-[var(--pm-ink)] to-[var(--pm-action)] bg-clip-text font-display text-4xl font-bold tracking-tight text-transparent">
        {product.name}
      </h1>
      {editing ? (
        <Input
          aria-label="Product vision"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="mt-2 max-w-2xl rounded-xl text-base"
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className="group mt-2 -ml-2 flex max-w-2xl items-center gap-2 rounded-full px-2 py-0.5 text-left text-base text-muted-ink outline-none transition-colors duration-150 ease-out hover:bg-wash hover:text-body-ink focus-visible:ring-2 focus-visible:ring-ring"
          title="Click to edit the vision"
        >
          <span>{product.vision || 'Add a product vision…'}</span>
          <Pencil
            className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-60 group-focus-visible:opacity-60"
            aria-hidden
          />
        </button>
      )}
    </header>
  );
}

export default VisionHeader;
