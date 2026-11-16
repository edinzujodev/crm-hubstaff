"use client";

import { Select } from "@/components/ui";
import { useTransition } from "react";
import { setUserRole } from "@/app/actions";

/** Super admin or regular member. A team leader is set from the team's leader field. */
export function RoleSelect({ userId, role, name }: { userId: number; role: "super_admin" | "member"; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Select
      aria-label={`Role for ${name}`}
      className="w-full "
      value={role}
      disabled={pending}
      onChange={(e) =>
        startTransition(async () => {
          const res = await setUserRole(userId, e.target.value as "super_admin" | "member");
          if (!res.ok) alert(res.error);
        })
      }
    >
      <option value="member">Member</option>
      <option value="super_admin">Super admin</option>
    </Select>
  );
}
