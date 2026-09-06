import { useLayoutEffect, useRef } from "react";
import { courseMotionDelta } from "./course-board-model.js";

// FLIP only the course cards. Never capture or fade the viewport/backdrop.
export function useCourseCardMotion(rootRef, signature) {
  const positions = useRef(new Map());
  const animations = useRef(new Map());
  useLayoutEffect(() => {
    const next = new Map();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const node of rootRef.current?.querySelectorAll("[data-course-motion-key]") || []) {
      const key = node.dataset.courseMotionKey;
      const active = animations.current.get(key);
      const inFlight = active ? node.getBoundingClientRect() : null;
      active?.cancel();
      const rect = node.getBoundingClientRect();
      const location = { x: rect.left + window.scrollX, y: rect.top + window.scrollY };
      const from = inFlight ? { x: inFlight.left + window.scrollX, y: inFlight.top + window.scrollY } : positions.current.get(key);
      next.set(key, location);
      const delta = courseMotionDelta(from, location);
      if (!reduced && delta && node.animate) {
        const animation = node.animate([{ translate: `${delta.x}px ${delta.y}px` }, { translate: "0px 0px" }], { duration: 320, easing: "cubic-bezier(.16, 1, .3, 1)" });
        animations.current.set(key, animation);
        animation.onfinish = () => { if (animations.current.get(key) === animation) animations.current.delete(key); };
      }
    }
    for (const [key, animation] of animations.current) if (!next.has(key)) { animation.cancel(); animations.current.delete(key); }
    positions.current = next;
  }, [rootRef, signature]);
  useLayoutEffect(() => () => { for (const animation of animations.current.values()) animation.cancel(); }, []);
}
