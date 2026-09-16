import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Download, Upload, Trash2 } from "lucide-react";
import { useMe, useSetting } from "@/db/hooks";
import { clearCaches, exportAll, importAll, setSetting, updatePlayer } from "@/db/repo";
import { applyTheme, getThemePref, type ThemePref } from "@/lib/theme";
import type { Units } from "@/domain/geo";
import { Button, Field, PageHeader, Section, Segmented, Toast } from "@/components/ui";

export function SettingsRoute() {
  const nav = useNavigate();
  const me = useMe();
  const units = useSetting<Units>("units", "ft");
  const satellite = useSetting<boolean>("satellite", false);
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  const [name, setName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

      <Section title="About" className="mt-6 mb-6">
        <p className="text-xs text-ink-3">
          Course data © OpenStreetMap contributors (ODbL). Course data supplied by DiscGolfAPI. Basemap by OpenFreeMap. Satellite imagery © Esri and partners. Medisc is an independent project and is not affiliated with UDisc.
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
