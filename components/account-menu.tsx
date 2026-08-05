"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/auth/sign-out", { method: "POST" });
      router.replace("/sign-in?next=/");
      router.refresh();
    } finally {
      setSigningOut(false);
      setOpen(false);
    }
  }

  const signInHref = `/sign-in?next=${encodeURIComponent(pathname || "/")}`;

  return <div className="account-menu" ref={containerRef}>
    <button
      type="button"
      className="button secondary account-menu-trigger"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen(value => !value)}
    >
      Jaspal
      <span className="account-menu-chevron" aria-hidden="true">⌄</span>
    </button>
    {open ? <div className="account-menu-popover" role="menu">
      <div className="account-menu-heading">
        <strong>Account</strong>
        <span>Manage your SalesPilot session</span>
      </div>
      <Link href={signInHref} className="account-menu-item" role="menuitem" onClick={() => setOpen(false)}>
        Sign in
      </Link>
      <Link href="/settings" className="account-menu-item" role="menuitem" onClick={() => setOpen(false)}>
        Settings
      </Link>
      <button
        type="button"
        className="account-menu-item account-menu-signout"
        role="menuitem"
        disabled={signingOut}
        onClick={signOut}
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </div> : null}
  </div>;
}
