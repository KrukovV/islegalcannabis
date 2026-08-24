import NewMapPage from "./new-map/page";

export default async function HomePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <>
      <link rel="canonical" href="https://www.islegal.info/" />
      {await NewMapPage({ searchParams })}
    </>
  );
}
