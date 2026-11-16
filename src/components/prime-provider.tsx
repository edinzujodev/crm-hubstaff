"use client";

import { PrimeReactProvider } from "primereact/api";
import type { ReactNode } from "react";

/** PrimeReact settings for the whole app. The theme itself is loaded with <link> tags in the layout. */
export function PrimeProvider({ children }: { children: ReactNode }) {
  return <PrimeReactProvider value={{ ripple: false, inputStyle: "outlined" }}>{children}</PrimeReactProvider>;
}
