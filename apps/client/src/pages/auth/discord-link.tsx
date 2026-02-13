import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import {
  Container,
  Paper,
  Title,
  Text,
  Button,
  Stack,
  Alert,
  Loader,
  Center,
  Group,
} from "@mantine/core";
import { IconBrandDiscord, IconCheck, IconX, IconLogin } from "@tabler/icons-react";
import { getAppName } from "@/lib/config";
import { useAtomValue } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import api from "@/lib/api-client";

interface LinkInfo {
  discordUserId: string;
  workspaceId: string;
}

export default function DiscordLinkPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const currentUser = useAtomValue(currentUserAtom);
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [linkInfo, setLinkInfo] = useState<LinkInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Fetch link info on mount
  useEffect(() => {
    if (!token) {
      setError(t("No linking token provided"));
      setLoading(false);
      return;
    }

    const fetchLinkInfo = async () => {
      try {
        const response = await api.get(`/integrations/discord/link/${token}`);
        setLinkInfo(response.data);
        setLoading(false);
      } catch (err: any) {
        setError(err?.response?.data?.message || t("Invalid or expired linking token"));
        setLoading(false);
      }
    };

    fetchLinkInfo();
  }, [token, t]);

  // Handle the link action
  const handleLink = async () => {
    if (!token) return;

    setLinking(true);
    setError(null);

    try {
      await api.post(`/integrations/discord/link/${token}`);
      setSuccess(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || t("Failed to link accounts"));
    } finally {
      setLinking(false);
    }
  };

  // Redirect to login if not authenticated
  const handleLoginRedirect = () => {
    // Store the current URL so we can redirect back after login
    const returnUrl = window.location.pathname + window.location.search;
    sessionStorage.setItem("discord-link-return", returnUrl);
    navigate("/login");
  };

  // Check for return from login
  useEffect(() => {
    const returnUrl = sessionStorage.getItem("discord-link-return");
    if (returnUrl && currentUser) {
      sessionStorage.removeItem("discord-link-return");
      // We're back from login, proceed with linking
    }
  }, [currentUser]);

  if (loading) {
    return (
      <Container size="xs" py="xl">
        <Helmet>
          <title>{t("Link Discord Account")} - {getAppName()}</title>
        </Helmet>
        <Center py="xl">
          <Loader size="lg" />
        </Center>
      </Container>
    );
  }

  return (
    <Container size="xs" py="xl">
      <Helmet>
        <title>{t("Link Discord Account")} - {getAppName()}</title>
      </Helmet>

      <Paper radius="md" p="xl" withBorder>
        <Stack gap="lg" align="center">
          <IconBrandDiscord size={48} stroke={1.5} />

          <Title order={2} ta="center">
            {t("Link Discord Account")}
          </Title>

          {error && (
            <Alert
              icon={<IconX size={16} />}
              title={t("Error")}
              color="red"
              w="100%"
            >
              {error}
            </Alert>
          )}

          {success ? (
            <Stack align="center" gap="md">
              <Alert
                icon={<IconCheck size={16} />}
                title={t("Success!")}
                color="green"
                w="100%"
              >
                {t("Your Discord account has been linked to Raven Docs. You can now use /raven commands in Discord.")}
              </Alert>
              <Text size="sm" c="dimmed">
                {t("You can close this window and return to Discord.")}
              </Text>
              <Button
                variant="light"
                onClick={() => navigate("/home")}
              >
                {t("Go to Dashboard")}
              </Button>
            </Stack>
          ) : linkInfo ? (
            <Stack gap="md" w="100%">
              <Text ta="center" c="dimmed">
                {t("Link your Discord account to use Raven Docs commands and have actions performed as your user.")}
              </Text>

              {!currentUser ? (
                <Stack gap="md">
                  <Alert color="blue" w="100%">
                    {t("Please sign in to your Raven Docs account to complete the linking.")}
                  </Alert>
                  <Button
                    leftSection={<IconLogin size={18} />}
                    onClick={handleLoginRedirect}
                    fullWidth
                  >
                    {t("Sign in to Raven Docs")}
                  </Button>
                </Stack>
              ) : (
                <Stack gap="md">
                  <Paper withBorder p="md" radius="sm">
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">{t("Raven Account")}</Text>
                      <Text size="sm" fw={500}>{currentUser.user.email}</Text>
                    </Group>
                  </Paper>

                  <Button
                    leftSection={<IconBrandDiscord size={18} />}
                    onClick={handleLink}
                    loading={linking}
                    fullWidth
                  >
                    {t("Link Accounts")}
                  </Button>

                  <Text size="xs" c="dimmed" ta="center">
                    {t("By linking, Discord commands will be executed with your Raven Docs permissions.")}
                  </Text>
                </Stack>
              )}
            </Stack>
          ) : (
            <Text c="dimmed">
              {t("Invalid linking request. Please try the /raven link command again in Discord.")}
            </Text>
          )}
        </Stack>
      </Paper>
    </Container>
  );
}
