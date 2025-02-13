import MediaPage from "./MediaPage";

export default function Page({ params }: { params: { id: string } }) {
  return <MediaPage params={params} />;
}
