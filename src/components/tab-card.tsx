import { LinkTabs, type LinkTab } from "@/components/link-tabs";

/**
 * A white box that holds a page's tabs and everything under them, so the tabs never float on the page
 * background. Buttons for the page go on the right of the tab row. Tables inside use DataGrid `flush`;
 * other content gets padding with `padded`.
 */
export function TabCard({
  tabs,
  active,
  actions,
  padded,
  children,
}: {
  tabs: LinkTab[];
  active: number;
  actions?: React.ReactNode;
  padded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-5 pt-4">
        <LinkTabs tabs={tabs} active={active} />
        {actions}
      </div>
      <div className={padded ? "p-4" : ""}>{children}</div>
    </div>
  );
}
