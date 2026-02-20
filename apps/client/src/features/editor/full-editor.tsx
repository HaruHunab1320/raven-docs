import classes from "@/features/editor/styles/editor.module.css";
import React from "react";
import { TitleEditor } from "@/features/editor/title-editor";
import PageEditor from "@/features/editor/page-editor";
import { Container } from "@mantine/core";
import { useAtom } from "jotai";
import { userAtom } from "@/features/user/atoms/current-user-atom.ts";
import { TaskPagePanel } from "@/features/project/components/task-page-panel";
import { HypothesisPagePanel } from "@/features/intelligence/components/hypothesis-page-panel";
import { ExperimentPagePanel } from "@/features/intelligence/components/experiment-page-panel";

const MemoizedTitleEditor = React.memo(TitleEditor);
const MemoizedPageEditor = React.memo(PageEditor);

export interface FullEditorProps {
  pageId: string;
  slugId: string;
  title: string;
  content: string;
  spaceSlug: string;
  editable: boolean;
  pageType?: string;
  spaceId?: string;
}

export function FullEditor({
  pageId,
  title,
  slugId,
  content,
  spaceSlug,
  editable,
  pageType,
  spaceId,
}: FullEditorProps) {
  const [user] = useAtom(userAtom);
  const fullPageWidth = user.settings?.preferences?.fullPageWidth;

  return (
    <Container
      fluid={fullPageWidth}
      size={!fullPageWidth && 900}
      className={classes.editor}
    >
      <MemoizedTitleEditor
        pageId={pageId}
        slugId={slugId}
        title={title}
        spaceSlug={spaceSlug}
        editable={editable}
      />
      <TaskPagePanel pageId={pageId} />
      {pageType === "hypothesis" && <HypothesisPagePanel pageId={pageId} />}
      {pageType === "experiment" && spaceId && (
        <ExperimentPagePanel pageId={pageId} spaceId={spaceId} />
      )}
      <MemoizedPageEditor pageId={pageId} editable={editable} content={content} />
    </Container>
  );
}
