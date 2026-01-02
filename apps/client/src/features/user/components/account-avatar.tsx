import { focusAtom } from "jotai-optics";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useState, useEffect, useRef } from "react";
import { useAtom } from "jotai";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { FileButton, Tooltip, Loader } from "@mantine/core";
import { uploadAvatar } from "@/features/user/services/user-service.ts";
import { useTranslation } from "react-i18next";
import { getAvatarUrl } from "@/lib/config.ts";

const userAtom = focusAtom(currentUserAtom, (optic) => optic.prop("user"));

export default function AccountAvatar() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [currentUser] = useAtom(currentUserAtom);
  const [, setUser] = useAtom(userAtom);
  const [file, setFile] = useState<File | null>(null);
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null>(null);
  const serverUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup function for local avatar URL and timeout
  useEffect(() => {
    return () => {
      if (localAvatarUrl && localAvatarUrl.startsWith("blob:")) {
        URL.revokeObjectURL(localAvatarUrl);
      }

      if (serverUpdateTimeoutRef.current) {
        clearTimeout(serverUpdateTimeoutRef.current);
      }
    };
  }, [localAvatarUrl]);

  const handleFileChange = async (selectedFile: File) => {
    if (!selectedFile) {
      return;
    }

    setFile(selectedFile);

    // Create local preview immediately
    if (localAvatarUrl && localAvatarUrl.startsWith("blob:")) {
      URL.revokeObjectURL(localAvatarUrl);
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setLocalAvatarUrl(objectUrl);

    try {
      setIsLoading(true);
      const avatar = await uploadAvatar(selectedFile);

      // Update the user store with the new avatar URL from server
      setUser((prev) => ({ ...prev, avatarUrl: avatar.fileName }));

      // Delay cleanup to ensure the server image has time to load
      // This prevents the flickering effect when transitioning from blob to server URL
      if (serverUpdateTimeoutRef.current) {
        clearTimeout(serverUpdateTimeoutRef.current);
      }

      serverUpdateTimeoutRef.current = setTimeout(() => {
        // Clean up local URL after we're sure the server update is visible
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
        setLocalAvatarUrl(null);
        serverUpdateTimeoutRef.current = null;
      }, 1500); // Give enough time for the server image to load
    } catch (err) {
      console.log(err);
      // Keep local preview in case of error
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <FileButton onChange={handleFileChange} accept="image/png,image/jpeg">
        {(props) => (
          <Tooltip label={t("Change photo")} position="bottom">
            <div style={{ position: "relative", display: "inline-block" }}>
              <CustomAvatar
                {...props}
                component="button"
                size="60px"
                // Use local preview URL if available, otherwise use server URL
                avatarUrl={localAvatarUrl || currentUser?.user.avatarUrl}
                name={currentUser?.user.name}
                style={{ cursor: "pointer" }}
              />
              {isLoading && (
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(255, 255, 255, 0.7)",
                    borderRadius: "50%",
                  }}
                >
                  <Loader size="sm" />
                </div>
              )}
            </div>
          </Tooltip>
        )}
      </FileButton>
    </>
  );
}
