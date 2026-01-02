import { useParams } from "react-router-dom";
import { useSpaceQuery } from "../queries/space-query";
import { ISpace } from "../types/space.types";
import { UseQueryResult } from "@tanstack/react-query";

/**
 * Hook to get the current space based on the URL parameter
 */
export function useCurrentSpace(): UseQueryResult<ISpace, Error> {
  const { spaceId } = useParams<{ spaceId: string }>();
  return useSpaceQuery(spaceId || "");
}
