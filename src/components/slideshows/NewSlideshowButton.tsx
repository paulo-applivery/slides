"use client";

import { useTransition } from "react";
import { Icons } from "@/components/ui/Icon";
import { createSlideshow } from "@/lib/slideshows";

/** Wraps createSlideshow server action with a pending state. */
export function NewSlideshowButton({ primary }: { primary?: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={primary ? "btn btn-primary" : "btn btn-primary"}
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await createSlideshow();
        });
      }}
    >
      <Icons.Plus size={14} /> {pending ? "Creating…" : "New slideshow"}
    </button>
  );
}
