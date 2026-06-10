import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Check, MoreHorizontal } from 'lucide-react';
import type { Comment, CommentThread as Thread } from '@productmap/shared';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CommentComposer } from './CommentComposer';

export interface CommentThreadProps {
  thread: Thread;
  /** Current user id — gates the edit/delete menu to own comments. */
  meId: string | null;
  onReply: (body: string) => void;
  onResolve: (resolved: boolean) => void;
  onEdit: (commentId: string, body: string) => void;
  onDelete: (commentId: string) => void;
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
            className="mt-1 bg-[#f7f9fb] p-2 shadow-none"
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
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-body-ink">{comment.body}</p>
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
}: CommentThreadProps) {
  const [replying, setReplying] = useState(false);
  const resolved = thread.resolvedAt !== null;

  return (
    <article
      aria-label={`Thread by ${thread.authorName}${resolved ? ' (resolved)' : ''}`}
      className="rounded-2xl bg-white p-4 shadow-card"
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
        <div className="ml-2.5 mt-3 space-y-3 border-l-2 border-[#edf1f7] pl-4">
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
              className="bg-[#f7f9fb] p-2 shadow-none"
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
