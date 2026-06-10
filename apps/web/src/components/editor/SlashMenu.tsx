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
          className="w-72 rounded-lg border bg-popover p-2 text-sm text-muted-foreground shadow-md"
        >
          No matching commands
        </div>
      );
    }

    return (
      <div
        role="listbox"
        aria-label="Insert block"
        className="max-h-80 w-72 overflow-y-auto rounded-lg border bg-popover p-1 shadow-md"
      >
        {items.map((item, i) => (
          <button
            key={item.title}
            type="button"
            role="option"
            aria-selected={i === selected}
            className={cn(
              'flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors duration-150 ease-out hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
              i === selected && 'bg-accent',
            )}
            onMouseEnter={() => setSelected(i)}
            onClick={() => command(item)}
          >
            <item.icon
              className="h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="flex flex-col">
              <span className="font-medium text-popover-foreground">
                {item.title}
              </span>
              <span className="text-xs text-muted-foreground">
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
