import { ActionIcon, Group, Text, Tooltip } from "@mantine/core";
import { spotlight } from "@mantine/spotlight";
import { IconPlus, IconX } from "@tabler/icons-react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePageTabs } from "@/features/page/hooks/use-page-tabs";
import classes from "./page-tabs-bar.module.css";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { extractPageSlugId } from "@/lib";

// Extract the page slug portion from a path/URL
const getPageSlugFromPath = (path: string): string | null => {
  const match = path.match(/\/p\/([^/?#]+)/);
  return match?.[1] || null;
};

export function PageTabsBar() {
  const { t } = useTranslation();
  const { tabs, closeTab, clearTabs } = usePageTabs();
  const location = useLocation();
  const navigate = useNavigate();
  const barRef = useRef<HTMLDivElement | null>(null);

  // Extract slugId from current URL - this is what we compare against tab URLs
  // Tab stores page.id (UUID), but URL contains slugId, so we compare slugIds from both URLs
  const currentPageSlug = getPageSlugFromPath(location.pathname);
  const currentSlugId = currentPageSlug ? extractPageSlugId(currentPageSlug) : null;

  useEffect(() => {
    const height = barRef.current?.offsetHeight || 0;
    document.documentElement.style.setProperty(
      "--page-tabs-height",
      `${height}px`
    );

    return () => {
      document.documentElement.style.setProperty("--page-tabs-height", "0px");
    };
  }, [tabs.length]);

  if (!tabs.length) {
    return null;
  }

  const resolveFallback = () => {
    const pathname = location.pathname;
    const pageMatch = pathname.match(/^\/s\/([^/]+)\/p\//);
    if (pageMatch) {
      return `/s/${pageMatch[1]}/home`;
    }

    const spaceProjectsMatch = pathname.match(/^\/s\/([^/]+)\/projects/);
    if (spaceProjectsMatch) {
      return `/spaces/${spaceProjectsMatch[1]}/inbox`;
    }

    const spaceIdMatch = pathname.match(/^\/spaces\/([^/]+)/);
    if (spaceIdMatch) {
      return `/spaces/${spaceIdMatch[1]}/inbox`;
    }

    return "/dashboard";
  };
  const handleClearTabs = () => {
    clearTabs();
    navigate(resolveFallback());
  };

  return (
    <div className={classes.tabsBar} ref={barRef}>
      <div className={classes.tabsList}>
        {tabs.map((tab) => {
          const tabPageSlug = getPageSlugFromPath(tab.url);
          const tabSlugId = tabPageSlug ? extractPageSlugId(tabPageSlug) : null;
          const isActive = currentSlugId && currentSlugId === tabSlugId;
          return (
            <div
              key={tab.id}
              className={`${classes.tabItem} ${isActive ? classes.tabItemActive : ""}`}
              onClick={() => navigate(tab.url)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigate(tab.url);
                }
              }}
              role="button"
              tabIndex={0}
            >
              {tab.icon ? <span>{tab.icon}</span> : null}
              <Text size="xs" className={classes.tabTitle}>
                {tab.title || "Untitled"}
              </Text>
              <ActionIcon
                size="xs"
                variant="subtle"
                className={classes.tabClose}
                onClick={(event) => {
                  event.stopPropagation();
                  const remainingTabs = tabs.filter(
                    (item) => item.id !== tab.id
                  );
                  closeTab(tab.id);
                  if (isActive) {
                    const index = tabs.findIndex((item) => item.id === tab.id);
                    const nextTab =
                      remainingTabs[index - 1] || remainingTabs[index] || null;
                    if (nextTab) {
                      navigate(nextTab.url);
                    } else {
                      navigate(resolveFallback());
                    }
                  }
                }}
                aria-label="Close tab"
              >
                <IconX size={12} />
              </ActionIcon>
            </div>
          );
        })}
      </div>
      <Group gap={6} className={classes.tabsActions}>
        <Tooltip label={t("New tab")} withArrow>
          <ActionIcon
            size="sm"
            variant="subtle"
            onClick={() => spotlight.open()}
            aria-label={t("New tab")}
          >
            <IconPlus size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t("Close all tabs")} withArrow>
          <ActionIcon
            size="sm"
            variant="subtle"
            onClick={handleClearTabs}
            aria-label={t("Close all tabs")}
          >
            <IconX size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </div>
  );
}
