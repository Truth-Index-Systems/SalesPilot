"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function AccountMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
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
      router.replace("/");
      router.refresh();
    } finally {
      setSigningOut(false);
      setOpen(false);
    }
  }

  return <div className="account-menu" ref={containerRef}>
    <button
      type="button"
      className="button secondary account-menu-trigger"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen(value => !value)}
    >
      {name}
      <span className="account-menu-chevron" aria-hidden="true">⌄</span>
    </button>
    {open ? <div className="account-menu-popover" role="menu">
      <div className="account-menu-heading">
        <strong>{name}</strong>
        <span>Manage your MarketRoute account</span>
      </div>
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
