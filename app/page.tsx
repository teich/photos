import { getMediaSections } from "@/lib/media";
import HomePage from "./HomePage";

export default async function Page() {
  const sections = await getMediaSections();
  const allItems = sections.flatMap(section => section.items);
  const validItems = allItems.filter(item => item.dimensions?.aspectRatio);

  return <HomePage initialItems={validItems} />;
}
