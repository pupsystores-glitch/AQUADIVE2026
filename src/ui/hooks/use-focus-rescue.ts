// Focus rescue — keeps keyboard focus inside a scope when the focused control
// is disabled or removed under it (Sprint 4 QA fix, 2026-11-14).
//
// The betting controls disable themselves as the round moves on: PLACE BET
// becomes BET LOCKED, CASH OUT becomes SECURED or WAITING…, the steppers and
// the amount field lock for the dive, and a picked chest disables the chest
// row. A browser drops focus to <body> when the focused element is disabled,
// so a keyboard user was thrown back to the top of the page after every bet.
// This hook moves focus to the scope element instead (a slot panel or the
// chest picker, given tabIndex={-1} and `data-focus-scope`), so the next Tab
// continues inside it.
//
// One MutationObserver per scope watches `disabled` changes and removals in
// its subtree; focus tracking is the scope's own focusin/focusout. The hook
// never moves focus that the user has already moved elsewhere, and it reads no
// store: the components keep their per-slice subscriptions (V3).

import { useEffect, type RefObject } from "react";

/** The attribute that marks an element as a focus-rescue scope. */
export const FOCUS_SCOPE_ATTR = "data-focus-scope";

const isDisabled = (el: Element): boolean =>
  (el as HTMLButtonElement | HTMLInputElement).disabled === true;

/**
 * Watch `scope` while `enabled` (pass the scope's visibility when it renders
 * conditionally, so the observer attaches once the element exists).
 */
export function useFocusRescue(scope: RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    const root = scope.current;
    if (!enabled || !root) return;
    const doc = root.ownerDocument;
    /** The control inside the scope that last held focus and has not given it up deliberately. */
    let held: Element | null = null;

    const onFocusIn = (e: FocusEvent) => {
      held = e.target as Element;
    };
    const onFocusOut = (e: FocusEvent) => {
      const target = e.target as Element;
      // A blur caused by the control's own disabling or removal keeps the
      // claim (some browsers blur synchronously); any other blur releases it.
      if (target === held && !isDisabled(target) && target.isConnected) held = null;
    };

    const rescue = () => {
      if (held === null || held === root) return;
      if (held.isConnected && !isDisabled(held)) return;
      const active = doc.activeElement;
      // Only take focus back from the lost control or from the page body —
      // never from an element the user moved to.
      if (active === held || active === null || active === doc.body) {
        held = null;
        root.focus({ preventScroll: true });
      }
    };

    const observer = new MutationObserver(rescue);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled"],
    });
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);
    return () => {
      observer.disconnect();
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
    };
  }, [scope, enabled]);
}

/** Whether focus is "parked": nowhere, on the body, on a rescue scope, or on a disabled control. */
export function isFocusParked(doc: Document): boolean {
  const active = doc.activeElement;
  return (
    active === null ||
    active === doc.body ||
    active.hasAttribute(FOCUS_SCOPE_ATTR) ||
    isDisabled(active)
  );
}
