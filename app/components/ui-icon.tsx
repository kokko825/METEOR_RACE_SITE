/** Shared UI geometry: fixed stroke and dimensions independent of emoji fonts. */
export function UiIcon({ kind }: { kind: "tutorial" | "book" | "book-open" | "settings" }) {
  const paths = {
    tutorial: "M4 4h6l2 3 2-3h6v12l-8 5-8-5Z M12 7v14",
    book: "M5 3h14v18H5V3Z M8 3v18 M11 7h5 M11 11h5",
    "book-open": "M12 6 3 3v15l9 3 9-3V3l-9 3v15",
    settings: "m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3Z M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0",
  } as const;
  return <svg className="ui-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="miter" aria-hidden="true" focusable="false"><path d={paths[kind]} /></svg>;
}
