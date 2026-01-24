import PageHeaderMenu from "@/features/page/components/header/page-header-menu.tsx";
import Breadcrumb from "@/features/page/components/breadcrumbs/breadcrumb.tsx";
import { BreadcrumbBar } from "@/features/page/components/breadcrumbs/breadcrumb-bar";
import classes from "@/features/page/components/breadcrumbs/breadcrumb-bar.module.css";
import { useLocation } from "react-router-dom";

interface Props {
  readOnly?: boolean;
}
export default function PageHeader({ readOnly }: Props) {
  const location = useLocation();
  const hasBreadcrumbs = location.pathname.startsWith("/s/");

  if (!hasBreadcrumbs) {
    return (
      <div className={classes.menuOnly}>
        <PageHeaderMenu readOnly={readOnly} />
      </div>
    );
  }
  return (
    <BreadcrumbBar right={<PageHeaderMenu readOnly={readOnly} />}>
      <Breadcrumb />
    </BreadcrumbBar>
  );
}
