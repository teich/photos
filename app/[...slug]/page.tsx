import { getMediaItemById, getAllMediaItems } from "@/lib/media";
import { Lightbox } from "@/app/components/Lightbox";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

const ITEMS_PER_PAGE = 50; // Limit number of items loaded at once

export default async function Page(props: PageProps) {
  const params = await props.params;
  const id = params.slug.join('/');
  const item = await getMediaItemById(id);

  if (!item) {
    notFound();
  }

  // Get all items but limit the number loaded
  const allItems = await getAllMediaItems();

  // Find the current item's index
  const currentIndex = allItems.findIndex(i => i.id === id);

  // Calculate the start and end indices for the paginated subset
  const startIndex = Math.max(0, currentIndex - Math.floor(ITEMS_PER_PAGE / 2));
  const endIndex = Math.min(allItems.length, startIndex + ITEMS_PER_PAGE);

  // Get the paginated subset of items
  const paginatedItems = allItems.slice(startIndex, endIndex);

  return <Lightbox item={item} allItems={paginatedItems} />;
}
