"use client";

import { MediaItem } from "@/lib/media";
import { Gallery } from "./components/Gallery";

interface HomePageProps {
  initialItems: MediaItem[];
}

export default function HomePage({ initialItems }: HomePageProps) {
  return (
    <div className="min-h-screen">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Gallery items={initialItems} />
      </main>
    </div>
  );
}
