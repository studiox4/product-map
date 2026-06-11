import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { Extension, type Editor, type Range } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion';
import { cn } from '@/lib/utils';
import { filterSlashItems, type SlashItem } from './slash-items';

interface SlashMenuListProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

export interface SlashMenuListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export const SlashMenuList = forwardRef<SlashMenuListHandle, SlashMenuListProps>(
  function SlashMenuList({ items, command }, ref) {
    const [selected, setSelected] = useState(0);

    useEffect(() => setSelected(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown(event) {
        if (event.key === 'ArrowDown') {
          setSelected((s) => (items.length ? (s + 1) % items.length : 0));
          return true;
        }
        if (event.key === 'ArrowUp') {
          setSelected((s) =>
            items.length ? (s - 1 + items.length) % items.length : 0,
          );
          return true;
        }
        if (event.key === 'Enter') {
          if (items[selected]) command(items[selected]);
          return true;
        }
        return false;
      },
    }));

    if (!items.length) {
      return (
        <div
          role="listbox"
          className="w-72 rounded-xl border border-transparent bg-surface p-3 text-sm text-muted-ink shadow-card-hover"
        >
          No matching commands
        </div>
      );
    }

    return (
      <div
        role="listbox"
        aria-label="Insert block"
        className="max-h-80 w-72 overflow-y-auto rounded-xl border border-transparent bg-surface p-1.5 shadow-card-hover"
      >
        {items.map((item, i) => (
          <button
            key={item.title}
            type="button"
            role="option"
            aria-selected={i === selected}
            className={cn(
              'flex w-full cursor-pointer items-center gap-3 rounded-full px-2 py-1.5 text-left text-sm transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring',
              i === selected && 'bg-action-soft',
            )}
            onMouseEnter={() => setSelected(i)}
            onClick={() => command(item)}
          >
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-body-ink transition-colors duration-150 ease-out',
                i === selected && 'bg-surface text-action',
              )}
            >
              <item.icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="flex min-w-0 flex-col">
              <span
                className={cn(
                  'font-medium text-ink',
                  i === selected && 'text-action',
                )}
              >
                {item.title}
              </span>
              <span className="truncate text-xs text-muted-ink">
                {item.description}
              </span>
            </span>
          </button>
        ))}
      </div>
    );
  },
);

export interface SlashCommandOptions {
  pickImage: () => void;
}

/**
 * Tiptap extension wiring `@tiptap/suggestion` to the slash menu.
 * Opens on '/', filters as you type, arrows + Enter navigate, Esc closes.
 */
export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'slashCommand',

  addOptions() {
    return { pickImage: () => {} };
  },

  addProseMirrorPlugins() {
    const { pickImage } = this.options;
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: '/',
        startOfLine: false,
        allowSpaces: false,
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
          props.command({ editor, range, pickImage });
        },
        items: ({ query }) => filterSlashItems(query),
        render: () => {
          let component: ReactRenderer<SlashMenuListHandle, SlashMenuListProps> | null = null;
          let container: HTMLDivElement | null = null;

          const position = (props: SuggestionProps<SlashItem>) => {
            if (!container) return;
            const rect = props.clientRect?.();
            if (!rect) return;
            container.style.left = `${rect.left + window.scrollX}px`;
            container.style.top = `${rect.bottom + window.scrollY + 4}px`;
          };

          const destroy = () => {
            component?.destroy();
            component = null;
            container?.remove();
            container = null;
          };

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashMenuList, {
                props: {
                  items: props.items,
                  command: (item: SlashItem) => props.command(item),
                },
                editor: props.editor,
              });
              container = document.createElement('div');
              container.style.position = 'absolute';
              container.style.zIndex = '50';
              container.style.transition = 'left 120ms ease-out, top 120ms ease-out';
              container.appendChild(component.element);
              document.body.appendChild(container);
              position(props);
            },
            onUpdate: (props) => {
              component?.updateProps({
                items: props.items,
                command: (item: SlashItem) => props.command(item),
              });
              position(props);
            },
            onKeyDown: (props) => {
              if (props.event.key === 'Escape') {
                destroy();
                return true;
              }
              return component?.ref?.onKeyDown(props.event) ?? false;
            },
            onExit: destroy,
          };
        },
      }),
    ];
  },
});
