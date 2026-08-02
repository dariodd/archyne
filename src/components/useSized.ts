import { useInternalNode } from "@xyflow/react";

/**
 * True when this node has been given a size rather than taking its own.
 *
 * Read from the node's own style, deliberately not from the `width` prop:
 * that one is the *measured* size, which for an unsized node is whatever the
 * content came out as — so it can never answer this question.
 *
 * In its own file so `NodeResize.tsx` exports only a component, which is what
 * fast refresh needs to swap it without reloading the page.
 */
export function useSized(id: string): boolean {
  return useInternalNode(id)?.style?.width !== undefined;
}
