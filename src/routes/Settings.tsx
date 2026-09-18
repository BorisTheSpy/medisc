import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Download, Upload, Trash2 } from "lucide-react";
import { useMe, useSetting } from "@/db/hooks";
import { clearCaches, exportAll, importAll, setSetting, updatePlayer } from "@/db/repo";
import { applyTheme, getThemePref, type ThemePref } from "@/lib/theme";
import type { Units } from "@/domain/geo";
import { Button, Field, PageHeader, Section, Segmented, Toast } from "@/components/ui";
import { LocateFixed, FileDown, LogOut, UserCheck, RefreshCw } from "lucide-react";
import { useUser, login, register, logout } from "@/services/auth";
import { adoptAccount, syncNow } from "@/services/sync";
import { usePlayers, useRounds } from "@/db/hooks";
import { mergePlayerInto } from "@/db/repo";
import { importUdiscCsv } from "@/db/importUdisc";
import { getSetting } from "@/db/repo";
import type { LatLon } from "@/domain/types";

export function SettingsRoute() {
  const nav = useNavigate();
  const me = useMe();
  const units = useSetting<Units>("units", "ft");
  const satellite = useSetting<boolean>("satellite", false);
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  const [name, setName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [geoTest, setGeoTest] = useState<string>("");

  async function testLocation() {
    const lines: string[] = [];
    lines.push(`Secure context: ${window.isSecureContext ? "yes" : "NO"}`);
    lines.push(`Geolocation API: ${"geolocation" in navigator ? "yes" : "NO"}`);
    lines.push(`Standalone app: ${(navigator as Navigator & { standalone?: boolean }).standalone ? "yes" : "no"}`);
    try {
      const p = await navigator.permissions.query({ name: "geolocation" });
      lines.push(`Permission: ${p.state}`);
    } catch {
      lines.push("Permission: unknown");
    }
    setGeoTest([...lines, "Asking for a fix…"].join("\n"));
    const started = Date.now();
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeoTest([...lines, `Fix OK in ${Date.now() - started} ms: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} (±${Math.round(pos.coords.accuracy)} m)`].join("\n")),
      (err) => setGeoTest([...lines, `Fix FAILED after ${Date.now() - started} ms: code ${err.code} ${err.message}`].join("\n")),
      { enableHighAccuracy: false, maximumAge: 0, timeout: 20_000 },
    );
  }
  const fileRef = useRef<HTMLInputElement>(null);
  const udiscRef = useRef<HTMLInputElement>(null);
  const [udiscStatus, setUdiscStatus] = useState<string>("");
  const user = useUser();
  const players = usePlayers();
  const rounds = useRounds();
  const [acctMode, setAcctMode] = useState<"create" | "signin">("signin");
  const [acctUser, setAcctUser] = useState("");
  const [acctPin, setAcctPin] = useState("");
  const [acctBusy, setAcctBusy] = useState(false);
  const [acctError, setAcctError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function submitAccount(e: React.FormEvent) {
    e.preventDefault();
    setAcctBusy(true);
    setAcctError(null);
    try {
      const u = acctMode === "create" ? await register(acctUser.trim(), acctPin.trim(), me?.name ?? acctUser.trim()) : await login(acctUser.trim(), acctPin.trim());
      await adoptAccount(u);
      notify(`Signed in as ${u.username}`);
      setAcctUser("");
      setAcctPin("");
    } catch (err) {
      setAcctError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setAcctBusy(false);
    }
  }

  async function runSync() {
    setSyncing(true);
    try {
      await syncNow();
      notify("Synced");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  function roundsWith(playerId: string): number {
    return rounds.filter((r) => r.playerIds.includes(playerId)).length;
  }

  async function thisIsMe(playerId: string) {
    if (!me) return;
    const p = players.find((x) => x.id === playerId);
    if (!p || !confirm(`Treat "${p.name}" as you? Their ${roundsWith(playerId)} rounds will count toward your stats.`)) return;
    await mergePlayerInto(playerId, me.id, { name: me.name, color: me.color, isMe: true });
    notify(`Merged ${p.name} into you`);
  }

  async function importUdisc(file: File) {
    setUdiscStatus("Reading file…");
    try {
      const origin = await getSetting<LatLon | null>("lastArea", null);
      const s = await importUdiscCsv(await file.text(), origin ? { lat: origin.lat, lon: origin.lon } : null, setUdiscStatus);
      const parts = [`${s.rounds} rounds imported`];
      if (s.skipped) parts.push(`${s.skipped} already here`);
      if (s.courses) parts.push(`${s.courses} courses added`);
      if (s.players) parts.push(`${s.players} players added`);
      let msg = parts.join(", ") + ".";
      if (s.coursesNeedingLocation.length) msg += ` Set the map location for: ${s.coursesNeedingLocation.join(", ")} (open the course and tap Edit holes).`;
      setUdiscStatus(msg);
    } catch (err) {
      setUdiscStatus(err instanceof Error ? err.message : "Import failed");
    }
  }

  useEffect(() => {
    if (me) setName(me.name);
  }, [me]);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  async function saveName() {
    if (!me || !name.trim() || name.trim() === me.name) return;
    await updatePlayer(me.id, { name: name.trim() });
    notify("Name updated");
  }

  async function download() {
    const json = await exportAll();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `medisc-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function upload(file: File) {
    try {
      const res = await importAll(await file.text());
      notify(`Imported ${res.rounds} rounds`);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Import failed");
    }
  }

  return (
    <div>
      <PageHeader title="Settings" back={() => nav(-1)} />
      <Section title="You">
        <div className="flex gap-2">
          <Field name="name" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" aria-label="Your name" />
          <Button variant="brand" className="h-12" onClick={saveName} disabled={!name.trim() || name.trim() === me?.name}>
            Save
          </Button>
        </div>
      </Section>

      <Section title="Account" className="mt-6">
        {user ? (
          <div className="rounded-card bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold">@{user.username}</div>
                <div className="text-xs text-ink-3">Your rounds sync to this account.</div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={runSync} disabled={syncing}>
                  <RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> Sync
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await logout();
                    notify("Signed out. Your rounds stay on this phone.");
                  }}
                >
                  <LogOut size={14} /> Sign out
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={submitAccount} className="rounded-card bg-surface p-4 shadow-card">
            <p className="mb-3 text-sm text-ink-2">Sign in to back up your rounds and see your stats on any phone. Your existing rounds on this phone come along.</p>
            <Segmented
              value={acctMode}
              onChange={setAcctMode}
              options={[
                { value: "signin", label: "Sign in" },
                { value: "create", label: "Create account" },
              ]}
              className="mb-3"
            />
            <div className="space-y-2">
              <Field name="acctUser" value={acctUser} onChange={(e) => setAcctUser(e.target.value.toLowerCase())} placeholder="Username" autoCapitalize="none" autoCorrect="off" maxLength={24} />
              <Field name="acctPin" type="password" inputMode="numeric" pattern="[0-9]*" value={acctPin} onChange={(e) => setAcctPin(e.target.value.replace(/\D/g, ""))} placeholder="PIN (4 digits)" maxLength={8} />
            </div>
            {acctError && <p className="mt-2 text-sm text-danger">{acctError}</p>}
            <Button type="submit" variant="brand" full className="mt-3" disabled={acctBusy || !/^[a-z0-9_.-]{2,24}$/.test(acctUser.trim()) || !/^\d{4,8}$/.test(acctPin.trim())}>
              {acctMode === "create" ? "Create account" : "Sign in"}
            </Button>
          </form>
        )}
      </Section>

      <Section title="Players" className="mt-6">
        <div className="overflow-hidden rounded-card bg-surface shadow-card">
          {players
            .filter((p) => !p.isMe)
            .map((p) => (
              <div key={p.id} className="flex items-center gap-3 border-b hairline px-4 py-2.5 last:border-b-0">
                <span className="inline-grid h-8 w-8 place-items-center rounded-full text-xs font-bold text-white" style={{ background: p.color }}>
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.name}</div>
                  <div className="text-xs text-ink-3">{roundsWith(p.id)} rounds together</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => thisIsMe(p.id)} title="Count this player's rounds as yours">
                  <UserCheck size={14} /> This is me
                </Button>
              </div>
            ))}
          {players.filter((p) => !p.isMe).length === 0 && <div className="px-4 py-3 text-sm text-ink-3">No other players yet. Add them when you start a round.</div>}
        </div>
        <p className="mt-2 text-xs text-ink-3">If an import created a duplicate of you under another name, tap This is me to fold those rounds into your stats.</p>
      </Section>

      <Section title="Display" className="mt-6">
        <div className="space-y-3 rounded-card bg-surface p-4 shadow-card">
          <Row label="Distances">
            <Segmented
              value={units}
              onChange={(v) => setSetting("units", v)}
              options={[
                { value: "ft", label: "Feet & miles" },
                { value: "m", label: "Metres" },
              ]}
            />
          </Row>
          <Row label="Theme">
            <Segmented
              value={theme}
              onChange={(v) => {
                setTheme(v);
                applyTheme(v);
              }}
              options={[
                { value: "system", label: "Auto" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </Row>
          <Row label="Map">
            <Segmented
              value={satellite ? "sat" : "map"}
              onChange={(v) => setSetting("satellite", v === "sat")}
              options={[
                { value: "map", label: "Streets" },
                { value: "sat", label: "Satellite" },
              ]}
            />
          </Row>
        </div>
      </Section>

      <Section title="Import from UDisc" className="mt-6">
        <p className="mb-2 text-xs text-ink-3">In UDisc go to You, then Rounds, open the menu and choose Export CSV. Import that file here to bring in your rounds, your cardmates, and the par for every layout you have played.</p>
        <Button full variant="brand" onClick={() => udiscRef.current?.click()}>
          <FileDown size={18} /> Import UDisc CSV
        </Button>
        <input ref={udiscRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importUdisc(e.target.files[0])} />
        {udiscStatus && <p className="mt-2 rounded-card bg-surface-2 p-3 text-xs text-ink-2">{udiscStatus}</p>}
      </Section>

      <Section title="Your data" className="mt-6">
        <div className="space-y-2">
          <Button full onClick={download}>
            <Download size={18} /> Download backup
          </Button>
          <Button full onClick={() => fileRef.current?.click()}>
            <Upload size={18} /> Restore from backup
          </Button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button
            full
            variant="ghost"
            onClick={async () => {
              await clearCaches();
              notify("Course search cache cleared");
            }}
          >
            <Trash2 size={18} /> Clear course search cache
          </Button>
        </div>
        <p className="mt-3 text-xs text-ink-3">Rounds, players and courses live only in this browser. Download a backup before switching phones or clearing site data.</p>
      </Section>

      <Section title="Location check" className="mt-6">
        <Button full onClick={testLocation}>
          <LocateFixed size={18} /> Test location
        </Button>
        {geoTest && <pre className="mt-2 whitespace-pre-wrap rounded-card bg-surface-2 p-3 text-xs text-ink-2">{geoTest}</pre>}
      </Section>

      <Section title="About" className="mt-6 mb-6">
        <p className="mb-2 text-xs text-ink-3">Build {__BUILD__}</p>
        <p className="text-xs text-ink-3">
          Course data © OpenStreetMap contributors (ODbL). Course data supplied by DiscGolfAPI. Course locations may be powered by Google. Basemap by OpenFreeMap. Satellite imagery © Esri and partners. Medisc is an independent project and is not affiliated with UDisc.
        </p>
      </Section>
      <Toast message={toast} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}
