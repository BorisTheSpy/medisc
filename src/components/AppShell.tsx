import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { TabBar } from "./TabBar";
import { useMe } from "@/db/hooks";
import { dbAvailable } from "@/db/db";
import { Onboarding } from "@/routes/Onboarding";
import { Spinner } from "./ui";

export function AppShell() {
  const me = useMe();
  const location = useLocation();
  const [dbOk, setDbOk] = useState<boolean | null>(null);

  useEffect(() => {
    dbAvailable().then(setDbOk);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const hideTabs = /^\/rounds\/[^/]+\/play/.test(location.pathname) || location.pathname === "/play";

  if (dbOk === false) {
    return (
      <div className="mx-auto max-w-[480px] p-6 text-center">
        <h1 className="text-xl font-bold">Storage is blocked</h1>
        <p className="mt-2 text-sm text-ink-2">Medisc keeps your rounds on this device. Private browsing or blocked site data prevents that. Open the app in a normal window.</p>
      </div>
    );
  }

  if (me === undefined || dbOk === null) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner />
      </div>
    );
  }

  if (me === null) return <Onboarding />;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[480px] bg-bg">
      <div className={hideTabs ? "" : "pb-24"}>
        <Outlet />
      </div>
      {!hideTabs && <TabBar />}
    </div>
  );
}
