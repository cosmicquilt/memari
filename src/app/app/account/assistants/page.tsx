// AI assistant: how to connect a person's own Claude to Memari (2026-11-02;
// the connector is src/lib/connector). Claude's custom connectors work by web
// address on every plan with no review, so this page is all it takes. ChatGPT
// needs a directory listing first, so it isn't offered yet.

import { requireAccountOwner } from "../requireOwner";
import { signInPath } from "@/lib/owner";
import { CopyAddress } from "./CopyAddress";

/** Exact: Claude matches it against what the server says its address is. */
const ADDRESS = "https://memari.studio/mcp";
const LINK = { color: "#8fa0ff" };

export default async function AssistantsPage() {
  const owner = await requireAccountOwner("/app/account/assistants");
  return (
    <>
      <h1>AI assistant</h1>
      <p>
        Connect your own Claude and you can build and change your journals by asking: &ldquo;Make me a planner for my first term at college&rdquo;,
        &ldquo;Add a gratitude prompt to every day&rdquo;, &ldquo;Start my schedule at 6&rdquo;. Your Claude plan pays for the chat, so it costs nothing here.
      </p>

      {owner.guest ? (
        <div className="acct-card">
          <p>Connecting needs an account, so Claude has journals of yours to work on. Whatever you made as a guest comes with you.</p>
          <div>
            <a className="acct-btn acct-primary" href={signInPath("/app/account/assistants")}>
              Sign in
            </a>
          </div>
        </div>
      ) : (
        <div className="acct-card">
          <h2>Connect Claude</h2>
          <CopyAddress address={ADDRESS} />
          <ol style={{ margin: 0, paddingLeft: 20, listStyle: "decimal", display: "grid", gap: 6, lineHeight: 1.5 }}>
            <li>
              In Claude, open{" "}
              <a href="https://claude.ai/customize/connectors" target="_blank" rel="noreferrer" style={LINK}>
                Customize, then Connectors
              </a>
              .
            </li>
            <li>Choose Add custom connector, and paste the address above.</li>
            <li>Press Connect, sign in to Memari with this account, and allow it.</li>
            <li>In a chat, turn it on from the + menu under Connectors, then ask for what you want.</li>
          </ol>
          <p className="acct-dim">Claude&rsquo;s free plan has room for one connector like this.</p>
        </div>
      )}

      <div className="acct-card">
        <h2>What it can do</h2>
        <ul style={{ margin: 0, paddingLeft: 20, listStyle: "disc", display: "grid", gap: 6, lineHeight: 1.5 }}>
          <li>It makes new planners, and adds, moves, resizes and rewrites what&rsquo;s on your pages. It reads your journals, including what you&rsquo;ve written in them, to do that.</li>
          <li>Claude asks before it changes or removes anything, unless you&rsquo;ve told it to always allow that.</li>
          <li>
            You can take it all back. The journal shows what your assistant changed, beside its name, with a button to undo it. On a coaching template, that&rsquo;s until
            clients are on it: their journals follow it then, so you change things back by hand.
          </li>
          <li>It can&rsquo;t order or pay for anything. Books are ordered here, and a book already printed never changes.</li>
          <li>
            It reaches your own journals, and a coaching business&rsquo;s templates while no client is on them. A template with clients it can only copy, into a new one with
            none, and you move clients onto that under Templates. Clients&rsquo; journals stay out of it.
          </li>
        </ul>
        <p className="acct-dim">
          What Claude reads goes to Anthropic under your Claude account&rsquo;s terms. <a href="/privacy" style={LINK}>Privacy</a> says more. To disconnect, remove it from the same Connectors page.
        </p>
      </div>
    </>
  );
}
