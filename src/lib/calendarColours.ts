// The colours a calendar can be, in one place.
//
// They lived in calendarStore.ts, which reads the database and so cannot be
// imported into a component - and were copied, by hand, into the two
// components that needed them (the Calendars panel and the event popup). A
// third reader arrived with the drag preview, which has to draw a new event in
// the colour it will be saved in; three hand copies of a list is how one of
// them ends up a shade off. So the list is here, pure, and everyone imports it.

/** What a new calendar is drawn in until someone changes it. Screen only -
 *  print takes grey, decided 2026-09-26, because colour pages cost money. */
export const DEFAULT_CALENDAR_COLOUR = "#cfe3ff";

/** The colours the editor offers. Light enough that 5pt text darkened to a
 *  4.5:1 contrast off them is still recognisably the same hue - see eventInk
 *  in hourlyGridCore.ts, which is what actually does the darkening. */
export const CALENDAR_COLOURS = [
  "#cfe3ff", // blue
  "#ffe9b3", // amber
  "#d6f0d8", // green
  "#f7d6e0", // pink
  "#e4dcf7", // violet
  "#ffd9c2", // orange
] as const;
