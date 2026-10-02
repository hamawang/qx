import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type UIEvent,
} from "react";
import { ArrowDown } from "lucide-react";
import { Button } from "../../components/ui";

const BOTTOM_THRESHOLD_PX = 28;
const MAX_REMEMBERED_CONVERSATIONS = 32;

interface ConversationScrollMemory {
  following: boolean;
  scrollTop: number;
}

const conversationScrollMemory = new Map<string, ConversationScrollMemory>();

export function qxAiScrollDistanceFromBottom(
  element: Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">,
) {
  return Math.max(0, element.scrollHeight - element.clientHeight - element.scrollTop);
}

function rememberConversationScroll(conversationId: string, memory: ConversationScrollMemory) {
  conversationScrollMemory.delete(conversationId);
  conversationScrollMemory.set(conversationId, memory);
  while (conversationScrollMemory.size > MAX_REMEMBERED_CONVERSATIONS) {
    const oldest = conversationScrollMemory.keys().next().value;
    if (typeof oldest !== "string") break;
    conversationScrollMemory.delete(oldest);
  }
}

interface UseQxAiConversationScrollOptions {
  conversationId?: string;
  /** Changes whenever transcript height may have changed. */
  revision: string;
}

/**
 * Keeps live output pinned only while the reader is already at the bottom.
 * Each conversation remembers a detached reading position for the current app
 * session, so switching chats does not throw the reader back to the latest turn.
 */
export function useQxAiConversationScroll({
  conversationId,
  revision,
}: UseQxAiConversationScrollOptions) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const followingRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const cancelScheduledScroll = useCallback(() => {
    if (frameRef.current === null) return;
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const commitPosition = useCallback((element: HTMLDivElement) => {
    const following = qxAiScrollDistanceFromBottom(element) <= BOTTOM_THRESHOLD_PX;
    followingRef.current = following;
    setShowJumpToLatest((visible) => {
      const next = !following;
      return visible === next ? visible : next;
    });
    if (conversationId) {
      rememberConversationScroll(conversationId, {
        following,
        scrollTop: element.scrollTop,
      });
    }
  }, [conversationId]);

  const scrollToLatest = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    cancelScheduledScroll();
    followingRef.current = true;
    setShowJumpToLatest(false);
    viewport.scrollTop = viewport.scrollHeight;
    if (conversationId) {
      rememberConversationScroll(conversationId, {
        following: true,
        scrollTop: viewport.scrollTop,
      });
    }
  }, [cancelScheduledScroll, conversationId]);

  const scheduleScrollToLatest = useCallback(() => {
    if (!followingRef.current) return;
    cancelScheduledScroll();
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      if (!followingRef.current) return;
      scrollToLatest();
    });
  }, [cancelScheduledScroll, scrollToLatest]);

  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    commitPosition(event.currentTarget);
  }, [commitPosition]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    cancelScheduledScroll();
    const remembered = conversationId ? conversationScrollMemory.get(conversationId) : undefined;
    followingRef.current = remembered?.following ?? true;
    setShowJumpToLatest(remembered?.following === false);
    if (remembered?.following === false) {
      viewport.scrollTop = Math.min(
        remembered.scrollTop,
        Math.max(0, viewport.scrollHeight - viewport.clientHeight),
      );
      commitPosition(viewport);
      return;
    }
    scrollToLatest();
  }, [cancelScheduledScroll, commitPosition, conversationId, scrollToLatest]);

  useLayoutEffect(() => {
    scheduleScrollToLatest();
  }, [revision, scheduleScrollToLatest]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => scheduleScrollToLatest());
    observer.observe(content);
    return () => observer.disconnect();
  }, [scheduleScrollToLatest]);

  useEffect(() => () => cancelScheduledScroll(), [cancelScheduledScroll]);

  return {
    contentRef,
    onScroll,
    scrollToLatest,
    showJumpToLatest,
    viewportRef,
  };
}

export function QxAiScrollToLatestButton({
  label,
  onClick,
  visible,
}: {
  label: string;
  onClick: () => void;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      className="qx-ai-scroll-to-latest"
      title={label}
      aria-label={label}
      data-qx-ai="scroll-to-latest"
      onClick={onClick}
    >
      <ArrowDown size={15} strokeWidth={2} aria-hidden="true" />
    </Button>
  );
}
