import { Avatar, MantineSize } from "@mantine/core";
import { IconRobot } from "@tabler/icons-react";

interface AgentAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: MantineSize | number;
}

export function AgentAvatar({ name, avatarUrl, size = "sm" }: AgentAvatarProps) {
  // Calculate icon size based on avatar size
  const iconSize = typeof size === "number" ? size * 0.6 :
    size === "xs" ? 12 :
    size === "sm" ? 16 :
    size === "md" ? 20 :
    size === "lg" ? 24 :
    size === "xl" ? 28 : 16;

  if (avatarUrl) {
    return (
      <Avatar
        src={avatarUrl}
        alt={name}
        size={size}
        radius="xl"
      />
    );
  }

  return (
    <Avatar
      size={size}
      radius="xl"
      color="blue"
    >
      <IconRobot size={iconSize} />
    </Avatar>
  );
}
