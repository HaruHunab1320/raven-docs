import {
  Group,
  Text,
  useMantineColorScheme,
  Select,
  MantineColorScheme,
  Paper,
  SimpleGrid,
  Avatar,
  Stack,
  Card,
  Radio,
  Title,
  Badge,
  useMantineTheme,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { RAVEN_DOCS_THEMES, getThemeById } from "@/theme";
import { useAtom } from "jotai";
import { currentUserAtom } from "../atoms/current-user-atom";
import { updateUser } from "../services/user-service";
import { useState, useEffect } from "react";
import { logger } from "@/lib/logger";

export default function AccountTheme() {
  const { t } = useTranslation();

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">{t("Theme")}</Text>
        <Text size="sm" c="dimmed">
          {t("Choose your preferred theme for the application.")}
        </Text>
      </div>

      <ThemeSwitcher />
    </Group>
  );
}

function ThemeCard({
  themeOption,
  isSelected,
  theme,
  t,
  onClick,
}: {
  themeOption: (typeof RAVEN_DOCS_THEMES)[0];
  isSelected: boolean;
  theme: ReturnType<typeof useMantineTheme>;
  t: ReturnType<typeof useTranslation>["t"];
  onClick: () => void;
}) {
  const primaryColor = theme.colors[themeOption.primaryColor]?.[5];

  return (
    <Card
      padding="xs"
      radius="md"
      withBorder
      onClick={onClick}
      style={{
        borderColor: isSelected
          ? primaryColor
          : themeOption.borderColor || undefined,
        borderWidth: isSelected ? 2 : 1,
        backgroundColor: themeOption.bodyBg,
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = `0 4px 12px ${primaryColor}33`;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      {themeOption.isSignature && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            width: 60,
            height: 60,
            background: `linear-gradient(135deg, transparent 50%, ${theme.colors[themeOption.primaryColor]?.[5] || themeOption.primaryColor}22 50%)`,
            pointerEvents: "none",
          }}
        />
      )}
      <Group wrap="nowrap">
        <Radio
          value={themeOption.id}
          aria-label={themeOption.name}
          color={themeOption.primaryColor}
          styles={{
            radio: {
              backgroundColor: isSelected ? primaryColor : themeOption.surfaceBg,
              borderColor: isSelected ? primaryColor : themeOption.borderColor,
              borderWidth: 2,
            },
            icon: {
              // Use contrasting color for the checkmark
              color: themeOption.isDark ? themeOption.textColor : "#ffffff",
            },
          }}
        />
        <Stack gap={0} style={{ flex: 1 }}>
          <Group gap="xs">
            <Text
              fw={500}
              size="sm"
              style={{ color: themeOption.textColor }}
            >
              {themeOption.name}
            </Text>
            {isSelected && (
              <Badge
                size="xs"
                color={themeOption.primaryColor}
                variant="filled"
              >
                {t("Active")}
              </Badge>
            )}
          </Group>
          <Text
            size="xs"
            style={{
              color: themeOption.textColor,
              opacity: 0.7,
            }}
          >
            {themeOption.description}
          </Text>
        </Stack>
      </Group>
      <Group mt="xs" justify="flex-end" gap={4}>
        <Paper
          radius="sm"
          w={16}
          h={16}
          style={{
            backgroundColor: theme.colors[themeOption.primaryColor]?.[5],
            border: `1px solid ${themeOption.borderColor}`,
          }}
        />
        {themeOption.secondaryColor && (
          <Paper
            radius="sm"
            w={16}
            h={16}
            style={{
              backgroundColor:
                theme.colors[themeOption.secondaryColor]?.[5],
              border: `1px solid ${themeOption.borderColor}`,
            }}
          />
        )}
        <Paper
          radius="sm"
          w={16}
          h={16}
          style={{
            backgroundColor: themeOption.surfaceBg,
            border: `1px solid ${themeOption.borderColor}`,
          }}
        />
      </Group>
    </Card>
  );
}

function ThemeSwitcher() {
  const { t } = useTranslation();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [currentUser, setCurrentUser] = useAtom(currentUserAtom);
  const user = currentUser?.user;
  const [selectedThemeId, setSelectedThemeId] = useState<string>(
    user?.settings?.preferences?.themeId || "default-light"
  );
  const theme = useMantineTheme();

  // Categorize themes
  const signatureThemes = RAVEN_DOCS_THEMES.filter((t) => t.isSignature);
  const lightThemes = RAVEN_DOCS_THEMES.filter(
    (t) => !t.isSignature && !t.isDark
  );
  const darkThemes = RAVEN_DOCS_THEMES.filter(
    (t) => !t.isSignature && t.isDark
  );

  // Handle system light/dark preference changes
  useEffect(() => {
    const savedThemeId = user.settings?.preferences?.themeId;

    // If the user hasn't selected a theme yet, use default based on system preference
    if (!savedThemeId) {
      // Determine light/dark from system or mantine's colorScheme setting
      const baseTheme =
        colorScheme === "dark" ? "default-dark" : "default-light";
      setSelectedThemeId(baseTheme);
    } else {
      // Set color scheme based on the saved theme's isDark property
      const userTheme = getThemeById(savedThemeId);
      if (userTheme.isDark && colorScheme !== "dark") {
        setColorScheme("dark");
      } else if (!userTheme.isDark && colorScheme !== "light") {
        setColorScheme("light");
      }
    }
  }, [colorScheme, user?.settings?.preferences?.themeId]);

  const applyTheme = async (themeId: string) => {
    try {
      const selectedTheme = getThemeById(themeId);

      // Update Mantine color scheme
      setColorScheme(selectedTheme.isDark ? "dark" : "light");

      // Optimistically update user preferences to prevent theme bounce.
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              user: {
                ...prev.user,
                settings: {
                  ...prev.user.settings,
                  preferences: {
                    ...prev.user.settings?.preferences,
                    themeId,
                  },
                },
              },
            }
          : prev
      );

      // Save to backend
      const updatedUser = await updateUser({ themeId });
      if (updatedUser) {
        setCurrentUser((prev) =>
          prev
            ? {
                ...prev,
                user: updatedUser,
              }
            : prev
        );
      }

      // Update local state
      setSelectedThemeId(themeId);
    } catch (error) {
      logger.error("Failed to update theme preference:", error);
    }
  };

  return (
    <Stack
      w="100%"
      gap="lg"
      style={{
        maxHeight: "70vh",
        overflowY: "auto",
        paddingRight: 8,
      }}
    >
      <Radio.Group
        value={selectedThemeId}
        onChange={applyTheme}
        name="themeChoice"
      >
        {/* Signature Themes */}
        <Stack gap="xs">
          <Group gap="xs">
            <Title order={5}>{t("Raven Collection")}</Title>
            <Badge size="xs" variant="light" color="grape">
              {t("Signature")}
            </Badge>
          </Group>
          <Text size="xs" c="dimmed" mb="xs">
            {t("Curated themes inspired by the Raven Docs identity")}
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {signatureThemes.map((themeOption) => (
              <ThemeCard
                key={themeOption.id}
                themeOption={themeOption}
                isSelected={selectedThemeId === themeOption.id}
                theme={theme}
                t={t}
                onClick={() => applyTheme(themeOption.id)}
              />
            ))}
          </SimpleGrid>
        </Stack>

        {/* Light Themes */}
        <Stack gap="xs" mt="lg">
          <Title order={5}>{t("Light Themes")}</Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {lightThemes.map((themeOption) => (
              <ThemeCard
                key={themeOption.id}
                themeOption={themeOption}
                isSelected={selectedThemeId === themeOption.id}
                theme={theme}
                t={t}
                onClick={() => applyTheme(themeOption.id)}
              />
            ))}
          </SimpleGrid>
        </Stack>

        {/* Dark Themes */}
        <Stack gap="xs" mt="lg">
          <Title order={5}>{t("Dark Themes")}</Title>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {darkThemes.map((themeOption) => (
              <ThemeCard
                key={themeOption.id}
                themeOption={themeOption}
                isSelected={selectedThemeId === themeOption.id}
                theme={theme}
                t={t}
                onClick={() => applyTheme(themeOption.id)}
              />
            ))}
          </SimpleGrid>
        </Stack>
      </Radio.Group>
    </Stack>
  );
}

// Fallback for legacy support - this component can be used as a standalone color scheme selector
export function ColorSchemeSwitcher() {
  const { t } = useTranslation();
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  const handleChange = (value: MantineColorScheme) => {
    setColorScheme(value);
  };

  return (
    <Select
      label={t("Color mode")}
      data={[
        { value: "light", label: t("Light") },
        { value: "dark", label: t("Dark") },
        { value: "auto", label: t("System settings") },
      ]}
      value={colorScheme}
      onChange={handleChange}
      allowDeselect={false}
      checkIconPosition="right"
    />
  );
}
