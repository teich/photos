import { getMediaItemById, getAllMediaItems } from "@/lib/media";
import { Lightbox } from "@/app/components/Lightbox";
import { notFound } from "next/navigation";

interface MediaPageProps {
  params: { id: string };
}

export default async function MediaPage({ params }: MediaPageProps) {
  const [item, allItems] = await Promise.all([
    getMediaItemById(params.id),
    getAllMediaItems()
  ]);
  
  if (!item) {
    notFound();
  }

  return <Lightbox item={item} allItems={allItems} />;
}
