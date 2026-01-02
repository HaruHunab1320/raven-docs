import { Container } from "@mantine/core";
import SpaceHomeTabs from "@/features/space/components/space-home-tabs.tsx";
import { useParams } from "react-router-dom";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
import { getAppName } from "@/lib/config.ts";
import { Helmet } from "react-helmet-async";
import { Error404 } from "@/components/ui/error-404.tsx";
import { useTranslation } from "react-i18next";

export default function SpaceHome() {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const {
    data: space,
    isLoading,
    isError,
    error,
  } = useGetSpaceBySlugQuery(spaceSlug);

  // Handle loading state
  if (isLoading) {
    return <></>;
  }

  // Handle error state or no space data
  if (isError || !space) {
    console.error("Error loading space:", error);
    return <Error404 />;
  }

  return (
    <>
      <Helmet>
        <title>
          {space.name || "Overview"} - {getAppName()}
        </title>
      </Helmet>
      <Container size={"800"} pt="xl">
        <SpaceHomeTabs />
      </Container>
    </>
  );
}
