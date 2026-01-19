import { Modal, Button, Group, Text, Select, Switch } from "@mantine/core";
import { exportPage } from "@/features/page/services/page-service.ts";
import { useState } from "react";
import * as React from "react";
import { ExportFormat } from "@/features/page/types/page.types.ts";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { logger } from "@/lib/logger";

interface PageExportModalProps {
  pageId: string;
  open: boolean;
  onClose: () => void;
}

export default function PageExportModal({
  pageId,
  open,
  onClose,
}: PageExportModalProps) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<ExportFormat>(ExportFormat.Markdown);
  const [includeChildren, setIncludeChildren] = useState<boolean>(false);

  const handleExport = async () => {
    try {
      await exportPage({ pageId: pageId, format, includeChildren });
      onClose();
    } catch (err) {
      notifications.show({
        message: t("Export failed:") + err.response?.data.message,
        color: "red",
      });
      logger.error("export error", err);
    }
  };

  const handleChange = (format: ExportFormat) => {
    setFormat(format);
  };

  return (
    <Modal.Root
      opened={open}
      onClose={onClose}
      size={500}
      padding="xl"
      yOffset="10vh"
      xOffset={0}
      mah={400}
    >
      <Modal.Overlay />
      <Modal.Content style={{ overflow: "hidden" }}>
        <Modal.Header py={0}>
          <Modal.Title fw={500}>{t("Export page")}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <Group justify="space-between" wrap="nowrap">
            <div>
              <Text size="md">{t("Format")}</Text>
            </div>
            <ExportFormatSelection format={format} onChange={handleChange} />
          </Group>

          <Group justify="space-between" wrap="nowrap" pt="md">
            <div>
              <Text size="md">{t("Include subpages")}</Text>
            </div>
            <Switch
              onChange={(event) =>
                setIncludeChildren(event.currentTarget.checked)
              }
              checked={includeChildren}
            />
          </Group>

          {format === ExportFormat.PDF && includeChildren && (
            <Text size="xs" c="dimmed" mt="xs">
              {t(
                "Note: When exporting multiple pages to PDF, a ZIP file will be downloaded containing HTML files that can be viewed in your browser and saved as PDFs individually."
              )}
            </Text>
          )}

          <Group justify="center" mt="md">
            <Button onClick={onClose} variant="default">
              {t("Cancel")}
            </Button>
            <Button onClick={handleExport}>{t("Export")}</Button>
          </Group>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

interface ExportFormatSelection {
  format: ExportFormat;
  onChange: (value: string) => void;
}
function ExportFormatSelection({ format, onChange }: ExportFormatSelection) {
  const { t } = useTranslation();

  return (
    <Select
      data={[
        { value: "markdown", label: "Markdown" },
        { value: "html", label: "HTML" },
        { value: "pdf", label: "PDF" },
      ]}
      defaultValue={format}
      onChange={onChange}
      styles={{ wrapper: { maxWidth: 120 } }}
      comboboxProps={{ width: "120" }}
      allowDeselect={false}
      withCheckIcon={false}
      aria-label={t("Select export format")}
    />
  );
}
