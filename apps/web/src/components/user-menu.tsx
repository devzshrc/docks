"use client";
import { Button as ShadcnButton } from "@/components/ui/button";

import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/person-avatar";
import { authClient, useSession } from "@/lib/auth-client";

/** The signed-in person as a header pill (avatar and first name). Opens a menu with Account and Sign out. */
export function UserMenu() {
  const { data: session } = useSession();
  const router = useRouter();
  const user = session?.user;
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ShadcnButton
          variant="outline"
          size="sm"
          aria-label={`Account menu for ${user.name}`}
          className="gap-1.5 py-1 pr-2.5 pl-1 font-normal has-[>svg]:pl-1"
        >
          <PersonAvatar
            seed={user.id}
            name={user.name}
            src={user.image}
            className="size-5"
          />
          <span className="hidden max-w-28 truncate sm:inline">
            {user.name.split(" ")[0]}
          </span>
        </ShadcnButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <PersonAvatar
            seed={user.id}
            name={user.name}
            src={user.image}
            className="size-8"
          />
          <span className="grid min-w-0 leading-tight">
            <span className="truncate text-[13px] font-medium">{user.name}</span>
            <span className="text-muted-foreground truncate text-xs">
              {user.email}
            </span>
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/account">Account and security</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await authClient.signOut();
            router.push("/login");
            router.refresh();
          }}
        >
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
