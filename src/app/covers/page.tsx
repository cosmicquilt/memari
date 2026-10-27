import type { Metadata } from "next";
import { CoversPage } from "./CoversPage";

export const metadata: Metadata = {
  title: "Covers - memari. STUDIO",
  description: "Covers in stone, wood, cloth and more, each shown on a real notebook.",
};

export default function Covers() {
  return <CoversPage />;
}
