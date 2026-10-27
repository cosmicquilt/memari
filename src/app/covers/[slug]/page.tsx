// One cover's own address (/covers/onyx-4): the covers page, opened on it.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { COVERS, coverBySlug } from "../catalogue";
import { CoversPage } from "../CoversPage";

export function generateStaticParams() {
  return COVERS.map((cover) => ({ slug: cover.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const cover = coverBySlug((await params).slug);
  return cover
    ? { title: `${cover.name} cover - memari. STUDIO`, description: `The ${cover.name} cover, ${cover.material.toLowerCase()} with ${cover.mark}, shown on a real notebook.` }
    : {};
}

export default async function Cover({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!coverBySlug(slug)) notFound();
  return <CoversPage />;
}
