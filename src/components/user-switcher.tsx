"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { switchUser } from "@/app/actions";
import { Select } from "@/components/ui";

/** Development only: picking someone signs you in as them right away. */
export function UserSwitcher({ users, currentId }: { users: { id: number; name: string }[]; currentId: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      aria-label="Switch to"
      value={currentId}
      disabled={pending}
      className="w-full min-w-0"
      onChange={(e) =>
        start(async () => {
          const data = new FormData();
          data.set("userId", e.target.value);
          await switchUser(data);
          router.refresh();
        })
      }
    >
      {users.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
    </Select>
  );
}
