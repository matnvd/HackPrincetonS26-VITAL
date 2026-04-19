/** Central list for the workspace tab bar — add entries here when introducing new tabs. */
export const TABS = [
  { path: "/tab1", label: "Tab 1 · Dashboard" },
  { path: "/tab2", label: "Tab 2" },
  { path: "/tab3", label: "Tab 3" },
  { path: "/tab4", label: "Tab 4" },
] as const;

export type TabConfig = (typeof TABS)[number];
