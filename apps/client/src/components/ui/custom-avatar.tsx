import React, { useMemo, useState, useEffect } from "react";
import { Avatar, AvatarProps, useMantineTheme } from "@mantine/core";
import { getAvatarUrl } from "@/lib/config";

interface CustomAvatarProps extends AvatarProps {
  avatarUrl?: string | null;
  name?: string;
  color?: string;
  size?: string | number;
  radius?: string | number;
  variant?: string;
  style?: any;
  component?: any;
}

export function CustomAvatar({ avatarUrl, name, color, ...props }: CustomAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const theme = useMantineTheme();

  // Reset error state when the URL changes
  useEffect(() => {
    setImgError(false);
  }, [avatarUrl]);

  const avatarSource = useMemo(() => {
    // If there was an error loading the image, return null to show the fallback
    if (imgError) return null;

    // If avatarUrl is a blob URL, use it directly
    if (avatarUrl && avatarUrl.startsWith("blob:")) {
      return avatarUrl;
    }

    // Otherwise use the configured avatar URL
    return getAvatarUrl(avatarUrl);
  }, [avatarUrl, imgError]);

  // Use provided color, or fall back to theme primary color
  const avatarColor = color || theme.primaryColor;

  return (
    <Avatar
      src={avatarSource}
      alt={name || "Avatar"}
      color={avatarColor}
      {...props}
      onError={() => setImgError(true)}
    >
      {name ? name.charAt(0).toUpperCase() : "U"}
    </Avatar>
  );
}
