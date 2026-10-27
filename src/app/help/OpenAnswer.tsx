"use client";

// Opens the answer an address names - /help#shipping from the footer - and
// any one named later by a link on the same page. The answers are plain
// <details>, closed until asked; without this, the page would scroll to a
// closed question and leave its answer hidden.
//
// A link on this page (the footer's, on /help itself) is a Next <Link>: it
// changes the address with pushState, which fires no "hashchange", so the
// click itself is watched too, in the capture phase - the answer is open
// before Next scrolls to it (review, 2026-10-26).

import { useEffect } from "react";

function openAnswer(id: string, scroll: boolean) {
  const answer = id ? document.getElementById(id) : null;
  if (!(answer instanceof HTMLDetailsElement)) return;
  answer.open = true;
  if (scroll) answer.scrollIntoView({ block: "start" });
}

export function OpenAnswer() {
  useEffect(() => {
    const fromAddress = () => openAnswer(decodeURIComponent(window.location.hash.slice(1)), true);
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.("a[href*='#']");
      if (link instanceof HTMLAnchorElement && link.pathname === window.location.pathname) openAnswer(decodeURIComponent(link.hash.slice(1)), false);
    };
    fromAddress();
    window.addEventListener("hashchange", fromAddress);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("hashchange", fromAddress);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}
