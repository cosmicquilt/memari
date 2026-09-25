// The landing page's face (Andrew, 2026-09-25: "change the font of the
// landing page to apple font or the most similar"). Apple's own - San
// Francisco - is only licensed for Apple's platforms, so the page asks for
// the system's face (SF on a Mac, iPhone or iPad) and falls back to Inter,
// the open face closest to it, everywhere else.

import { Inter } from "next/font/google";

export const sans = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

/** The stack: San Francisco where the system has it, Inter otherwise. */
export const SANS_STACK = `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", var(--font-inter), system-ui, sans-serif`;
