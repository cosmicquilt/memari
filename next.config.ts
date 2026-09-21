import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The planner's own typeface has to reach the server bundle.
  //
  // /planner/export reads assets/fonts/Newsreader.ttf off disk at request
  // time (see plannerPdf.ts on why it is committed rather than fetched).
  // If a deployed build shipped without it the export would still succeed,
  // silently set in Times - a different product on paper, and the kind of
  // failure nobody finds until it has been printed.
  //
  // MEASURED, because the first version of this comment claimed the tracer
  // could not find the file on its own and that was wrong: building with
  // this block removed still traces Newsreader.ttf into the route. Next's
  // tracer constant-folds the path in `readFileSync(path.join(cwd(), K))`
  // when K is a module-level string, which is exactly how plannerPdf.ts
  // writes it. So this is not load-bearing today. It is kept because that
  // guarantee rests on a bundler's static analysis of one expression - move
  // the path into a variable, read it through a helper, and the font
  // silently stops shipping. This states the requirement instead of
  // inferring it, and it also brings OFL.txt along, which the licence says
  // must travel with the font.
  outputFileTracingIncludes: {
    "/app/export": ["./assets/fonts/**"],
  },

  // THE EDITOR IS ONE PAGE AT /app since 2026-09-21 - "make memari.studio/app
  // the location of the editor", and "I dont want site to change while
  // swapping between their monthly weekly layout". Each level used to have
  // its own address; every one of them still works, as a bookmark, a link
  // someone was sent or a tab left open, and lands on the editor. Which
  // layout opens is the editor's own memory - see openLevelCookie.ts.
  // /planner itself is the legacy Polotno editor and stays where it is.
  async redirects() {
    return [
      ...["next", "month", "day", "beginning", "ending"].map((old) => ({
        source: `/planner/${old}`,
        destination: "/app",
        permanent: true,
      })),
      { source: "/planner/export", destination: "/app/export", permanent: true },
    ];
  },
};

export default nextConfig;
