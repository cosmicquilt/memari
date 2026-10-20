// FOLLOWING A PARCEL: EasyPost's Trackers API (docs.easypost.com/docs/trackers).
// Server-only.
//
// Neither Lulu nor BookVault says when a book is delivered; they stop at
// "shipped" and a tracking link. A tracker reads the carrier's own scans, so
// delivery.ts can tell a parcel that is moving from one that never left -
// what happened to a BookVault seller's US orders in 2024, when its
// consolidator stopped handing them to USPS and nobody noticed for weeks.
//
// Two calls: make a tracker from a tracking number (the carrier is optional;
// EasyPost reads it from the number when not given), and read it back. Read
// once a day by the cron rather than pushed by webhook: a day is fine-grained
// enough for "no scan in four days", and there is no webhook to secure.
//
// The key is Andrew's (EASYPOST_API_KEY where the site runs), sent as the
// username of basic auth. Without it nothing here runs and delivery.ts asks
// the customer alone. A test key (EZTK...) answers made-up numbers -
// EZ1000000001 pre_transit up to EZ7000000007 unknown - with canned trackers.

const BASE = "https://api.easypost.com/v2";

export function easyPostConfigured(): boolean {
  return !!process.env.EASYPOST_API_KEY;
}

export class EasyPostError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
  }
}

/** A tracker's status: where the parcel is, by the carrier's last scan. */
export type TrackerStatus =
  | "unknown"
  | "pre_transit"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "available_for_pickup"
  | "return_to_sender"
  | "failure"
  | "cancelled"
  | "error";

export type TrackingDetail = { datetime?: string; status?: TrackerStatus; status_detail?: string; message?: string };

export type Tracker = {
  id: string;
  status: TrackerStatus;
  status_detail?: string;
  carrier?: string;
  public_url?: string;
  est_delivery_date?: string | null;
  tracking_details?: TrackingDetail[];
};

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const key = process.env.EASYPOST_API_KEY;
  if (!key) throw new EasyPostError("EasyPost's API key is not set (EASYPOST_API_KEY).", 0, "");
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new EasyPostError(`EasyPost answered ${response.status} to ${method} ${path}.`, response.status, text.slice(0, 500));
  return JSON.parse(text) as T;
}

/** The carriers EasyPost names this way, as printers may write them. Any
 *  other is left out and EasyPost reads the carrier from the number. */
const CARRIERS: Record<string, string> = { usps: "USPS", ups: "UPS", fedex: "FedEx", dhl: "DHLExpress", "dhl express": "DHLExpress", "royal mail": "RoyalMail", "canada post": "CanadaPost" };

export function easyPostCarrier(name: string | null | undefined): string | undefined {
  return name ? CARRIERS[name.trim().toLowerCase()] : undefined;
}

export async function createTracker(trackingCode: string, carrier?: string | null): Promise<Tracker> {
  const named = easyPostCarrier(carrier);
  return call<Tracker>("POST", "/trackers", { tracker: { tracking_code: trackingCode, ...(named ? { carrier: named } : {}) } });
}

export async function getTracker(id: string): Promise<Tracker> {
  return call<Tracker>("GET", `/trackers/${encodeURIComponent(id)}`);
}
