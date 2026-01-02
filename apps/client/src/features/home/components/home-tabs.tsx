import { Text, Tabs, Space, Button, Group } from "@mantine/core";
import { IconClockHour3, IconRefresh } from "@tabler/icons-react";
import RecentChanges from "@/components/common/recent-changes.tsx";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function HomeTabs() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    // Refresh recent changes data
    queryClient.invalidateQueries({ queryKey: ["recentChanges"] });
    setTimeout(() => setRefreshing(false), 1000); // Give perception of loading
  };

  return (
    <Tabs defaultValue="recent">
      <Group justify="space-between">
        <Tabs.List>
          <Tabs.Tab value="recent" leftSection={<IconClockHour3 size={18} />}>
            <Text size="sm" fw={500}>
              {t("Recently updated")}
            </Text>
          </Tabs.Tab>
        </Tabs.List>
        <Button
          variant="subtle"
          size="xs"
          leftSection={<IconRefresh size={16} />}
          onClick={handleRefresh}
          loading={refreshing}
        >
          {refreshing ? t("Refreshing...") : t("Refresh")}
        </Button>
      </Group>

      <Space my="md" />

      <Tabs.Panel value="recent">
        <RecentChanges />
      </Tabs.Panel>
    </Tabs>
  );
}
