import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader, Hanken_Grotesk, Almarai } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { VIEWPORT_GUARD_SCRIPT } from "@/lib/viewportCookie";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Every module renderer (todoChecklist.ts, habitTracker.ts,
// labeledBox.ts, weekTitle.ts, monthTitle.ts, monthGridCore.ts,
// hourlyGridCore.ts) already references `fontFamily: "Newsreader"`
// directly in its own rendered element data — that was never actually
// wrong, just incomplete: nothing in the app had ever loaded Newsreader
// itself, so every one of those references silently fell back to
// whatever generic serif/sans the browser defaults to instead.
// Reported directly: "can you use pt serif it doesn't look like it
// right now. use it everywhere Dec-Jan too in top left" — weekTitle.ts's
// own date-range label ("DEC 31 - JAN 6") already used the same
// FONT_FAMILY constant as everything else, confirming this was one
// single root cause (the font was never registered at all), not a
// per-module inconsistency. Loading it here, the same way
// geistSans/geistMono already are, registers the real @font-face for
// the whole app — every renderer's own existing "Newsreader" reference
// then resolves correctly with no changes needed in any of them.
// weight: ["400"] only — grepped every module renderer for fontWeight
// first (none set one; everything renders at the family's own default
// weight), so there's no unused heavier weight to load.
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400"],
});

// Sans-serif alternative for the Page Settings font switch — closest free
// Google Font to "Altivo Light" (a commercial geometric sans): wide
// letterforms, generous x-height, subtle ink traps for small-size
// legibility, loaded at its own Light (300) weight to match. See
// src/lib/theme.ts for how module renderers resolve which one to use.
const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
  weight: ["300"],
});

// THE APP'S OWN FONT - the chrome, and only the chrome.
//
// Everything on the canvas names its family explicitly in its element data
// (Newsreader, or Hanken Grotesk when a planner is set to sans - see
// src/lib/theme.ts), because those families are what gets EMBEDDED IN THE PDF
// and has to match what prints. Nothing there inherits from the page, so
// changing the interface font cannot reach a module, a preview or an export.
//
// Weights 300/400/700/800 are all Almarai has. The chrome asks for 600 in
// nine places; CSS resolves a missing 600 upward, so those render at 700 and
// read a little bolder than they did. That is the whole visible cost of the
// switch, and it is worth knowing rather than discovering.
const almarai = Almarai({
  variable: "--font-almarai",
  subsets: ["latin"],
  weight: ["300", "400", "700", "800"],
});

export const metadata: Metadata = {
  title: "Memari Studio",
  description: "Build and print your own planner.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // signInUrl: Clerk's own redirects to sign in (an expired session, say)
    // land on our page, which offers "Continue as guest", not Clerk's hosted one.
    <ClerkProvider signInUrl="/sign-in">
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} ${hankenGrotesk.variable} ${almarai.variable} h-full antialiased`}
        // VIEWPORT_GUARD_SCRIPT may set an attribute here before React
        // hydrates. Suppresses the warning for this one element only.
        suppressHydrationWarning
      >
        <head>
          {/* Before anything paints: was this page rendered for this
              window's size? See src/lib/viewportCookie.ts. */}
          <script dangerouslySetInnerHTML={{ __html: VIEWPORT_GUARD_SCRIPT }} />
        </head>
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
