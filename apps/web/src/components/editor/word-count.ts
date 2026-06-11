interface JsonNode {
  text?: string;
  content?: JsonNode[];
}

/** Word count across all text nodes of a Tiptap JSON document. */
export function countWords(doc: unknown): number {
  let count = 0;
  const walk = (node: JsonNode | null | undefined) => {
    if (!node) return;
    if (typeof node.text === 'string') {
      const words = node.text.trim().split(/\s+/).filter(Boolean);
      count += words.length;
    }
    node.content?.forEach(walk);
  };
  walk(doc as JsonNode);
  return count;
}
