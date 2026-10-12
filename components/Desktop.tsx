"use client";

import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Blocks,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  ExternalLink,
  FileArchive,
  FolderOpen,
  Gamepad2,
  HardDriveDownload,
  LockKeyhole,
  LogOut,
  Mail,
  MessageCircle,
  Minus,
  Monitor,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { AdminBroadcastApp, ChatApp, MailApp } from "@/components/CommunityApps";
import { createClient } from "@/lib/supabase/client";
import { type Invite, isStaffRole, type Mod, type Profile } from "@/lib/types";

type AppId =
  | "library"
  | "schematics"
  | "profile"
  | "downloads"
  | "settings"
  | "about"
  | "admin"
  | "chat"
  | "mail";
type WindowState = {
  id: AppId;
  minimized: boolean;
  maximized: boolean;
  z: number;
  position?: { left: number; top: number };
};

const accentColor: Record<string, string> = {
  cyan: "#60e6ed",
  violet: "#b39cff",
  emerald: "#68e1a5",
  rose: "#ff8dab",
};
const apps: { id: AppId; title: string; subtitle: string; icon: typeof Gamepad2; color: string }[] =
  [
    {
      id: "library",
      title: "Mod-Bibliothek",
      subtitle: "Minecraft-Mods für deine nächste Welt",
      icon: Blocks,
      color: "#75e3ed",
    },
    {
      id: "schematics",
      title: "Schematic-Bibliothek",
      subtitle: "Baupläne und Weltvorlagen entdecken",
      icon: FileArchive,
      color: "#84baff",
    },
    {
      id: "profile",
      title: "Mein Profil",
      subtitle: "Dein persönlicher Bereich",
      icon: UserRound,
      color: "#b4a5ff",
    },
    {
      id: "downloads",
      title: "Downloads",
      subtitle: "Deine zuletzt geladenen Mods",
      icon: HardDriveDownload,
      color: "#78e5b0",
    },
    {
      id: "settings",
      title: "Einstellungen",
      subtitle: "Passe deinen Desktop an",
      icon: Settings2,
      color: "#f2bd71",
    },
    {
      id: "about",
      title: "Über MC OS",
      subtitle: "Ein Zuhause für deine Mods",
      icon: CircleHelp,
      color: "#83baff",
    },
    {
      id: "admin",
      title: "Admin Center",
      subtitle: "Plattform verwalten",
      icon: ShieldCheck,
      color: "#ff91ab",
    },
    {
      id: "chat",
      title: "Community-Chat",
      subtitle: "Freunde und MC OS Support",
      icon: MessageCircle,
      color: "#8cb7ff",
    },
    {
      id: "mail",
      title: "McOS-Mail",
      subtitle: "Dein internes System-Postfach",
      icon: Mail,
      color: "#f0bb72",
    },
  ];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Die Aktion ist fehlgeschlagen.");
  return result as T;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function Desktop({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [windows, setWindows] = useState<WindowState[]>([]);
  const [top, setTop] = useState(1);
  const [startOpen, setStartOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [search, setSearch] = useState("");
  const [supportRequest, setSupportRequest] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const availableApps = apps.filter((app) => app.id !== "admin" || isStaffRole(profile.role));
  const openApp = (id: AppId) => {
    setTop((previous) => previous + 1);
    setWindows((current) => {
      const exists = current.some((item) => item.id === id);
      if (!exists) return [...current, { id, minimized: false, maximized: false, z: top + 1 }];
      return current.map((item) =>
        item.id === id ? { ...item, minimized: false, z: top + 1 } : item,
      );
    });
    setStartOpen(false);
    setSearch("");
  };
  const closeApp = (id: AppId) => setWindows((current) => current.filter((item) => item.id !== id));
  const focusApp = (id: AppId) => {
    setTop((previous) => previous + 1);
    setWindows((current) =>
      current.map((item) =>
        item.id === id ? { ...item, minimized: !item.minimized, z: top + 1 } : item,
      ),
    );
  };
  const patchWindow = (id: AppId, patch: Partial<WindowState>) =>
    setWindows((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  function startWindowDrag(event: React.PointerEvent<HTMLElement>, id: AppId, maximized: boolean) {
    if (maximized || (event.target as HTMLElement).closest("button")) return;
    const element = event.currentTarget.parentElement;
    if (!element) return;
    event.preventDefault();
    const rect = element.getBoundingClientRect();
    const pointerX = event.clientX;
    const pointerY = event.clientY;
    const originLeft = rect.left;
    const originTop = rect.top;
    const move = (moveEvent: PointerEvent) => {
      const left = Math.max(
        4,
        Math.min(window.innerWidth - rect.width - 4, originLeft + moveEvent.clientX - pointerX),
      );
      const top = Math.max(
        48,
        Math.min(window.innerHeight - rect.height - 57, originTop + moveEvent.clientY - pointerY),
      );
      setWindows((current) =>
        current.map((item) => (item.id === id ? { ...item, position: { left, top } } : item)),
      );
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main
      className={`desktop wallpaper-${profile.settings?.wallpaper ?? "aurora"}`}
      style={
        {
          "--accent": accentColor[profile.settings?.accent ?? "cyan"] ?? accentColor.cyan,
        } as React.CSSProperties
      }
    >
      <div className="desktop-noise" />
      <div className="desktop-glow glow-a" />
      <div className="desktop-glow glow-b" />
      <div className="desktop-topbar">
        <div className="desktop-wordmark">
          <span className="mini-mark">MC</span>
          <span>OS</span>
          <i>PRIVATE SPACE</i>
        </div>
        <div className="topbar-status">
          <span className="status-dot" /> SYSTEM ONLINE <span className="topbar-separator">/</span>{" "}
          {profile.username.toUpperCase()}
        </div>
        <button className="topbar-logout" onClick={signOut} aria-label="Abmelden">
          <LogOut size={15} />
          <span>Abmelden</span>
        </button>
      </div>
      <section className="desktop-icons" aria-label="Anwendungen">
        {availableApps
          .filter((app) => app.id !== "admin")
          .map((app, index) => (
            <button
              className={`desktop-icon icon-pos-${index}`}
              key={app.id}
              onDoubleClick={() => openApp(app.id)}
              onClick={() => openApp(app.id)}
              aria-label={`${app.title} öffnen`}
            >
              <span
                className="desktop-icon-picture"
                style={{ "--icon-color": app.color } as React.CSSProperties}
              >
                <app.icon size={23} strokeWidth={1.6} />
              </span>
              <span>{app.title}</span>
            </button>
          ))}
      </section>

      <div className="desktop-welcome">
        <div className="welcome-kicker">
          <Sparkles size={13} /> DEIN PERSÖNLICHER MOD-DESKTOP
        </div>
        <h1>
          Gute Welten
          <br />
          <span>beginnen hier.</span>
        </h1>
        <p>
          Hallo, {profile.username}. Entdecke Mods, die deine nächste Minecraft-Welt besonders
          machen, und öffne die Schematic-Bibliothek für Baupläne.
        </p>
        <button className="welcome-link" onClick={() => openApp("library")}>
          Bibliothek öffnen <ArrowRight size={14} />
        </button>
      </div>

      {windows
        .filter((item) => !item.minimized)
        .map((item) => {
          const app = apps.find((entry) => entry.id === item.id);
          if (!app) return null;
          return (
            <section
              className={`app-window ${item.maximized ? "window-maximized" : ""} ${item.position ? "window-positioned" : ""}`}
              style={{
                zIndex: item.z,
                ...(item.position ? { left: item.position.left, top: item.position.top } : {}),
              }}
              key={item.id}
              role="dialog"
              aria-label={app.title}
            >
              <header
                className="window-titlebar"
                onPointerDown={(event) => startWindowDrag(event, item.id, item.maximized)}
              >
                <span
                  className="window-app-icon"
                  style={{ "--icon-color": app.color } as React.CSSProperties}
                >
                  <app.icon size={15} />
                </span>
                <span className="window-title">{app.title}</span>
                {(item.id === "library" || item.id === "schematics") && (
                  <span className="window-title-hint">MC OS / LIBRARY</span>
                )}
                <div className="window-controls">
                  <button
                    onClick={() => patchWindow(item.id, { minimized: true })}
                    aria-label="Minimieren"
                  >
                    <Minus size={14} />
                  </button>
                  <button
                    onClick={() => patchWindow(item.id, { maximized: !item.maximized })}
                    aria-label={item.maximized ? "Wiederherstellen" : "Maximieren"}
                  >
                    <span className={item.maximized ? "restore-glyph" : "maximize-glyph"} />
                  </button>
                  <button
                    className="window-close"
                    onClick={() => closeApp(item.id)}
                    aria-label="Schließen"
                  >
                    <X size={15} />
                  </button>
                </div>
              </header>
              <div className="window-body">
                {item.id === "library" && (
                  <LibraryApp
                    profile={profile}
                    assetType="mod"
                    onOpenSupport={() => {
                      openApp("chat");
                      if (!isStaffRole(profile.role)) setSupportRequest((count) => count + 1);
                    }}
                  />
                )}
                {item.id === "schematics" && (
                  <LibraryApp
                    profile={profile}
                    assetType="schematic"
                    onOpenSupport={() => {
                      openApp("chat");
                      if (!isStaffRole(profile.role)) setSupportRequest((count) => count + 1);
                    }}
                  />
                )}
                {item.id === "profile" && <ProfileApp profile={profile} />}
                {item.id === "downloads" && <DownloadsApp />}
                {item.id === "settings" && <SettingsApp profile={profile} />}
                {item.id === "about" && <AboutApp />}
                {item.id === "admin" && isStaffRole(profile.role) && <AdminApp profile={profile} />}
                {item.id === "chat" && (
                  <ChatApp profile={profile} supportRequest={supportRequest} />
                )}
                {item.id === "mail" && <MailApp profile={profile} />}
              </div>
            </section>
          );
        })}

      {startOpen && (
        <div className="start-menu">
          <div className="start-user">
            <span className="avatar-small">{profile.username.slice(0, 1).toUpperCase()}</span>
            <div>
              <strong>{profile.username}</strong>
              <small>
                {profile.role === "owner" || profile.role === "admin"
                  ? "Owner"
                  : profile.role === "co_owner"
                    ? "Co-Owner"
                    : "MC OS Nutzer"}
              </small>
            </div>
            <button onClick={signOut} aria-label="Abmelden">
              <LogOut size={16} />
            </button>
          </div>
          <div className="start-search">
            <Search size={15} />
            <input
              placeholder="Anwendung suchen"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="start-menu-label">
            ANGEHEFTET{" "}
            <span>
              Alle Anwendungen <ChevronDown size={12} />
            </span>
          </div>
          <div className="start-app-grid">
            {availableApps
              .filter((app) => app.title.toLowerCase().includes(search.toLowerCase()))
              .map((app) => (
                <button key={app.id} onClick={() => openApp(app.id)}>
                  <app.icon size={20} style={{ color: app.color }} />
                  <span>{app.title}</span>
                </button>
              ))}
          </div>
          <div className="start-footer">
            <span>
              <Sparkles size={13} /> MC OS · PRIVATE MOD SPACE
            </span>
            <button onClick={signOut} aria-label="Abmelden">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      )}

      {quickOpen && (
        <div className="quick-panel">
          <div className="quick-panel-top">
            <span>System</span>
            <button onClick={() => setQuickOpen(false)} aria-label="Schließen">
              <X size={15} />
            </button>
          </div>
          <div className="quick-tiles">
            <div>
              <span className="quick-active">
                <Monitor size={16} />
              </span>
              <span>
                WLAN
                <br />
                <small>Verbunden</small>
              </span>
            </div>
            <div>
              <span>
                <Sparkles size={16} />
              </span>
              <span>
                Nachtmodus
                <br />
                <small>Bereit</small>
              </span>
            </div>
            <div>
              <span>
                <LockKeyhole size={16} />
              </span>
              <span>
                Privater Bereich
                <br />
                <small>Geschützt</small>
              </span>
            </div>
          </div>
          <div className="quick-note">Deine Sitzung ist verschlüsselt und aktiv.</div>
        </div>
      )}

      <footer className="taskbar">
        <button
          className={`taskbar-start ${startOpen ? "taskbar-start-active" : ""}`}
          onClick={() => {
            setStartOpen(!startOpen);
            setQuickOpen(false);
          }}
          aria-label="Startmenü"
        >
          <span className="taskbar-logo">
            <i />
            <i />
            <i />
            <i />
          </span>
        </button>
        <button
          className="taskbar-search"
          onClick={() => {
            setStartOpen(true);
            setQuickOpen(false);
          }}
        >
          <Search size={15} />
          <span>Suchen</span>
        </button>
        <div className="taskbar-divider" />
        <button
          className="taskbar-pinned"
          onClick={() => openApp("library")}
          aria-label="Mod-Bibliothek"
        >
          <Blocks size={19} />
        </button>
        <button
          className="taskbar-pinned"
          onClick={() => openApp("schematics")}
          aria-label="Schematic-Bibliothek"
        >
          <FileArchive size={18} />
        </button>
        <div className="taskbar-running">
          {windows.map((item) => {
            const app = apps.find((entry) => entry.id === item.id);
            if (!app) return null;
            return (
              <button
                key={item.id}
                className={`taskbar-app ${!item.minimized ? "taskbar-app-active" : ""}`}
                onClick={() => focusApp(item.id)}
                aria-label={app.title}
              >
                <app.icon size={17} />
                <i />
              </button>
            );
          })}
        </div>
        <div className="taskbar-right">
          <button
            className="tray-button"
            onClick={() => {
              setQuickOpen(!quickOpen);
              setStartOpen(false);
            }}
            aria-label="Schnelleinstellungen"
          >
            <ChevronDown size={13} />
            <span className="wifi-glyph">◉</span>
            <span>◖</span>
          </button>
          <button className="clock-button" onClick={() => openApp("downloads")}>
            <span>{clock.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
            <small>
              {clock.toLocaleDateString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </small>
          </button>
        </div>
      </footer>
      <a
        className="discord-float"
        href="https://discord.gg/TTGzMyBUu5"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="MC OS Discord-Server öffnen"
      >
        <MessageCircle size={17} />
        <span>Discord</span>
        <ExternalLink size={12} />
      </a>
      <div className="desktop-copyright">
        MC OS <span>·</span> NOT AN OPERATING SYSTEM. JUST YOUR MOD SPACE.
      </div>
    </main>
  );
}

function AppHeading({
  eyebrow,
  title,
  subtitle,
  trailing,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="app-heading">
      <div>
        <div className="app-eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {trailing}
    </div>
  );
}

function LibraryApp({
  profile,
  assetType,
  onOpenSupport,
}: {
  profile: Profile;
  assetType: "mod" | "schematic";
  onOpenSupport: () => void;
}) {
  const [mods, setMods] = useState<Mod[]>([]);
  const [search, setSearch] = useState("");
  const [loader, setLoader] = useState("");
  const [version, setVersion] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<Mod | null>(null);
  const [error, setError] = useState("");
  const [busyVersion, setBusyVersion] = useState("");
  const [showProPromo, setShowProPromo] = useState(true);

  const refreshMods = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("type", assetType);
    try {
      const result = await requestJson<Mod[]>(`/api/mods?${params}`, { cache: "no-store" });
      setMods(result);
      setSelected((current) =>
        current ? (result.find((mod) => mod.id === current.id) ?? null) : current,
      );
      setError("");
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, [search, assetType]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshMods(), 180);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshMods();
    };
    const refreshOnPublish = () => void refreshMods();
    const interval = window.setInterval(refreshWhenVisible, 30_000);
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("mcos:mods-updated", refreshOnPublish);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("mcos:mods-updated", refreshOnPublish);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshMods]);

  const categories = Array.from(new Set(mods.map((mod) => mod.category)));
  const minecraftVersions = Array.from(
    new Set(mods.flatMap((mod) => mod.mod_versions.map((item) => item.minecraft_version))),
  ).sort((first, second) => second.localeCompare(first, undefined, { numeric: true }));
  const visibleMods = useMemo(
    () =>
      mods
        .map((mod) => ({
          ...mod,
          mod_versions: mod.mod_versions.filter(
            (item) =>
              (!loader || item.loaders.includes(loader)) &&
              (!version || item.minecraft_version === version),
          ),
        }))
        .filter(
          (mod) =>
            ((!loader && !version) || mod.mod_versions.length > 0) &&
            (!category || mod.category === category),
        ),
    [mods, loader, version, category],
  );
  async function download(versionId: string) {
    setError("");
    setBusyVersion(versionId);
    try {
      const result = await requestJson<{ url: string }>("/api/downloads", {
        method: "POST",
        body: JSON.stringify({ versionId }),
      });
      window.location.assign(result.url);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusyVersion("");
    }
  }

  return (
    <div className="app-content">
      <AppHeading
        eyebrow="DEINE MODS"
        title={assetType === "mod" ? "Mod-Bibliothek" : "Schematics"}
        subtitle={
          assetType === "mod"
            ? "Durchsuche handverlesene Mods für deine nächste Minecraft-Welt."
            : "Entdecke veröffentlichte Baupläne und Weltvorlagen."
        }
        trailing={
          <div className="library-count">
            {assetType === "mod" ? <Blocks size={15} /> : <FileArchive size={15} />}{" "}
            {visibleMods.length} {assetType === "mod" ? "MODS" : "SCHEMATICS"}
          </div>
        }
      />
      {!profile.premium && !isStaffRole(profile.role) && showProPromo && (
        <aside className="pro-floating-promo" aria-label="MC OS PRO Upgrade">
          <button
            className="pro-floating-close"
            type="button"
            onClick={() => setShowProPromo(false)}
            aria-label="PRO-Werbung schließen"
          >
            <X size={14} />
          </button>
          <span className="pro-library-icon">
            <Sparkles size={17} />
          </span>
          <div className="pro-library-copy">
            <strong>Mehr mit MC OS PRO</strong>
            <p>
              PRO-exklusive Inhalte sind sichtbar und mit einem Schloss markiert. PRO wird nach
              deiner Anfrage durch Owner oder Co-Owner freigeschaltet.
            </p>
          </div>
          <div className="pro-library-actions">
            <a
              className="pro-library-discord"
              href="https://discord.gg/TTGzMyBUu5"
              target="_blank"
              rel="noopener noreferrer"
            >
              Discord <ExternalLink size={13} />
            </a>
            <button className="pro-library-support" onClick={onOpenSupport}>
              Support-Chat <MessageCircle size={13} />
            </button>
          </div>
        </aside>
      )}
      <div className="library-toolbar">
        <label className="library-search">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={assetType === "mod" ? "Mods durchsuchen" : "Schematics durchsuchen"}
          />
        </label>
        <select
          value={version}
          onChange={(event) => setVersion(event.target.value)}
          aria-label="Minecraft-Version"
        >
          <option value="">Alle Versionen</option>
          {minecraftVersions.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        {assetType === "mod" && (
          <select
            value={loader}
            onChange={(event) => setLoader(event.target.value)}
            aria-label="Modloader"
          >
            <option value="">Alle Loader</option>
            {["Fabric", "Forge", "NeoForge", "Quilt"].map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        )}
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Kategorie"
        >
          <option value="">Alle Kategorien</option>
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {visibleMods.length === 0 ? (
        <div className="empty-state">
          <span>{assetType === "mod" ? <Blocks size={25} /> : <FileArchive size={25} />}</span>
          <h3>
            {mods.length === 0
              ? assetType === "mod"
                ? "Noch keine Mods hier."
                : "Noch keine Schematics hier."
              : "Keine passenden Einträge gefunden."}
          </h3>
          <p>
            {mods.length === 0
              ? assetType === "mod"
                ? "Sobald der Admin Mods veröffentlicht, findest du sie in deiner Bibliothek."
                : "Sobald der Admin Schematics veröffentlicht, erscheinen sie hier."
              : "Ändere deine Suche oder Filter, um weitere Mods zu sehen."}
          </p>
        </div>
      ) : (
        <div className="mod-grid">
          {visibleMods.map((mod, index) => {
            const hasProRelease = mod.mod_versions.some((item) => item.premium_only);
            return (
              <button className="mod-card" key={mod.id} onClick={() => setSelected(mod)}>
                <div className={`mod-art mod-art-${index % 5}`}>
                  {mod.image_url ? (
                    <div
                      className="mod-art-image"
                      role="img"
                      aria-label={`${mod.name} Vorschaubild`}
                      style={{ backgroundImage: `url(${JSON.stringify(mod.image_url)})` }}
                    />
                  ) : (
                    <div className="mod-art-glow">
                      {assetType === "mod" ? <Blocks size={28} /> : <FileArchive size={28} />}
                    </div>
                  )}
                  <span className="mod-category">{mod.category}</span>
                  {hasProRelease && (
                    <span className="mod-pro-badge">
                      <LockKeyhole size={11} /> PRO
                    </span>
                  )}
                  <span className="mod-art-index">MC / {String(index + 1).padStart(2, "0")}</span>
                </div>
                <div className="mod-card-content">
                  <div className="mod-card-title">
                    <h3>{mod.name}</h3>
                    <ArrowRight size={15} />
                  </div>
                  <p>{mod.description || "Eine neue Ergänzung für dein Minecraft-Erlebnis."}</p>
                  <div className="mod-card-meta">
                    <span>{mod.mod_versions[0]?.minecraft_version ?? "Noch keine Version"}</span>
                    <span>
                      {mod.mod_versions.length === 0
                        ? "Noch nicht veröffentlicht"
                        : assetType === "mod"
                          ? (mod.mod_versions[0]?.loaders?.join(" · ") ?? "—")
                          : "Schematics-Datei"}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      {selected && (
        <div className="modal-backdrop">
          <section
            className="mod-detail"
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.name} Details`}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSelected(null);
            }}
          >
            <button
              className="modal-close"
              onClick={() => setSelected(null)}
              aria-label="Schließen"
            >
              <X size={16} />
            </button>
            <span className="app-eyebrow">
              {selected.asset_type === "schematic" ? "SCHEMATIC" : selected.category.toUpperCase()}{" "}
              / MC OS
            </span>
            <h2>{selected.name}</h2>
            <p className="mod-detail-description">
              {selected.description || "Keine Beschreibung verfügbar."}
            </p>
            <div className="detail-versions">
              <span className="detail-label">VERÖFFENTLICHUNGEN</span>
              {selected.mod_versions.map((item) => (
                <div
                  className={`version-row ${
                    item.premium_only && !profile.premium && !isStaffRole(profile.role)
                      ? "version-row-locked"
                      : ""
                  }`}
                  key={item.id}
                >
                  <div>
                    <strong>v{item.version}</strong>
                    <small>
                      Minecraft {item.minecraft_version}
                      {selected.asset_type === "mod" && item.loaders.length
                        ? ` · ${item.loaders.join(", ")}`
                        : ""}
                      {" · "}
                      {formatSize(item.file_size)}
                      {item.premium_only ? " · PRO" : ""}
                    </small>
                    {item.premium_only && (
                      <span className="version-access-badge">
                        <LockKeyhole size={11} /> Nur für MC OS PRO
                      </span>
                    )}
                    <p>{item.changelog}</p>
                  </div>
                  <button
                    className="download-button"
                    onClick={() => download(item.id)}
                    disabled={
                      busyVersion === item.id ||
                      (item.premium_only && !profile.premium && !isStaffRole(profile.role))
                    }
                    title={
                      item.premium_only && !profile.premium && !isStaffRole(profile.role)
                        ? "Diese Version kann nur mit MC OS PRO heruntergeladen werden."
                        : undefined
                    }
                  >
                    {busyVersion === item.id ? (
                      "…"
                    ) : item.premium_only && !profile.premium && !isStaffRole(profile.role) ? (
                      <>
                        <LockKeyhole size={14} /> PRO erforderlich
                      </>
                    ) : (
                      <>
                        <Download size={15} /> Download
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>
            {selected.mod_versions.length === 0 && (
              <div className="empty-inline">
                Für diesen Eintrag wurde noch keine Veröffentlichung angelegt.
              </div>
            )}
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function ProfileApp({ profile }: { profile: Profile }) {
  const [premium, setPremium] = useState(profile.premium);
  const canEdit = premium || isStaffRole(profile.role);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url ?? "");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    requestJson<{
      username: string;
      bio: string;
      premium: boolean;
      avatarUrl: string | null;
    }>("/api/profile")
      .then((current) => {
        setUsername(current.username);
        setBio(current.bio);
        setPremium(current.premium);
        setAvatarUrl(current.avatarUrl ?? "");
      })
      .catch((reason: Error) => setProfileError(reason.message));
  }, []);

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setProfileMessage("");
    setProfileError("");
    try {
      const updated = await requestJson<{
        username: string;
        bio: string;
        premium: boolean;
        avatarUrl: string | null;
      }>("/api/profile", { method: "PATCH", body: JSON.stringify({ username, bio }) });
      setUsername(updated.username);
      setBio(updated.bio);
      setPremium(updated.premium);
      setProfileMessage("Profil gespeichert.");
      window.setTimeout(() => window.location.reload(), 400);
    } catch (reason) {
      setProfileError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file?: File) {
    if (!file) return;
    setProfileError("");
    setProfileMessage("");
    setSaving(true);
    try {
      const form = new FormData();
      form.set("avatar", file);
      const response = await fetch("/api/profile", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Profilbild konnte nicht gespeichert werden.");
      setAvatarUrl(result.avatarUrl ?? "");
      setProfileMessage("Profilbild aktualisiert.");
    } catch (reason) {
      setProfileError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-content">
      <AppHeading
        eyebrow="DEIN KONTO"
        title="Mein Profil"
        subtitle="Dein persönlicher Zugang zu MC OS."
      />
      <div className="profile-card">
        <div className="profile-avatar">
          {avatarUrl ? (
            <span
              role="img"
              aria-label={`${username} Profilbild`}
              style={{ backgroundImage: `url(${JSON.stringify(avatarUrl)})` }}
            />
          ) : (
            username.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="profile-main">
          <span className="profile-status">
            <i /> {profile.status === "active" ? "AKTIV" : "GESPERRT"}
          </span>
          <h3>{username}</h3>
          <p>
            {isStaffRole(profile.role)
              ? profile.role === "co_owner"
                ? "Co-Owner"
                : "Owner"
              : profile.premium
                ? "MC OS PRO"
                : "MC OS Mitglied"}
          </p>
        </div>
        <div className="profile-badge">
          <ShieldCheck size={17} /> {profile.premium ? "MC OS PRO" : "PRIVATE ACCOUNT"}
        </div>
      </div>
      <div className="profile-details">
        <div>
          <span>BENUTZER-ID</span>
          <strong className="mono-value">{profile.id}</strong>
          <button
            className="copy-user-id"
            onClick={() => void navigator.clipboard.writeText(profile.id)}
            type="button"
          >
            Benutzer-ID kopieren
          </button>
        </div>
        <div>
          <span>MITGLIED SEIT</span>
          <strong>{dateLabel(profile.created_at)}</strong>
        </div>
        <div>
          <span>ROLLE</span>
          <strong>
            {profile.role === "owner" || profile.role === "admin"
              ? "Owner"
              : profile.role === "co_owner"
                ? "Co-Owner"
                : "Mitglied"}
          </strong>
        </div>
        <div>
          <span>KONTOSTATUS</span>
          <strong className="status-green">Geschützt & aktiv</strong>
        </div>
      </div>
      <div className="profile-note">
        <LockKeyhole size={16} />
        <span>Deine Zugangsdaten und privaten Mod-Downloads sind nur für dich sichtbar.</span>
      </div>
      {canEdit ? (
        <form className="profile-edit-form" onSubmit={saveProfile}>
          <div className="admin-form-title">
            <UserRound size={15} />
            <strong>Profil bearbeiten · PRO</strong>
          </div>
          <label>
            Benutzername
            <input
              value={username}
              minLength={3}
              maxLength={24}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label>
            Über mich
            <textarea
              rows={3}
              value={bio}
              maxLength={280}
              onChange={(event) => setBio(event.target.value)}
              placeholder="Ein kurzer Text über dich"
            />
          </label>
          <label className="avatar-file">
            Profilbild (JPEG, PNG oder WebP; max. 5 MB)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => void uploadAvatar(event.target.files?.[0])}
              disabled={saving}
            />
          </label>
          {profileError && (
            <p className="inline-error" role="alert">
              {profileError}
            </p>
          )}
          {profileMessage && (
            <p className="inline-success" role="status">
              {profileMessage}
            </p>
          )}
          <button className="admin-action-button" disabled={saving}>
            {saving ? "Speichert …" : "Profil speichern"} <Check size={14} />
          </button>
        </form>
      ) : (
        <div className="pro-upsell">
          <Sparkles size={16} />
          <span>
            <strong>Profil bearbeiten und Profilbild nutzen</strong>
            <small>MC OS PRO wird von einem Admin freigeschaltet.</small>
          </span>
        </div>
      )}
    </div>
  );
}

type DownloadRow = {
  id: string;
  downloaded_at: string;
  mod_versions: {
    version: string;
    minecraft_version: string;
    mods: { name: string; slug: string } | null;
  } | null;
};

function DownloadsApp() {
  const [items, setItems] = useState<DownloadRow[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    requestJson<DownloadRow[]>("/api/downloads")
      .then(setItems)
      .catch((reason: Error) => setError(reason.message));
  }, []);
  return (
    <div className="app-content">
      <AppHeading
        eyebrow="DEIN VERLAUF"
        title="Downloads"
        subtitle="Hier findest du deine zuletzt heruntergeladenen Dateien."
        trailing={<span className="subtle-count">{items.length} EINTRÄGE</span>}
      />
      {error && <p className="inline-error">{error}</p>}
      {items.length === 0 ? (
        <div className="empty-state">
          <span>
            <FolderOpen size={24} />
          </span>
          <h3>Dein Download-Ordner ist leer.</h3>
          <p>Wenn du eine Mod herunterlädst, wird sie hier für dich gespeichert.</p>
        </div>
      ) : (
        <div className="download-list">
          {items.map((item) => (
            <div className="download-entry" key={item.id}>
              <span className="file-icon">
                <FileArchive size={18} />
              </span>
              <span className="download-entry-name">
                <strong>{item.mod_versions?.mods?.name ?? "Mod-Datei"}</strong>
                <small>
                  v{item.mod_versions?.version} · Minecraft {item.mod_versions?.minecraft_version}
                </small>
              </span>
              <span className="download-date">{dateLabel(item.downloaded_at)}</span>
              <Check size={15} className="download-check" />
            </div>
          ))}
        </div>
      )}
      <p className="privacy-note">
        <LockKeyhole size={13} /> Dein Verlauf ist privat und nur für dich einsehbar.
      </p>
    </div>
  );
}

function SettingsApp({ profile }: { profile: Profile }) {
  const [accent, setAccent] = useState(profile.settings?.accent ?? "cyan");
  const [wallpaper, setWallpaper] = useState(profile.settings?.wallpaper ?? "aurora");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setError("");
    try {
      await requestJson("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ accent, wallpaper }),
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2200);
      window.location.reload();
    } catch (reason) {
      setError((reason as Error).message);
    }
  }
  return (
    <div className="app-content">
      <AppHeading
        eyebrow="PERSONALISIERUNG"
        title="Einstellungen"
        subtitle="Mach deinen Desktop zu deinem eigenen Ort."
      />
      <div className="settings-section">
        <h3>Akzentfarbe</h3>
        <p>Farbe für Highlights und aktive Elemente.</p>
        <div className="accent-options">
          {Object.entries(accentColor).map(([name, color]) => (
            <button
              key={name}
              className={`accent-option ${accent === name ? "selected" : ""}`}
              onClick={() => setAccent(name)}
              aria-label={`${name} auswählen`}
              style={{ "--swatch": color } as React.CSSProperties}
            >
              {accent === name && <Check size={15} />}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section">
        <h3>Desktop-Hintergrund</h3>
        <p>Wähle eine Atmosphäre für deinen Workspace.</p>
        <div className="wallpaper-options">
          {[
            ["aurora", "Aurora"],
            ["midnight", "Midnight"],
            ["grid", "Grid"],
          ].map(([id, title]) => (
            <button
              key={id}
              className={`wallpaper-option wallpaper-preview-${id} ${wallpaper === id ? "selected" : ""}`}
              onClick={() => setWallpaper(id)}
            >
              <span>{title}</span>
              {wallpaper === id && <Check size={14} />}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="inline-error">{error}</p>}
      <button className="primary-button save-settings" onClick={save}>
        {saved ? (
          <>
            <Check size={15} /> Gespeichert
          </>
        ) : (
          "Änderungen speichern"
        )}
      </button>
    </div>
  );
}

function AboutApp() {
  return (
    <div className="app-content">
      <AppHeading
        eyebrow="PLATTFORM / ÜBERBLICK"
        title="Über MC OS"
        subtitle="Was MC OS ist, wie die Plattform funktioniert und was du hier findest."
      />
      <div className="about-hero">
        <div className="about-emblem">
          <span>MC</span>
          <i>OS</i>
        </div>
        <div className="about-hero-copy">
          <div className="app-eyebrow">YOUR MOD SPACE</div>
          <h3>
            Dein privater Workspace
            <br />
            <span>für Minecraft-Inhalte.</span>
          </h3>
          <p>
            Bibliothek, Community und deine Downloads – übersichtlich an einem Ort und direkt im
            Browser erreichbar.
          </p>
        </div>
      </div>
      <p className="about-copy">
        <strong>
          MC OS ist eine private, browserbasierte Plattform für Minecraft-Mods und Schematics.
        </strong>{" "}
        Der Windows-inspirierte Desktop ist die Benutzeroberfläche einer Website: MC OS ist weder
        ein echtes Betriebssystem noch ein Minecraft-Launcher und installiert keine Dateien
        automatisch in deinem Spiel. Du lädst veröffentlichte Dateien herunter und installierst sie
        selbst in deiner Minecraft-Umgebung.
      </p>
      <h3 className="about-section-title">Was du mit MC OS machen kannst</h3>
      <div className="about-points">
        <div>
          <Blocks size={18} />
          <span>
            <strong>Mod-Bibliothek</strong>
            <small>Mods suchen und nach Version, Loader und Kategorie filtern.</small>
          </span>
        </div>
        <div>
          <FileArchive size={18} />
          <span>
            <strong>Schematic-Bibliothek</strong>
            <small>Baupläne entdecken und unterstützte Dateien herunterladen.</small>
          </span>
        </div>
        <div>
          <Gamepad2 size={17} />
          <span>
            <strong>Versionsinfos</strong>
            <small>Minecraft-Version, Loader, Release-Notizen und Dateigröße ansehen.</small>
          </span>
        </div>
        <div>
          <Users size={18} />
          <span>
            <strong>Community-Chat</strong>
            <small>Freunde per Benutzer-ID hinzufügen und privat chatten.</small>
          </span>
        </div>
        <div>
          <Mail size={18} />
          <span>
            <strong>McOS-Mail</strong>
            <small>Interne Systemnachrichten zu Konto und neuen Veröffentlichungen.</small>
          </span>
        </div>
        <div>
          <Settings2 size={18} />
          <span>
            <strong>Dein Desktop</strong>
            <small>Fenster verschieben und Akzentfarbe sowie Hintergrund anpassen.</small>
          </span>
        </div>
      </div>
      <div className="about-info-grid">
        <section className="about-info-card">
          <span className="about-info-icon">
            <ShieldCheck size={17} />
          </span>
          <div>
            <h4>Zugang und Kontoschutz</h4>
            <p>
              Der Zugang ist geschlossen und erfolgt über Einladung. Anmeldung, Berechtigungen und
              Download-Freigaben werden serverseitig geprüft. Private Dateien sind nicht als
              öffentliche Links abgelegt.
            </p>
          </div>
        </section>
        <section className="about-info-card">
          <span className="about-info-icon">
            <Sparkles size={17} />
          </span>
          <div>
            <h4>PRO-Inhalte und Freischaltung</h4>
            <p>
              Veröffentlichungen können für alle Mitglieder oder nur für PRO freigegeben sein. PRO
              wird manuell durch Owner oder Co-Owner erteilt; MC OS bietet derzeit keinen
              automatischen Kauf oder Zahlungsprozess.
            </p>
          </div>
        </section>
        <section className="about-info-card">
          <span className="about-info-icon">
            <MessageCircle size={17} />
          </span>
          <div>
            <h4>Support und Anrufe</h4>
            <p>
              Support-Anfragen werden in MC OS von Ownern und Co-Ownern beantwortet. Audio- und
              Videoanrufe sind für direkte Freundes-Chats verfügbar und öffnen einen externen
              Jitsi-Raum; im Support-Chat gibt es keine Anruffunktion.
            </p>
          </div>
        </section>
        <section className="about-info-card">
          <span className="about-info-icon">
            <UserRound size={17} />
          </span>
          <div>
            <h4>Profil und Einstellungen</h4>
            <p>
              Du kannst deine Kontoinformationen und persönlichen Desktop-Einstellungen ansehen.
              Profilbearbeitung und Profilbild sind PRO-Funktionen. Dein Download-Verlauf ist an
              dein Konto gebunden.
            </p>
          </div>
        </section>
      </div>
      <section className="about-admin-note">
        <div className="about-info-icon">
          <HardDriveDownload size={17} />
        </div>
        <div>
          <h4>Veröffentlichungen und Dateisicherheit</h4>
          <p>
            Nur Owner und Co-Owner können Mods, Schematics und neue Versionen veröffentlichen.
            Dateien werden in privatem Speicher abgelegt und vor der Freigabe auf grundlegende
            Dateiformat-Merkmale geprüft. Das ersetzt keine vollständige Malware-Prüfung. Prüfe
            heruntergeladene Dateien verantwortungsvoll und verwende sie nur mit passenden
            Minecraft-Versionen und Loadern.
          </p>
        </div>
      </section>
      <p className="about-footnote">
        MC OS ist ein unabhängiges Community-Projekt. Minecraft und die genannten Loader sind Marken
        ihrer jeweiligen Rechteinhaber; MC OS ist kein offizielles Mojang- oder Microsoft-Produkt.
      </p>
      <div className="about-version">
        MC OS <span>·</span> PRIVATE MOD PLATFORM <span>·</span> BROWSER-WORKSPACE
      </div>
    </div>
  );
}

type AdminTab = "mods" | "invites" | "users" | "activity" | "support" | "mail";
type AdminUser = {
  id: string;
  username: string;
  email: string;
  role: Profile["role"];
  status: string;
  created_at: string;
  premium: boolean;
};
type AdminStats = {
  profiles: number;
  mods: number;
  versions: number;
  downloads: number;
  activity: {
    id: number;
    actor_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    created_at: string;
  }[];
};

function AdminApp({ profile }: { profile: Profile }) {
  const [tab, setTab] = useState<AdminTab>("mods");
  const [mods, setMods] = useState<Mod[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [selectedMod, setSelectedMod] = useState("");
  const [newMod, setNewMod] = useState({
    name: "",
    description: "",
    category: "Utility",
    imageUrl: "",
    assetType: "mod" as "mod" | "schematic",
  });
  const [versionData, setVersionData] = useState({
    version: "",
    minecraftVersion: "",
    loaders: ["Fabric"],
    changelog: "",
    premiumOnly: false,
    published: true,
  });
  const [jar, setJar] = useState<File | null>(null);
  const [newAssetFile, setNewAssetFile] = useState<File | null>(null);
  const [editor, setEditor] = useState<
    Record<
      string,
      {
        name: string;
        description: string;
        category: string;
        imageUrl: string;
        active: boolean;
      }
    >
  >({});

  const load = useCallback(async () => {
    try {
      const [modData, inviteData, userData, statsData] = await Promise.all([
        requestJson<Mod[]>("/api/admin/mods"),
        requestJson<Invite[]>("/api/admin/invitations"),
        requestJson<AdminUser[]>("/api/admin/users"),
        requestJson<AdminStats>("/api/admin/stats"),
      ]);
      setMods(modData);
      setInvites(inviteData);
      setUsers(userData);
      setStats(statsData);
      setEditor(
        Object.fromEntries(
          modData.map((mod) => [
            mod.id,
            {
              name: mod.name,
              description: mod.description,
              category: mod.category,
              imageUrl: mod.image_url ?? "",
              active: mod.active,
            },
          ]),
        ),
      );
      setSelectedMod((current) => current || modData[0]?.id || "");
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await action();
      const warning =
        typeof result === "object" &&
        result !== null &&
        "warning" in result &&
        typeof result.warning === "string"
          ? ` ${result.warning}`
          : "";
      setMessage(`${success}${warning}`);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createMod(event: FormEvent) {
    event.preventDefault();
    if (!newAssetFile) {
      setError(
        newMod.assetType === "mod"
          ? "Wähle eine JAR-Datei für die erste Veröffentlichung aus."
          : "Wähle eine Schematic-Datei für die erste Veröffentlichung aus.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const file = newAssetFile;
      const created = await requestJson<Mod>("/api/admin/mods", {
        method: "POST",
        body: JSON.stringify(newMod),
      });
      setSelectedMod(created.id);
      setJar(file);
      setNewMod({
        name: "",
        description: "",
        category: "Utility",
        imageUrl: "",
        assetType: "mod",
      });
      setNewAssetFile(null);
      const newFileInput = document.getElementById("new-asset-upload") as HTMLInputElement | null;
      if (newFileInput) newFileInput.value = "";
      await load();
      try {
        const filePath = await uploadAsset(file, created.asset_type);
        const release = await requestJson<{ warning?: string }>(
          `/api/admin/mods/${created.id}/versions`,
          {
            method: "POST",
            body: JSON.stringify({
              ...versionData,
              loaders: created.asset_type === "mod" ? versionData.loaders : [],
              filePath,
            }),
          },
        );
        resetVersionData();
        setJar(null);
        const existingFileInput = document.getElementById(
          "asset-upload",
        ) as HTMLInputElement | null;
        if (existingFileInput) existingFileInput.value = "";
        setMessage(
          `${created.asset_type === "mod" ? "Mod" : "Schematic"} wurde angelegt und ${
            versionData.published ? "veröffentlicht" : "als Entwurf gespeichert"
          }.${release.warning ? ` ${release.warning}` : ""}`,
        );
        window.dispatchEvent(new Event("mcos:mods-updated"));
        await load();
      } catch (reason) {
        setError(
          `${created.asset_type === "mod" ? "Mod" : "Schematic"} wurde angelegt, aber die Datei konnte nicht gespeichert werden: ${(reason as Error).message} Du kannst sie unten unter „Neue Veröffentlichung“ erneut hochladen.`,
        );
      }
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function resetVersionData() {
    setVersionData({
      version: "",
      minecraftVersion: "",
      loaders: ["Fabric"],
      changelog: "",
      premiumOnly: false,
      published: true,
    });
  }
  async function uploadAsset(file: File, assetType: "mod" | "schematic") {
    const headerBuffer = await file.slice(0, 8).arrayBuffer();
    const header = Array.from(new Uint8Array(headerBuffer), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const upload = await requestJson<{ path: string; token: string }>("/api/admin/upload", {
      method: "POST",
      body: JSON.stringify({
        action: "prepare",
        assetType,
        fileName: file.name,
        size: file.size,
        header,
      }),
    });
    const { error: uploadError } = await createClient()
      .storage.from("mod-files")
      .uploadToSignedUrl(upload.path, upload.token, file, {
        contentType: assetType === "mod" ? "application/java-archive" : "application/octet-stream",
        upsert: false,
      });
    if (uploadError) throw new Error(`Datei-Upload fehlgeschlagen: ${uploadError.message}`);
    const checked = await requestJson<{ filePath: string }>("/api/admin/upload", {
      method: "POST",
      body: JSON.stringify({ action: "verify", assetType, filePath: upload.path }),
    });
    return checked.filePath;
  }
  async function publishVersion(event: FormEvent) {
    event.preventDefault();
    const assetType = currentMod?.asset_type;
    if (!jar || !selectedMod || !assetType) {
      setError("Wähle einen Eintrag und eine passende Datei aus.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const filePath = await uploadAsset(jar, assetType);
      const release = await requestJson<{ warning?: string }>(
        `/api/admin/mods/${selectedMod}/versions`,
        {
          method: "POST",
          body: JSON.stringify({
            ...versionData,
            loaders: assetType === "mod" ? versionData.loaders : [],
            filePath,
          }),
        },
      );
      resetVersionData();
      setJar(null);
      const input = document.getElementById("asset-upload") as HTMLInputElement | null;
      if (input) input.value = "";
      setMessage(
        `${assetType === "mod" ? "Mod-Version" : "Schematic"} wurde ${
          versionData.published ? "veröffentlicht" : "als Entwurf gespeichert"
        }.${release.warning ? ` ${release.warning}` : ""}`,
      );
      window.dispatchEvent(new Event("mcos:mods-updated"));
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function makeInvite() {
    await act(async () => {
      const result = await requestJson<{ code: string }>("/api/admin/invitations", {
        method: "POST",
        body: JSON.stringify({ expiresInDays: 30 }),
      });
      setNewCode(result.code);
    }, "Einladung wurde erstellt. Kopiere den Code jetzt — er wird nur einmal angezeigt.");
  }
  async function saveMod(modId: string) {
    const data = editor[modId];
    if (data)
      await act(
        () =>
          requestJson(`/api/admin/mods/${modId}`, { method: "PATCH", body: JSON.stringify(data) }),
        "Mod-Einstellungen gespeichert.",
      );
  }
  async function toggleInvite(invite: Invite) {
    await act(
      () =>
        requestJson(`/api/admin/invitations/${invite.id}`, {
          method: "PATCH",
          body: JSON.stringify({ disabled: !invite.disabled }),
        }),
      invite.disabled ? "Einladung aktiviert." : "Einladung deaktiviert.",
    );
  }
  async function removeInvite(invite: Invite) {
    if (confirm("Einladung endgültig löschen?"))
      await act(
        () => requestJson(`/api/admin/invitations/${invite.id}`, { method: "DELETE" }),
        "Einladung gelöscht.",
      );
  }
  async function setUserStatus(user: AdminUser) {
    const nextStatus = user.status === "active" ? "suspended" : "active";
    await act(
      () =>
        requestJson("/api/admin/users", {
          method: "PATCH",
          body: JSON.stringify({ id: user.id, status: nextStatus }),
        }),
      nextStatus === "active" ? "Konto entsperrt." : "Konto gesperrt.",
    );
  }
  async function setUserPremium(user: AdminUser) {
    await act(
      () =>
        requestJson("/api/admin/users", {
          method: "PATCH",
          body: JSON.stringify({ id: user.id, premium: !user.premium }),
        }),
      user.premium ? "MC OS PRO deaktiviert." : "MC OS PRO freigeschaltet.",
    );
  }
  async function setUserRole(user: AdminUser, role: "owner" | "co_owner" | "user") {
    await act(
      () =>
        requestJson("/api/admin/users", {
          method: "PATCH",
          body: JSON.stringify({ id: user.id, role }),
        }),
      `${user.username} hat jetzt die Rolle ${
        role === "owner" ? "Owner" : role === "co_owner" ? "Co-Owner" : "Mitglied"
      }.`,
    );
  }
  async function deleteUser(user: AdminUser) {
    if (
      !confirm(
        `Konto von ${user.username} wirklich endgültig löschen? Die E-Mail-Adresse wird danach wieder frei.`,
      )
    )
      return;
    await act(
      () => requestJson(`/api/admin/users?id=${encodeURIComponent(user.id)}`, { method: "DELETE" }),
      "Konto und zugehörige Daten wurden gelöscht.",
    );
  }
  async function deleteMod(mod: Mod) {
    if (confirm(`„${mod.name}“ und alle zugehörigen Dateien endgültig löschen?`)) {
      await act(
        () => requestJson(`/api/admin/mods/${mod.id}`, { method: "DELETE" }),
        "Mod und Mod-Dateien gelöscht.",
      );
    }
  }
  const tabItems = [
    { id: "mods" as const, title: "Mods", icon: Blocks },
    { id: "invites" as const, title: "Einladungen", icon: Plus },
    { id: "users" as const, title: "Benutzer", icon: Users },
    { id: "support" as const, title: "Support", icon: MessageCircle },
    { id: "mail" as const, title: "McOS-Mail", icon: Mail },
    { id: "activity" as const, title: "Aktivität", icon: Activity },
  ];
  const currentMod = mods.find((mod) => mod.id === selectedMod);

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-label">WORKSPACE</div>
        <div className="admin-sidebar-title">
          <span>
            <ShieldCheck size={18} />
          </span>
          <strong>Admin Center</strong>
        </div>
        <div className="admin-sidebar-label admin-nav-label">VERWALTUNG</div>
        {tabItems.map((item) => (
          <button
            key={item.id}
            className={`admin-nav-item ${tab === item.id ? "active" : ""}`}
            onClick={() => {
              setTab(item.id);
              setError("");
              setMessage("");
            }}
          >
            <item.icon size={15} />
            {item.title}
            {item.id === "invites" && (
              <i>{invites.filter((invite) => !invite.used_at && !invite.disabled).length}</i>
            )}
          </button>
        ))}
        <div className="admin-sidebar-bottom">
          <span className="admin-online-dot" /> Sicherer Admin-Zugang
        </div>
      </aside>
      <div className="admin-main">
        <div className="admin-header">
          <div>
            <div className="app-eyebrow">MC OS / ADMINISTRATION</div>
            <h2>{tabItems.find((item) => item.id === tab)?.title}</h2>
          </div>
          <button className="admin-refresh" onClick={() => void load()}>
            <Activity size={14} /> Aktualisieren
          </button>
        </div>
        {stats && (
          <div className="admin-stats">
            {[
              { label: "BENUTZER", value: stats.profiles, icon: Users },
              { label: "AKTIVE INHALTE", value: stats.mods, icon: Blocks },
              { label: "VERSIONEN", value: stats.versions, icon: FileArchive },
              { label: "DOWNLOADS", value: stats.downloads, icon: Download },
            ].map(({ label, value, icon: Icon }) => (
              <div className="admin-stat" key={label}>
                <span>{label}</span>
                <strong>{value.toLocaleString("de-DE")}</strong>
                <Icon size={15} />
              </div>
            ))}
          </div>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="inline-success" role="status">
            {message}
          </p>
        )}
        {tab === "mods" && (
          <div className="admin-mods-view">
            <form className="admin-form admin-create-mod" onSubmit={createMod}>
              <div className="admin-form-title">
                <Plus size={15} />
                <strong>1. Neue Mod oder Schematic anlegen</strong>
              </div>
              <div className="admin-form-grid">
                <label>
                  Inhaltstyp
                  <select
                    value={newMod.assetType}
                    onChange={(event) => {
                      const assetType = event.target.value as "mod" | "schematic";
                      setNewMod({ ...newMod, assetType });
                      setNewAssetFile(null);
                      const input = document.getElementById(
                        "new-asset-upload",
                      ) as HTMLInputElement | null;
                      if (input) input.value = "";
                      setVersionData({
                        ...versionData,
                        loaders: assetType === "mod" ? ["Fabric"] : [],
                      });
                    }}
                  >
                    <option value="mod">Minecraft-Mod (.jar)</option>
                    <option value="schematic">Schematic (.schem, .schematic, .litematic)</option>
                  </select>
                </label>
                <label>
                  Name
                  <input
                    value={newMod.name}
                    maxLength={80}
                    onChange={(e) => setNewMod({ ...newMod, name: e.target.value })}
                    required
                  />
                </label>
                <label>
                  Kategorie
                  <input
                    value={newMod.category}
                    maxLength={40}
                    onChange={(e) => setNewMod({ ...newMod, category: e.target.value })}
                    required
                  />
                </label>
                <label className="wide-field">
                  Beschreibung
                  <textarea
                    rows={2}
                    maxLength={3000}
                    value={newMod.description}
                    onChange={(e) => setNewMod({ ...newMod, description: e.target.value })}
                  />
                </label>
                <label className="wide-field">
                  Vorschaubild-URL (HTTPS, optional)
                  <input
                    type="url"
                    value={newMod.imageUrl}
                    onChange={(e) => setNewMod({ ...newMod, imageUrl: e.target.value })}
                    placeholder="https://example.com/mod-bild.jpg"
                  />
                </label>
                <label>
                  {newMod.assetType === "mod" ? "Mod-Version" : "Revision"}
                  <input
                    value={versionData.version}
                    onChange={(event) =>
                      setVersionData({ ...versionData, version: event.target.value })
                    }
                    placeholder="z. B. 1.0.0"
                    required
                  />
                </label>
                <label>
                  Minecraft-Version
                  <input
                    value={versionData.minecraftVersion}
                    onChange={(event) =>
                      setVersionData({ ...versionData, minecraftVersion: event.target.value })
                    }
                    placeholder="z. B. 1.21.5"
                    required
                  />
                </label>
                {newMod.assetType === "mod" && (
                  <label>
                    Modloader
                    <select
                      value={versionData.loaders[0] ?? "Fabric"}
                      onChange={(event) =>
                        setVersionData({ ...versionData, loaders: [event.target.value] })
                      }
                    >
                      {["Fabric", "Forge", "NeoForge", "Quilt"].map((loader) => (
                        <option key={loader}>{loader}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="wide-field">
                  Änderungsprotokoll
                  <textarea
                    rows={2}
                    maxLength={3000}
                    value={versionData.changelog}
                    onChange={(event) =>
                      setVersionData({ ...versionData, changelog: event.target.value })
                    }
                  />
                </label>
                <fieldset className="release-access wide-field">
                  <legend>Veröffentlichungsstatus</legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={versionData.published}
                      onChange={(event) =>
                        setVersionData({ ...versionData, published: event.target.checked })
                      }
                    />
                    Sofort im Browser veröffentlichen
                  </label>
                  {!versionData.published && (
                    <small>
                      Entwürfe sind für Mitglieder unsichtbar. Du kannst sie nach dem Speichern
                      unten veröffentlichen.
                    </small>
                  )}
                </fieldset>
                <fieldset className="release-access wide-field">
                  <legend>Download-Zugriff</legend>
                  <label>
                    <input
                      type="radio"
                      name="new-release-access"
                      checked={!versionData.premiumOnly}
                      onChange={() => setVersionData({ ...versionData, premiumOnly: false })}
                    />
                    Für alle Mitglieder
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="new-release-access"
                      checked={versionData.premiumOnly}
                      onChange={() => setVersionData({ ...versionData, premiumOnly: true })}
                    />
                    Nur für MC OS PRO-Mitglieder
                  </label>
                </fieldset>
                <label className="wide-field jar-picker">
                  <span>
                    {newMod.assetType === "mod" ? "JAR-Datei" : "Schematic-Datei"}{" "}
                    <small>MAX. 250 MB · PRIVATER STORAGE</small>
                  </span>
                  <input
                    id="new-asset-upload"
                    type="file"
                    accept={
                      newMod.assetType === "mod"
                        ? ".jar,application/java-archive"
                        : ".schem,.schematic,.litematic,application/octet-stream,application/gzip"
                    }
                    onChange={(event) => setNewAssetFile(event.target.files?.[0] ?? null)}
                    required
                  />
                </label>
              </div>
              <button className="admin-action-button" disabled={busy}>
                {versionData.published
                  ? "Anlegen & Datei veröffentlichen"
                  : "Anlegen & Datei als Entwurf speichern"}{" "}
                <ArrowRight size={14} />
              </button>
            </form>
            {mods.length === 0 ? (
              <div className="admin-empty">Noch keine Mods angelegt.</div>
            ) : (
              <div className="admin-mod-list">
                <div className="admin-form-title">
                  <Blocks size={15} />
                  <strong>2. Mod- und Schematic-Einträge verwalten</strong>
                </div>
                {mods.map((mod) => (
                  <div className="admin-mod-editor" key={mod.id}>
                    <div className="admin-mod-editor-top">
                      <div>
                        <strong>{mod.name}</strong>
                        <small>
                          {mod.asset_type === "schematic" ? "Schematic" : "Mod"} ·{" "}
                          {mod.mod_versions.filter((item) => item.published).length} veröffentlicht
                          · {mod.mod_versions.filter((item) => !item.published).length} Entwurf ·{" "}
                          {mod.active ? "Aktiv" : "Deaktiviert"}
                        </small>
                      </div>
                      <button className="danger-text" onClick={() => void deleteMod(mod)}>
                        Löschen
                      </button>
                    </div>
                    {mod.mod_versions.map((release) => (
                      <div className="admin-mod-release-row" key={release.id}>
                        <span>
                          <strong>v{release.version}</strong>
                          <small>
                            Minecraft {release.minecraft_version} ·{" "}
                            {release.premium_only ? "PRO" : "Alle"} ·{" "}
                            {release.published ? "Veröffentlicht" : "Entwurf"}
                          </small>
                        </span>
                        <button
                          className={
                            release.published ? "plain-admin-button" : "admin-action-button"
                          }
                          disabled={busy}
                          onClick={() =>
                            void act(
                              () =>
                                requestJson(`/api/admin/mods/${mod.id}/versions`, {
                                  method: "PATCH",
                                  body: JSON.stringify({
                                    versionId: release.id,
                                    published: !release.published,
                                  }),
                                }).then((result) => {
                                  window.dispatchEvent(new Event("mcos:mods-updated"));
                                  return result;
                                }),
                              release.published
                                ? "Version wurde aus den Bibliotheken zurückgezogen."
                                : "Version wurde in den Bibliotheken veröffentlicht.",
                            )
                          }
                        >
                          {release.published ? "Zurückziehen" : "Veröffentlichen"}
                        </button>
                      </div>
                    ))}
                    <div className="admin-form-grid">
                      <label>
                        Name
                        <input
                          value={editor[mod.id]?.name ?? ""}
                          onChange={(e) =>
                            setEditor({
                              ...editor,
                              [mod.id]: { ...editor[mod.id], name: e.target.value },
                            })
                          }
                        />
                      </label>
                      <label>
                        Kategorie
                        <input
                          value={editor[mod.id]?.category ?? ""}
                          onChange={(e) =>
                            setEditor({
                              ...editor,
                              [mod.id]: { ...editor[mod.id], category: e.target.value },
                            })
                          }
                        />
                      </label>
                      <label className="wide-field">
                        Beschreibung
                        <textarea
                          rows={2}
                          value={editor[mod.id]?.description ?? ""}
                          onChange={(e) =>
                            setEditor({
                              ...editor,
                              [mod.id]: { ...editor[mod.id], description: e.target.value },
                            })
                          }
                        />
                      </label>
                      <label className="wide-field">
                        Vorschaubild-URL (HTTPS, optional)
                        <input
                          type="url"
                          value={editor[mod.id]?.imageUrl ?? ""}
                          onChange={(e) =>
                            setEditor({
                              ...editor,
                              [mod.id]: { ...editor[mod.id], imageUrl: e.target.value },
                            })
                          }
                          placeholder="https://example.com/mod-bild.jpg"
                        />
                      </label>
                    </div>
                    <div className="admin-mod-actions">
                      <label className="admin-checkbox">
                        <input
                          type="checkbox"
                          checked={editor[mod.id]?.active ?? mod.active}
                          onChange={(e) =>
                            setEditor({
                              ...editor,
                              [mod.id]: { ...editor[mod.id], active: e.target.checked },
                            })
                          }
                        />{" "}
                        Aktiv
                      </label>
                      <button
                        className="admin-action-button small-action"
                        onClick={() => void saveMod(mod.id)}
                        disabled={busy}
                      >
                        Speichern
                      </button>
                      <button className="plain-admin-button" onClick={() => setSelectedMod(mod.id)}>
                        Version hinzufügen
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <form className="admin-form admin-version-form" onSubmit={publishVersion}>
              <div className="admin-form-title">
                <ArrowDownToLine size={15} />
                <strong>
                  Neue {currentMod?.asset_type === "schematic" ? "Schematic" : "Mod-Version"}{" "}
                  veröffentlichen
                </strong>
              </div>
              <div className="admin-form-grid">
                <label className="wide-field">
                  Mod oder Schematic
                  <select
                    value={selectedMod}
                    onChange={(event) => {
                      const nextId = event.target.value;
                      const nextMod = mods.find((mod) => mod.id === nextId);
                      setSelectedMod(nextId);
                      setJar(null);
                      setVersionData({
                        ...versionData,
                        loaders: nextMod?.asset_type === "schematic" ? [] : ["Fabric"],
                      });
                      const input = document.getElementById(
                        "asset-upload",
                      ) as HTMLInputElement | null;
                      if (input) input.value = "";
                    }}
                    required
                  >
                    <option value="">Mod auswählen</option>
                    {mods.map((mod) => (
                      <option key={mod.id} value={mod.id}>
                        {mod.asset_type === "schematic" ? "Schematic · " : "Mod · "}
                        {mod.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {currentMod?.asset_type === "schematic" ? "Revision" : "Mod-Version"}
                  <input
                    value={versionData.version}
                    onChange={(e) => setVersionData({ ...versionData, version: e.target.value })}
                    placeholder="z. B. 1.2.0"
                    required
                  />
                </label>
                <label>
                  Minecraft-Version
                  <input
                    value={versionData.minecraftVersion}
                    onChange={(e) =>
                      setVersionData({ ...versionData, minecraftVersion: e.target.value })
                    }
                    placeholder="z. B. 1.21.5"
                    required
                  />
                </label>
                {currentMod?.asset_type !== "schematic" && (
                  <label>
                    Loader
                    <select
                      value={versionData.loaders[0]}
                      onChange={(e) =>
                        setVersionData({ ...versionData, loaders: [e.target.value] })
                      }
                    >
                      {["Fabric", "Forge", "NeoForge", "Quilt"].map((loader) => (
                        <option key={loader}>{loader}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="wide-field">
                  Änderungsprotokoll
                  <textarea
                    rows={2}
                    maxLength={3000}
                    value={versionData.changelog}
                    onChange={(e) => setVersionData({ ...versionData, changelog: e.target.value })}
                  />
                </label>
                <fieldset className="release-access wide-field">
                  <legend>Veröffentlichungsstatus</legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={versionData.published}
                      onChange={(event) =>
                        setVersionData({ ...versionData, published: event.target.checked })
                      }
                    />
                    Sofort im Browser veröffentlichen
                  </label>
                  {!versionData.published && (
                    <small>
                      Entwürfe sind für Mitglieder unsichtbar. Du kannst sie nach dem Speichern oben
                      veröffentlichen.
                    </small>
                  )}
                </fieldset>
                <fieldset className="release-access wide-field">
                  <legend>Download-Zugriff</legend>
                  <label>
                    <input
                      type="radio"
                      name="version-release-access"
                      checked={!versionData.premiumOnly}
                      onChange={() => setVersionData({ ...versionData, premiumOnly: false })}
                    />
                    Für alle Mitglieder
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="version-release-access"
                      checked={versionData.premiumOnly}
                      onChange={() => setVersionData({ ...versionData, premiumOnly: true })}
                    />
                    Nur für MC OS PRO-Mitglieder
                  </label>
                </fieldset>
                <label className="wide-field jar-picker">
                  <span>
                    {currentMod?.asset_type === "schematic" ? "Schematic-Datei" : "JAR-Datei"}{" "}
                    <small>MAX. 250 MB · PRIVATER STORAGE</small>
                  </span>
                  <input
                    id="asset-upload"
                    type="file"
                    accept={
                      currentMod?.asset_type === "schematic"
                        ? ".schem,.schematic,.litematic,application/octet-stream,application/gzip"
                        : ".jar,application/java-archive"
                    }
                    onChange={(e) => setJar(e.target.files?.[0] ?? null)}
                    required
                  />
                </label>
              </div>
              <p className="upload-note">
                <LockKeyhole size={13} />{" "}
                {currentMod?.asset_type === "schematic"
                  ? "Datei wird serverseitig auf NBT-/GZIP-Signatur geprüft und privat gespeichert."
                  : "Datei wird serverseitig als ZIP/JAR geprüft und privat gespeichert."}
              </p>
              <button className="admin-action-button" disabled={busy || !currentMod}>
                {busy
                  ? "Wird verarbeitet …"
                  : currentMod?.asset_type === "schematic"
                    ? "Schematic hochladen & veröffentlichen"
                    : "Version hochladen & veröffentlichen"}{" "}
                <ArrowRight size={14} />
              </button>
            </form>
          </div>
        )}
        {tab === "invites" && (
          <div className="admin-section">
            <div className="admin-section-heading">
              <div>
                <h3>Einladungscodes</h3>
                <p>Einmalige Codes mit begrenzter Gültigkeit.</p>
              </div>
              <button
                className="admin-action-button"
                onClick={() => void makeInvite()}
                disabled={busy}
              >
                <Plus size={14} /> Code erstellen
              </button>
            </div>
            {newCode && (
              <div className="new-code-card">
                <div>
                  <span>NEUER CODE · NUR JETZT SICHTBAR</span>
                  <strong>{newCode}</strong>
                </div>
                <button onClick={() => void navigator.clipboard.writeText(newCode)}>
                  Code kopieren
                </button>
                <button
                  className="new-code-dismiss"
                  onClick={() => setNewCode("")}
                  aria-label="Schließen"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {invites.length === 0 ? (
              <div className="admin-empty">Noch keine Einladungen vorhanden.</div>
            ) : (
              <div className="admin-table">
                <div className="admin-table-head invite-row">
                  <span>REFERENZ</span>
                  <span>STATUS</span>
                  <span>GÜLTIG BIS</span>
                  <span>AKTIONEN</span>
                </div>
                {invites.map((invite) => (
                  <div className="admin-table-row invite-row" key={invite.id}>
                    <span className="mono-value">{invite.reference}…</span>
                    <span>
                      <i
                        className={`invite-status-dot ${invite.used_at ? "used" : invite.disabled ? "disabled" : ""}`}
                      />
                      {invite.used_at ? "Eingelöst" : invite.disabled ? "Deaktiviert" : "Verfügbar"}
                    </span>
                    <span>{dateLabel(invite.expires_at)}</span>
                    <span className="table-actions">
                      <button
                        onClick={() => void toggleInvite(invite)}
                        disabled={Boolean(invite.used_at)}
                      >
                        {invite.disabled ? "Aktivieren" : "Deaktivieren"}
                      </button>
                      <button className="danger-text" onClick={() => void removeInvite(invite)}>
                        Löschen
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="admin-help">
              Codes werden nur als Hash gespeichert und nach der Erstellung nicht erneut im Klartext
              angezeigt.
            </p>
          </div>
        )}
        {tab === "users" && (
          <div className="admin-section">
            <div className="admin-section-heading">
              <div>
                <h3>Benutzer</h3>
                <p>Konten ansehen und Zugänge bei Bedarf sperren.</p>
              </div>
              <span className="subtle-count">{users.length} KONTEN</span>
            </div>
            <div className="admin-table">
              <div className="admin-table-head user-row">
                <span>BENUTZER</span>
                <span>ROLLE</span>
                <span>STATUS</span>
                <span>ABO</span>
                <span>SEIT</span>
                <span>AKTIONEN</span>
              </div>
              {users.map((user) => (
                <div className="admin-table-row user-row" key={user.id}>
                  <span>
                    <strong>{user.username}</strong>
                    <small>{user.email}</small>
                  </span>
                  <span>
                    {user.role === "owner" || user.role === "admin"
                      ? "Owner"
                      : user.role === "co_owner"
                        ? "Co-Owner"
                        : "Mitglied"}
                  </span>
                  <span>
                    <i
                      className={`invite-status-dot ${
                        user.status === "pending"
                          ? "used"
                          : user.status === "suspended"
                            ? "disabled"
                            : ""
                      }`}
                    />
                    {user.status === "active"
                      ? "Aktiv"
                      : user.status === "pending"
                        ? "Ausstehend"
                        : "Gesperrt"}
                  </span>
                  <span>{user.premium ? "PRO" : "—"}</span>
                  <span>{dateLabel(user.created_at)}</span>
                  <span className="user-admin-actions">
                    {user.id !== profile.id && (
                      <>
                        <label className="admin-role-select">
                          <select
                            aria-label={`Rolle für ${user.username}`}
                            value={user.role === "admin" ? "owner" : user.role}
                            disabled={busy || user.status === "pending"}
                            onChange={(event) =>
                              void setUserRole(
                                user,
                                event.target.value as "owner" | "co_owner" | "user",
                              )
                            }
                          >
                            <option value="user">Mitglied</option>
                            <option value="co_owner">Co-Owner</option>
                            {(profile.role === "owner" || user.role === "owner") && (
                              <option value="owner" disabled={profile.role !== "owner"}>
                                Owner
                              </option>
                            )}
                          </select>
                        </label>
                        {user.status !== "pending" && (
                          <>
                            <button onClick={() => void setUserStatus(user)}>
                              {user.status === "active" ? "Sperren" : "Entsperren"}
                            </button>
                            <button onClick={() => void setUserPremium(user)}>
                              {user.premium ? "PRO aus" : "PRO an"}
                            </button>
                            <button className="danger-text" onClick={() => void deleteUser(user)}>
                              Löschen
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === "activity" && (
          <div className="admin-section">
            <div className="admin-section-heading">
              <div>
                <h3>Aktivitäten</h3>
                <p>Protokoll der letzten administrativen Änderungen.</p>
              </div>
            </div>
            {!stats?.activity.length ? (
              <div className="admin-empty">Noch keine Aktivität protokolliert.</div>
            ) : (
              <div className="activity-list">
                {stats.activity.map((item) => (
                  <div className="activity-entry" key={item.id}>
                    <span className="activity-icon">
                      <Activity size={15} />
                    </span>
                    <span>
                      <strong>{item.action.replaceAll(".", " ")}</strong>
                      <small>
                        {item.entity_type} · {item.entity_id ?? "—"}
                      </small>
                    </span>
                    <time>{dateLabel(item.created_at)}</time>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {tab === "support" && <ChatApp profile={profile} supportOnly />}
        {tab === "mail" && <AdminBroadcastApp />}
      </div>
    </div>
  );
}
