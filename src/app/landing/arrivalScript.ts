// THE CURTAIN LIFTED BEFORE THE PAGE'S SCRIPT HAS STARTED (2026-11-04: on
// Andrew's iPhone the page "take[s] a long time to load"). SiteArrival is a
// React part: it could only lift the curtain once the page was hydrated, and
// on a phone that is long after its pictures have come. This runs in the
// head of every page as it loads (layout.tsx, beside the viewport guard),
// needs nothing of React, and does the same looking SiteArrival does:
//
// once the HTML is in, if the page has a curtain ([data-curtain]), it waits
// for the pictures on the first screen (<img> and SVG <image> laid out
// there), the paper's photos (url()s in the page's own style), the curtain's
// data-pictures, and the type - then for the doodle wall (the page's
// data-wall-ready, which BodyDoodles sets) for at most GRACE ms more - and
// lifts the curtain by data-site-arrived on <html>. React never draws <html>'s
// attributes (it is suppressHydrationWarning), so this can happen before
// hydration without a mismatch. SiteArrival follows it.
//
// Never later than LONGEST ms from the page's start. A page reached by a
// click inside the site does not run this (it is not loaded again):
// SiteArrival lifts that one itself.
//
// check:arrival sets __arrivalLongestMs and __arrivalWallGraceMs before this
// runs, to see what it waits for rather than how fast the machine is.

/** ms from the page's start: the longest the curtain stays. In step with
 *  .curtain's CSS fallback and SiteArrival. */
export const ARRIVAL_LONGEST_MS = 2500;

/** ms the curtain still waits for the doodle wall once all else is in. */
export const ARRIVAL_WALL_GRACE_MS = 500;

export const ARRIVAL_SCRIPT = `(function () {
  var d = document.documentElement, w = window;
  var longest = w.__arrivalLongestMs || ${ARRIVAL_LONGEST_MS};
  var grace = w.__arrivalWallGraceMs != null ? w.__arrivalWallGraceMs : ${ARRIVAL_WALL_GRACE_MS};
  var done = false;
  function lift() {
    if (done) return;
    done = true;
    d.setAttribute("data-site-arrived", "");
  }
  setTimeout(lift, Math.max(0, longest - performance.now()));
  function start() {
    var curtain = document.querySelector("[data-curtain]");
    if (!curtain) { done = true; return; }
    var page = curtain.parentElement, bottom = innerHeight * 1.25, wait = [];
    function inView(e) {
      var r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top < bottom && r.bottom > 0 && r.left < innerWidth && r.right > 0;
    }
    function picture(src) {
      var i = new Image();
      i.src = src;
      return i.decode().catch(function () {});
    }
    document.querySelectorAll("img:not([data-arrival-skip])").forEach(function (i) {
      if (!inView(i)) return;
      if (i.loading === "lazy") i.loading = "eager";
      wait.push(i.decode().catch(function () {}));
    });
    document.querySelectorAll("image").forEach(function (i) {
      var src = i.href && i.href.baseVal;
      if (src && inView(i)) wait.push(picture(src));
    });
    var style = page.getAttribute("style") || "", re = /url\\(\\s*["']?([^"')]+)["']?\\s*\\)/g, m;
    while ((m = re.exec(style))) wait.push(picture(m[1]));
    (curtain.getAttribute("data-pictures") || "").split(" ").forEach(function (src) { if (src) wait.push(picture(src)); });
    if (document.fonts) wait.push(document.fonts.ready);
    Promise.all(wait).then(function () {
      var timer = setTimeout(go, grace), watching = null;
      function go() {
        clearTimeout(timer);
        if (watching) watching.disconnect();
        requestAnimationFrame(function () { requestAnimationFrame(lift); });
      }
      if (page.hasAttribute("data-wall-ready")) return go();
      watching = new MutationObserver(function () { if (page.hasAttribute("data-wall-ready")) go(); });
      watching.observe(page, { attributes: true, attributeFilter: ["data-wall-ready"] });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();`;
