import {
  Box,
  Divider,
  Select,
  Stack,
  TagsInput,
  Text,
  Textarea,
  useMantineTheme,
  useMantineColorScheme,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { usePageQuery } from "@/features/page/queries/page-query";
import { useUpdatePageMetadataMutation } from "@/features/page/queries/page-query";
import classes from "@/features/project/components/task-page-panel.module.css";

const STATUS_OPTIONS = [
  { value: "proposed", label: "Proposed" },
  { value: "testing", label: "Testing" },
  { value: "validated", label: "Validated" },
  { value: "refuted", label: "Refuted" },
  { value: "inconclusive", label: "Inconclusive" },
  { value: "superseded", label: "Superseded" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

interface HypothesisPagePanelProps {
  pageId: string;
}

export function HypothesisPagePanel({ pageId }: HypothesisPagePanelProps) {
  const { t } = useTranslation();
  const theme = useMantineTheme();
  const { colorScheme } = useMantineColorScheme();
  const { data: page } = usePageQuery({ pageId });
  const updateMetadata = useUpdatePageMetadataMutation();

  if (!page || page.pageType !== "hypothesis" || !page.metadata) {
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
              value={metadata.status || "proposed"}
              onChange={(value) => handleChange("status", value)}
              size="sm"
              classNames={inputClassNames}
              styles={dropdownStyles}
              style={propertyControlStyle}
            />
          </Box>

          <Box style={propertyRowStyle}>
            <Text fw={500} size="sm" c="dimmed" style={{ width: propertyLabelWidth }}>
              {t("Priority")}
            </Text>
            <Select
              data={PRIORITY_OPTIONS}
              value={metadata.priority || "medium"}
              onChange={(value) => handleChange("priority", value)}
              size="sm"
              classNames={inputClassNames}
              styles={dropdownStyles}
              style={propertyControlStyle}
            />
          </Box>

          <Box style={{ ...propertyRowStyle, alignItems: "flex-start" }}>
            <Text fw={500} size="sm" c="dimmed" style={{ width: propertyLabelWidth, paddingTop: 6 }}>
              {t("Statement")}
            </Text>
            <Textarea
              value={metadata.formalStatement || ""}
              onChange={(e) => handleChange("formalStatement", e.currentTarget.value)}
              placeholder={t("Formal statement...")}
              minRows={2}
              size="sm"
              classNames={inputClassNames}
              style={propertyControlStyle}
            />
          </Box>

          <Box style={propertyRowStyle}>
            <Text fw={500} size="sm" c="dimmed" style={{ width: propertyLabelWidth }}>
              {t("Domain Tags")}
            </Text>
            <TagsInput
              value={metadata.domainTags || []}
              onChange={(value) => handleChange("domainTags", value)}
              placeholder={t("Add tags...")}
              size="sm"
              classNames={inputClassNames}
              style={propertyControlStyle}
            />
          </Box>

          <Box style={propertyRowStyle}>
            <Text fw={500} size="sm" c="dimmed" style={{ width: propertyLabelWidth }}>
              {t("Predictions")}
            </Text>
            <TagsInput
              value={metadata.predictions || []}
              onChange={(value) => handleChange("predictions", value)}
              placeholder={t("Add predictions...")}
              size="sm"
              classNames={inputClassNames}
              style={propertyControlStyle}
            />
          </Box>

          <Box style={{ ...propertyRowStyle, alignItems: "flex-start" }}>
            <Text fw={500} size="sm" c="dimmed" style={{ width: propertyLabelWidth, paddingTop: 6 }}>
              {t("Criteria")}
            </Text>
            <Textarea
              value={metadata.successCriteria || ""}
              onChange={(e) => handleChange("successCriteria", e.currentTarget.value)}
              placeholder={t("Success criteria...")}
              minRows={2}
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
