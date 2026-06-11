import { useState } from 'react';
import { toast } from 'sonner';
import { Check, ChevronDown } from 'lucide-react';
import {
  useAddComment,
  useComments,
  useDeleteComment,
  useEditComment,
  useMe,
  useResolveComment,
  type CommentTarget,
} from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CommentComposer } from './CommentComposer';
import { CommentThread } from './CommentThread';

export interface CommentsSectionProps {
  /** Exactly one of featureId / documentId. */
  target: CommentTarget;
  /** Hide the built-in "Comments" header (the editor sheet supplies its own). */
  showHeader?: boolean;
}

/** Shared comments surface for feature pages and the doc editor sheet. */
export function CommentsSection({ target, showHeader = true }: CommentsSectionProps) {
  const { data, isLoading } = useComments(target);
  const { me } = useMe();
  const addComment = useAddComment();
  const editComment = useEditComment();
  const resolveComment = useResolveComment();
  const deleteComment = useDeleteComment();
  const [showResolved, setShowResolved] = useState(false);

  const threads = data ?? [];
  const unresolved = threads.filter((t) => t.resolvedAt === null);
  const resolved = threads.filter((t) => t.resolvedAt !== null);

  const onError = (message: string) => () => toast.error(message);

  const renderThread = (thread: (typeof threads)[number]) => (
    <li key={thread.id}>
      <CommentThread
        thread={thread}
        meId={me?.id ?? null}
        onReply={(body) =>
          addComment.mutate(
            { target, body, parentId: thread.id },
            { onError: onError("Couldn't post reply") },
          )
        }
        onResolve={(nextResolved) =>
          resolveComment.mutate(
            { target, id: thread.id, resolved: nextResolved },
            { onError: onError("Couldn't update thread — restored") },
          )
        }
        onEdit={(commentId, body) =>
          editComment.mutate(
            { target, id: commentId, body },
            { onError: onError("Couldn't save comment — restored") },
          )
        }
        onDelete={(commentId) =>
          deleteComment.mutate(
            { target, id: commentId },
            { onError: onError("Couldn't delete comment — restored") },
          )
        }
      />
    </li>
  );

  return (
    <section aria-label="Comments" id="comments" className="scroll-mt-24">
      {showHeader ? (
        <div className="flex items-center gap-2">
          <h2 className="font-display text-sm font-semibold text-ink">Comments</h2>
          <span className="inline-flex items-center rounded-full bg-inset px-2 py-0.5 text-xs font-medium text-muted-ink">
            {threads.length}
          </span>
        </div>
      ) : null}

      <div className={cn('space-y-3', showHeader && 'mt-3')}>
        <CommentComposer
          onSubmit={(body) =>
            addComment.mutate({ target, body }, { onError: onError("Couldn't post comment") })
          }
          pending={addComment.isPending}
        />

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-20 w-full rounded-2xl" />
          </div>
        ) : threads.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-dash px-3 py-4 text-center text-sm text-muted-ink">
            No comments yet — start the discussion.
          </p>
        ) : (
          <>
            {unresolved.length > 0 ? (
              <ul className="space-y-3">{unresolved.map(renderThread)}</ul>
            ) : null}
            {resolved.length > 0 ? (
              <div>
                <button
                  type="button"
                  aria-expanded={showResolved}
                  onClick={() => setShowResolved((v) => !v)}
                  className="flex items-center gap-1.5 rounded-full bg-sage-soft px-3 py-1 text-xs font-medium text-sage outline-none transition-colors duration-150 ease-out hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  {resolved.length} resolved
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 transition-transform duration-150',
                      showResolved && 'rotate-180',
                    )}
                    aria-hidden
                  />
                </button>
                {showResolved ? (
                  <ul className="mt-3 space-y-3">{resolved.map(renderThread)}</ul>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

export default CommentsSection;
