import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateUser } from "@/features/user/services/user-service.ts";
import { Group, MantineSize, Switch, Text } from "@mantine/core";
import { useAtom } from "jotai/index";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export default function ActivityTrackingPref() {
  const { t } = useTranslation();

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">{t("Track active time")}</Text>
        <Text size="sm" c="dimmed">
          {t("Allow Raven Docs to record active time on pages for insights.")}
        </Text>
      </div>

      <ActivityTrackingToggle />
    </Group>
  );
}

interface ActivityTrackingToggleProps {
  size?: MantineSize;
  label?: string;
}

export function ActivityTrackingToggle({
  size,
  label,
}: ActivityTrackingToggleProps) {
  const { t } = useTranslation();
  const [user, setUser] = useAtom(userAtom);
  const initialValue = useMemo(() => {
    const pref = user.settings?.preferences?.enableActivityTracking;
    return typeof pref === "boolean" ? pref : true;
  }, [user.settings?.preferences?.enableActivityTracking]);
  const [checked, setChecked] = useState(initialValue);

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    const updatedUser = await updateUser({ enableActivityTracking: value });
    setChecked(value);
    setUser(updatedUser);
  };

  return (
    <Switch
      size={size}
      label={label}
      labelPosition="left"
      checked={checked}
      onChange={handleChange}
      aria-label={t("Toggle activity tracking")}
    />
  );
}
