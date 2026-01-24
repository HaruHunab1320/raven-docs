import { ActionIcon, Group, Menu, Stack, Text, Tooltip, useComputedColorScheme } from "@mantine/core";
import classes from "./app-header.module.css";
import React, { useEffect } from "react";
import TopMenu from "@/components/layouts/global/top-menu.tsx";
import { Link, useLocation } from "react-router-dom";
import APP_ROUTE from "@/lib/app-route.ts";
import { useAtom } from "jotai";
import {
  desktopSidebarAtom,
  mobileSidebarAtom,
  agentChatDrawerAtom,
} from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";
import SidebarToggle from "@/components/ui/sidebar-toggle-button.tsx";
import { useTranslation } from "react-i18next";
import { QuickCapture } from "@/features/gtd/components/quick-capture";
import useAuth from "@/features/auth/hooks/use-auth.ts";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom.ts";
import { modals } from "@mantine/modals";
import {
  IconBrush,
  IconHelpCircle,
  IconLayoutSidebarRight,
  IconLogout,
  IconMenu2,
  IconSettings,
  IconUserCircle,
  IconUsers,
} from "@tabler/icons-react";
// import { MCPEventIndicator } from "@/features/websocket/components/mcp-event-indicator.tsx";

const links = [{ link: APP_ROUTE.FILES, label: "Files" }];

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["input", "textarea", "select"].includes(target.tagName.toLowerCase())
  );
}

export function AppHeader() {
  const { t } = useTranslation();
  const location = useLocation();
  const [mobileOpened] = useAtom(mobileSidebarAtom);
  const toggleMobile = useToggleSidebar(mobileSidebarAtom);

  const [desktopOpened] = useAtom(desktopSidebarAtom);
  const toggleDesktop = useToggleSidebar(desktopSidebarAtom);
  const [, setAgentChatOpened] = useAtom(agentChatDrawerAtom);

  const isHomeRoute = location.pathname === "/home";
  const isMac = React.useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  }, []);
  const captureShortcut = isMac ? "Cmd+K" : "Ctrl+K";
  const triageShortcut = isMac ? "Cmd+Shift+K" : "Ctrl+Shift+K";
  const chatShortcut = isMac ? "Cmd+Shift+A" : "Ctrl+Shift+A";

  const pathSegments = location.pathname.split("/").filter(Boolean);
  const spaceIdFromPath =
    pathSegments[0] === "spaces" ? pathSegments[1] : undefined;
  const spaceIdFromQuery = new URLSearchParams(location.search).get("spaceId");
  const currentSpaceId = spaceIdFromPath || spaceIdFromQuery || undefined;
  const filesLink = currentSpaceId
    ? `${APP_ROUTE.FILES}?spaceId=${currentSpaceId}`
    : APP_ROUTE.FILES;
  const headerLinks = links.map((link) => ({
    ...link,
    link: link.link === APP_ROUTE.FILES ? filesLink : link.link,
  }));

  const items = headerLinks.map((link) => (
    <Link key={link.label} to={link.link} className={classes.link}>
      {t(link.label)}
    </Link>
  ));

  const mobileMenuItems = headerLinks.map((link) => (
    <Menu.Item key={link.label} component={Link} to={link.link}>
      {t(link.label)}
    </Menu.Item>
  ));

  const toggleAgentChat = () => setAgentChatOpened((opened) => !opened);
  const openShortcutsModal = () => {
    modals.open({
      title: t("Keyboard shortcuts"),
      size: "sm",
      closeOnClickOutside: true,
      closeOnEscape: true,
      withCloseButton: true,
      overlayProps: { opacity: 0.45 },
      children: (
        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <Text>{t("Quick capture")}</Text>
            <Text fw={600}>{captureShortcut}</Text>
          </Group>
          <Group justify="space-between" wrap="nowrap">
            <Text>{t("Triage")}</Text>
            <Text fw={600}>{triageShortcut}</Text>
          </Group>
          <Group justify="space-between" wrap="nowrap">
            <Text>{t("Agent chat")}</Text>
            <Text fw={600}>{chatShortcut}</Text>
          </Group>
        </Stack>
      ),
    });
  };
  const { logout } = useAuth();
  const [currentUser] = useAtom(currentUserAtom);
  const user = currentUser?.user;
  const workspace = currentUser?.workspace;
  const colorScheme = useComputedColorScheme("light");
  const logoSrc = `${import.meta.env.BASE_URL}${colorScheme === "dark" ? "dark-mode-logo.png" : "light-mode-logo.png"}`;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isEditableTarget(event.target)) return;
      const isModifier = isMac ? event.metaKey : event.ctrlKey;
      if (!isModifier || !event.shiftKey) return;
      if (event.key.toLowerCase() !== "a") return;
      event.preventDefault();
      setAgentChatOpened((opened) => !opened);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMac, setAgentChatOpened]);

  return (
    <>
      <Group
        h="100%"
        px="sm"
        justify="space-between"
        wrap="nowrap"
        className={classes.headerRow}
      >
        <Group wrap="nowrap" className={classes.leftGroup}>
          {!isHomeRoute && (
            <>
              <Tooltip label={t("Sidebar toggle")}>
                <SidebarToggle
                  aria-label={t("Sidebar toggle")}
                  opened={mobileOpened}
                  onClick={toggleMobile}
                  hiddenFrom="sm"
                  size="sm"
                />
              </Tooltip>

              <Tooltip label={t("Sidebar toggle")}>
                <SidebarToggle
                  aria-label={t("Sidebar toggle")}
                  opened={desktopOpened}
                  onClick={toggleDesktop}
                  visibleFrom="sm"
                  size="sm"
                />
              </Tooltip>
            </>
          )}

          <Group wrap="nowrap" gap="xs" className={classes.brandGroup}>
            <Link to="/home" aria-label={t("Raven Docs home")}>
              <img
                src={logoSrc}
                alt={t("Raven Docs logo")}
                style={{
                  height: 24,
                  width: 24,
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </Link>
            <Text
              size="lg"
              fw={600}
              style={{ cursor: "pointer", userSelect: "none" }}
              component={Link}
              to="/home"
              className={classes.brand}
            >
              Raven Docs
            </Text>
          </Group>

          <Group ml={50} gap={5} className={classes.links} visibleFrom="sm">
            {items}
          </Group>
        </Group>

        <Group wrap="nowrap">
          {!isHomeRoute && <QuickCapture />}
        </Group>

        <Group wrap="nowrap" className={classes.rightGroup}>
          <Menu position="bottom-end" withArrow shadow="md">
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                size={30}
                aria-label={t("Menu")}
                hiddenFrom="sm"
              >
                <IconMenu2 size={18} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{t("Navigation")}</Menu.Label>
              {mobileMenuItems}

              <Menu.Divider />

              {workspace && !isHomeRoute && (
                <>
                  <Menu.Label>{t("Workspace")}</Menu.Label>
                  <Menu.Item
                    component={Link}
                    to={APP_ROUTE.SETTINGS.WORKSPACE.GENERAL}
                    leftSection={<IconSettings size={16} />}
                  >
                    {t("Workspace settings")}
                  </Menu.Item>
                  <Menu.Item
                    component={Link}
                    to={APP_ROUTE.SETTINGS.WORKSPACE.MEMBERS}
                    leftSection={<IconUsers size={16} />}
                  >
                    {t("Manage members")}
                  </Menu.Item>
                  <Menu.Divider />
                </>
              )}

              {user && (
                <>
                  <Menu.Label>{t("Account")}</Menu.Label>
                  <Menu.Item
                    component={Link}
                    to={APP_ROUTE.SETTINGS.ACCOUNT.PROFILE}
                    leftSection={<IconUserCircle size={16} />}
                  >
                    {t("My profile")}
                  </Menu.Item>
                  <Menu.Item
                    component={Link}
                    to={APP_ROUTE.SETTINGS.ACCOUNT.PREFERENCES}
                    leftSection={<IconBrush size={16} />}
                  >
                    {t("My preferences")}
                  </Menu.Item>
                  <Menu.Divider />
                </>
              )}

              <Menu.Item
                onClick={toggleAgentChat}
                leftSection={<IconLayoutSidebarRight size={16} />}
              >
                {t("Agent chat")}
              </Menu.Item>

              {user && (
                <Menu.Item onClick={logout} leftSection={<IconLogout size={16} />}>
                  {t("Logout")}
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>

          <div className={classes.desktopOnly}>
            <Tooltip label={t("Help & shortcuts")} withArrow position="bottom">
              <ActionIcon
                variant="subtle"
                size={30}
                aria-label={t("Help & shortcuts")}
                onClick={openShortcutsModal}
              >
                <IconHelpCircle size={16} />
              </ActionIcon>
            </Tooltip>
          </div>
          {/* <MCPEventIndicator /> */}
          <div className={classes.desktopOnly}>
            <TopMenu />
          </div>
          <div className={classes.desktopOnly}>
            <Tooltip label={t("Agent chat")} withArrow position="bottom">
              <ActionIcon
                variant="subtle"
                size={30}
                aria-label={t("Agent chat")}
                onClick={toggleAgentChat}
              >
                <IconLayoutSidebarRight size={16} />
              </ActionIcon>
            </Tooltip>
          </div>
        </Group>
      </Group>
    </>
  );
}
