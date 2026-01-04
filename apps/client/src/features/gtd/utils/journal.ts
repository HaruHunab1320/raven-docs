import { createPage } from "@/features/page/services/page-service";
import { searchPage } from "@/features/search/services/search-service";

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getJournalTitle(date = new Date()) {
  return `Journal - ${formatDateKey(date)}`;
}

export async function getOrCreateJournalPage(params: {
  spaceId: string;
  date?: Date;
}) {
  const title = getJournalTitle(params.date);
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
            text: "Capture reflections, observations, and ideas for today.",
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
