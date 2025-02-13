import { getMediaSections } from "@/lib/media";
import { Gallery } from "./components/Gallery";

export default async function Page() {
  const sections = await getMediaSections();
  const items = sections.flatMap(section => section.items);

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Gallery items={items} />
    </main>
  );
}
