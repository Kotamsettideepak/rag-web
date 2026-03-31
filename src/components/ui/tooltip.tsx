import { memo, type PropsWithChildren } from "react";

interface tooltip_props extends PropsWithChildren {
  content: string;
}

export const Tooltip = memo(function Tooltip({ content, children }: tooltip_props) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-[calc(100%+0.5rem)] left-1/2 z-20 hidden -translate-x-1/2 rounded-full bg-slate-950 px-3 py-1.5 text-xs leading-5 text-white whitespace-nowrap shadow-lg group-hover:inline-flex">
        {content}
      </span>
    </span>
  );
});
