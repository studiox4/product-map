import { useState } from 'react';
import { toast } from 'sonner';
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
      <h1 className="text-3xl font-semibold tracking-tight">{product.name}</h1>
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
          className="mt-2 max-w-2xl text-base"
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className="mt-2 block max-w-2xl rounded-md text-left text-base text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
          title="Click to edit the vision"
        >
          {product.vision || 'Add a product vision…'}
        </button>
      )}
    </header>
  );
}

export default VisionHeader;
