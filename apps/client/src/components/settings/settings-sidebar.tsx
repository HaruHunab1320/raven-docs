import React, { useEffect, useState } from "react";
import { Group, Text, ScrollArea, ActionIcon } from "@mantine/core";
import {
  IconUser,
  IconSettings,
  IconUsers,
  IconArrowLeft,
  IconUsersGroup,
  IconSpaces,
  IconBrush,
  IconApi,
  IconChartDots,
  IconRobot,
  IconBug,
} from "@tabler/icons-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import classes from "./settings.module.css";
import { useTranslation } from "react-i18next";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useAtom } from "jotai/index";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import {
  prefetchGroups,
  prefetchSpaces,
  prefetchWorkspaceMembers,
} from "@/components/settings/settings-queries.tsx";
import AppVersion from "@/components/settings/app-version.tsx";

interface SubItem {
  label: string;
  hash: string;
}

interface DataItem {
  label: string;
  icon: React.ElementType;
  path: string;
  isAdmin?: boolean;
  subItems?: SubItem[];
}

interface DataGroup {
  heading: string;
  items: DataItem[];
}

const groupedData: DataGroup[] = [
  {
    heading: "Account",
    items: [
      { label: "Profile", icon: IconUser, path: "/settings/account/profile" },
      {
        label: "Preferences",
        icon: IconBrush,
        path: "/settings/account/preferences",
      },
    ],
  },
  {
    heading: "Workspace",
    items: [
      {
        label: "General",
        icon: IconSettings,
        path: "/settings/workspace",
        subItems: [
          { label: "Name", hash: "name" },
          { label: "Agent", hash: "agent" },
          { label: "Knowledge", hash: "knowledge" },
          { label: "GitHub", hash: "github" },
          { label: "Repository Tokens", hash: "repo-tokens" },
          { label: "Chat Integrations", hash: "chat-integrations" },
        ],
      },
      {
        label: "Members",
        icon: IconUsers,
        path: "/settings/members",
      },
      {
        label: "People Insights",
        icon: IconChartDots,
        path: "/settings/people-insights",
        isAdmin: true,
      },
      { label: "Groups", icon: IconUsersGroup, path: "/settings/groups" },
      { label: "Spaces", icon: IconSpaces, path: "/settings/spaces" },
      {
        label: "API Keys",
        icon: IconApi,
        path: "/settings/api-keys",
        isAdmin: true,
      },
      {
        label: "Agents",
        icon: IconRobot,
        path: "/settings/agents",
        isAdmin: true,
      },
    ],
  },
  {
    heading: "Developers",
    items: [
      {
        label: "Bug Reports",
        icon: IconBug,
        path: "/settings/bug-reports",
        isAdmin: true,
      },
    ],
  },
];

export default function SettingsSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const [active, setActive] = useState(location.pathname);
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const [workspace] = useAtom(workspaceAtom);

  useEffect(() => {
    setActive(location.pathname);
  }, [location.pathname]);

  const canShowItem = (item: DataItem) => {
    if (item.isAdmin) {
      return isAdmin;
    }

    return true;
  };

  const menuItems = groupedData.map((group) => {
    if (group.heading === "Workspace" && !workspace?.id) {
      return null;
    }
    return (
      <div key={group.heading}>
        <Text c="dimmed" className={classes.linkHeader}>
          {t(group.heading)}
        </Text>
        {group.items.map((item) => {
          if (!canShowItem(item)) {
            return null;
          }

          let prefetchHandler: any;
          switch (item.label) {
            case "Members":
              prefetchHandler = prefetchWorkspaceMembers;
              break;
            case "Spaces":
              prefetchHandler = prefetchSpaces;
              break;
            case "Groups":
              prefetchHandler = prefetchGroups;
              break;
            default:
              break;
          }

          const isActive = active.startsWith(item.path);
          const activeHash = location.hash?.replace("#", "");

          return (
            <React.Fragment key={item.label}>
              <Link
                onMouseEnter={prefetchHandler}
                className={classes.link}
                data-active={isActive || undefined}
                to={item.path}
              >
                <item.icon className={classes.linkIcon} stroke={2} />
                <span>{t(item.label)}</span>
              </Link>
              {isActive && item.subItems && (
                <>
                  {item.subItems.map((subItem) => (
                    <Link
                      key={subItem.hash}
                      className={classes.subLink}
                      data-active={activeHash === subItem.hash || undefined}
                      to={`${item.path}#${subItem.hash}`}
                      onClick={() => {
                        const element = document.getElementById(subItem.hash);
                        element?.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      <span>{t(subItem.label)}</span>
                    </Link>
                  ))}
                </>
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  });

  return (
    <div className={classes.navbar}>
      <Group className={classes.title} justify="flex-start">
        <ActionIcon
          onClick={() => navigate(-1)}
          variant="transparent"
          c="gray"
          aria-label="Back"
        >
          <IconArrowLeft stroke={2} />
        </ActionIcon>
        <Text fw={500}>{t("Settings")}</Text>
      </Group>

      <ScrollArea w="100%">{menuItems}</ScrollArea>

      <AppVersion />
    </div>
  );
}
