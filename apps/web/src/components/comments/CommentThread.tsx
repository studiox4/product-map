import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Check, Loader2, MoreHorizontal, Sparkles } from 'lucide-react';
import type { Comment, CommentThread as Thread } from '@productmap/shared';
import { UserAvatar } from '@/components/UserAvatar';
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@productmap/ui';
import { CommentComposer } from './CommentComposer';
import { segmentMentions } from '@/lib/mentions';

export interface CommentThreadProps {
  thread: Thread;
  /** Current user id — gates the edit/delete menu to own comments. */
  meId: string | null;
  onReply: (body: string) => void;
  onResolve: (resolved: boolean) => void;
  onEdit: (commentId: string, body: string) => void;
  onDelete: (commentId: string) => void;
  /** AI decision extraction (resolved roots only); omitted when AI is disabled. */
  onLogDecision?: () => void;
  logDecisionPending?: boolean;
}

function CommentBody({ body }: { body: string }) {
  return (
    <>
      {segmentMentions(body).map((seg, i) =>
        seg.type === 'mention' ? (
          <span key={i} className="rounded bg-accent/15 px-1 font-medium text-accent">
            @{seg.label}
          </span>
        ) : (
          <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{seg.value}</span>
        ),
      )}
    </>
  );
}

function CommentItem({
  comment,
  isOwn,
  onEdit,
  onDelete,
}: {
  comment: Comment;
  isOwn: boolean;
  onEdit: (body: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex items-start gap-2.5">
      <UserAvatar
        user={{ name: comment.authorName, color: comment.authorColor }}
        size="sm"
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium text-ink">{comment.authorName}</span>{' '}
          <span className="whitespace-nowrap text-xs text-muted-ink">
            · {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          </span>
        </p>
        {editing ? (
          <CommentComposer
            className="mt-1 bg-panel p-2 shadow-none"
            initialValue={comment.body}
            placeholder="Edit comment…"
            submitLabel="Save"
            autoFocus
            onCancel={() => setEditing(false)}
            onSubmit={(body) => {
              onEdit(body);
              setEditing(false);
            }}
          />
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-body-ink"><CommentBody body={comment.body} /></p>
        )}
      </div>
      {isOwn && !editing ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Comment actions"
              className="h-7 w-7 shrink-0 rounded-full p-0 text-muted-ink"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}>Edit</DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={onDelete}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

/** One thread card: root comment, actions, and one level of indented replies. */
export function CommentThread({
  thread,
  meId,
  onReply,
  onResolve,
  onEdit,
  onDelete,
  onLogDecision,
  logDecisionPending = false,
}: CommentThreadProps) {
  const [replying, setReplying] = useState(false);
  const resolved = thread.resolvedAt !== null;

  return (
    <article
      aria-label={`Thread by ${thread.authorName}${resolved ? ' (resolved)' : ''}`}
      className="rounded-2xl bg-surface p-4 shadow-card"
    >
      <CommentItem
        comment={thread}
        isOwn={thread.authorId === meId}
        onEdit={(body) => onEdit(thread.id, body)}
        onDelete={() => onDelete(thread.id)}
      />

      <div className="mt-1.5 flex items-center gap-1 pl-[30px]">
        {resolved ? (
          <>
            <span className="inline-flex items-center gap-1 rounded-full bg-sage-soft px-2.5 py-0.5 text-xs font-medium text-sage">
              <Check className="h-3 w-3" aria-hidden />
              Resolved
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-full px-2.5 text-xs text-sage hover:bg-sage-soft hover:text-sage"
              onClick={() => onResolve(false)}
            >
              Reopen
            </Button>
            {onLogDecision ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={logDecisionPending}
                className="h-7 rounded-full px-2.5 text-xs text-action hover:bg-action-soft hover:text-action"
                onClick={onLogDecision}
              >
                {logDecisionPending ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="mr-1 h-3 w-3" aria-hidden />
                )}
                Log decision
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-full px-2.5 text-xs text-muted-ink"
              onClick={() => setReplying((v) => !v)}
            >
              Reply
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-full px-2.5 text-xs text-sage hover:bg-sage-soft hover:text-sage"
              onClick={() => onResolve(true)}
            >
              <Check className="mr-1 h-3 w-3" aria-hidden />
              Resolve
            </Button>
          </>
        )}
      </div>

      {thread.replies.length > 0 || replying ? (
        <div className="ml-2.5 mt-3 space-y-3 border-l-2 border-wash pl-4">
          {thread.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              isOwn={reply.authorId === meId}
              onEdit={(body) => onEdit(reply.id, body)}
              onDelete={() => onDelete(reply.id)}
            />
          ))}
          {replying ? (
            <CommentComposer
              className="bg-panel p-2 shadow-none"
              placeholder="Reply…"
              submitLabel="Reply"
              autoFocus
              onCancel={() => setReplying(false)}
              onSubmit={(body) => {
                onReply(body);
                setReplying(false);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export default CommentThread;
