import {
  Box,
  Divider,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  useMantineTheme,
  useMantineColorScheme,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { usePageQuery } from "@/features/page/queries/page-query";
import { useUpdatePageMetadataMutation } from "@/features/page/queries/page-query";
import { useHypothesesList } from "@/features/intelligence/hooks/use-intelligence-queries";
import classes from "@/features/project/components/task-page-panel.module.css";

const STATUS_OPTIONS = [
  { value: "planned", label: "Planned" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

interface ExperimentPagePanelProps {
  pageId: string;
  spaceId: string;
}

export function ExperimentPagePanel({ pageId, spaceId }: ExperimentPagePanelProps) {
  const { t } = useTranslation();
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const { data: page } = usePageQuery({ pageId });
  const updateMetadata = useUpdatePageMetadataMutation();
  const { data: hypotheses } = useHypothesesList(spaceId);

  if (!page || page.pageType !== "experiment" || !page.metadata) {
    return null;
  }

  const metadata = page.metadata;

  const propertyLabelWidth = 96;
  const propertyRowStyle = {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing.xs,
  } as const;
  const propertyControlStyle = {
    flex: 1,
    maxWidth: 360,
  } as const;

  const controlBorder = `1px solid ${
    colorScheme === "dark" ? theme.colors.dark[4] : theme.colors.gray[3]
  }`;
  const inputClassNames = { input: classes.inlineInput };
  const dropdownStyles = { dropdown: { border: controlBorder } };

  const handleChange = (key: string, value: any) => {
    updateMetadata.mutate({
      pageId,
      metadata: { ...metadata, [key]: value },
    });
  };

  const hypothesisOptions = Array.isArray(hypotheses)
    ? hypotheses.map((h: any) => ({
        value: h.pageId || h.id,
        label: h.title || h.name || "Untitled",
      }))
    : [];

  return (
    <Box mt="sm" mb="lg">
      <Stack gap="md">
        <Stack gap="sm">
          <Text size="sm" fw={600} c="dimmed">
            {t("Properties")}
          </Text>

          <Box style={propertyRowStyle}>
            <Text fw={500} size="sm" c="dimmed" style={{ width: propertyLabelWidth }}>
              {t("Status")}
            </Text>
            <Select
              data={STATUS_OPTIONS}
              value={metadata.status || "planned"}
              onChange={(value) => handleChange("status", value)}
              size="sm"
              classNames={inputClassNames}
              styles={dropdownStyles}
              style={propertyControlStyle}
            />
          </Box>

          <Box style={propertyRowStyle}>
            <Text fw={500} size="sm" c="dimmed" style={{ width: propertyLabelWidth }}>
              {t("Hypothesis")}
            </Text>
            <Select
              data={hypothesisOptions}
              value={metadata.hypothesisId || null}
              onChange={(value) => handleChange("hypothesisId", value)}
              placeholder={t("Link hypothesis...")}
              clearable
              searchable
              size="sm"
              classNames={inputClassNames}
              styles={dropdownStyles}
              style={propertyControlStyle}
            />
          </Box>

          <Box style={{ ...propertyRowStyle, alignItems: "flex-start" }}>
            <Text fw={500} size="sm" c="dimmed" style={{ width: propertyLabelWidth, paddingTop: 6 }}>
              {t("Method")}
            </Text>
            <Textarea
              value={metadata.method || ""}
              onChange={(e) => handleChange("method", e.currentTarget.value)}
              placeholder={t("Experiment method...")}
              minRows={2}
              size="sm"
              classNames={inputClassNames}
              style={propertyControlStyle}
            />
          </Box>

          <Box style={propertyRowStyle}>
            <Text fw={500} size="sm" c="dimmed" style={{ width: propertyLabelWidth }}>
              {t("Code Ref")}
            </Text>
            <TextInput
              value={metadata.codeRef || ""}
              onChange={(e) => handleChange("codeRef", e.currentTarget.value)}
              placeholder={t("Code reference...")}
              size="sm"
              classNames={inputClassNames}
              style={propertyControlStyle}
            />
          </Box>
        </Stack>

        <Divider />
      </Stack>
    </Box>
  );
}
