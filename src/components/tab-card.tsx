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
  toolbar,
  padded,
  children,
}: {
  tabs: LinkTab[];
  active: number;
  actions?: React.ReactNode;
  /** Page buttons ("New task"), above the box on the right. */
  /** A row under the tabs, on the right of the tab row, inside the box: filters, default size. */
  toolbar?: React.ReactNode;
  padded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
      <div className="card overflow-hidden">
        <div className="mx-4 flex flex-wrap items-end justify-between gap-x-4 border-b border-border pt-4">
          <div className="min-w-0 flex-1">
            <LinkTabs tabs={tabs} active={active} />
          </div>
          {toolbar && <div className="flex items-center gap-2 pb-1.5">{toolbar}</div>}
        </div>
        <div className={padded ? "p-4" : undefined}>{children}</div>
      </div>
    </div>
  );
}
