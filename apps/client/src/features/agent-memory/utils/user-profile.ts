import { createPage } from "@/features/page/services/page-service";
import { searchPage } from "@/features/search/services/search-service";

export async function getOrCreateUserProfilePage(params: {
  spaceId: string;
  userName?: string;
}) {
  const titleSuffix = params.userName ? ` - ${params.userName}` : "";
  const title = `User Profile${titleSuffix}`;
  const matches = await searchPage({
    query: title,
    spaceId: params.spaceId,
  });
  const existing = matches.find((page) => page.title?.trim() === title);
  if (existing) {
    return existing;
  }

  const content = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: title }],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Profile insights will appear here after the next distillation run.",
          },
        ],
      },
    ],
  };

  return createPage({
    title,
    spaceId: params.spaceId,
    content: JSON.stringify(content),
  });
}
