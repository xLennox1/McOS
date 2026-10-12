# MC OS

Eine private, browserbasierte Minecraft-Mod-Plattform mit Next.js, Supabase und einem Desktop-ähnlichen Workspace. MC OS ist kein Betriebssystem und kein Minecraft-Launcher.

## Lokal starten

Voraussetzungen: Node.js 20.9 oder neuer, npm und ein Supabase-Projekt.

1. Abhängigkeiten installieren: `npm install`
2. `.env.example` nach `.env.local` kopieren und die Werte eintragen.
3. In Supabase unter **SQL Editor** die Migrationen `202610120001_initial_schema.sql`, `202610120002_community_features.sql`, `202610120003_schematics.sql`, `202610120004_owner_roles.sql`, `202610120005_mod_covers.sql` und `202610120006_resourcepacks.sql` in dieser Reihenfolge ausführen. Die vierte Migration wandelt bestehende Admins in Owner/Co-Owner um; die fünfte richtet den Cover-Speicher ein; die sechste aktiviert Resourcepacks und ZIP-Uploads.
4. E-Mail/Passwort als Auth-Anbieter in Supabase aktivieren. Öffentliche Registrierungen in Supabase deaktivieren; Konten werden nur über den geschützten Einladungsweg angelegt.
5. Für lokale Auth-E-Mails in Supabase **Authentication → URL Configuration** `http://localhost:3000` als Site URL setzen. Erlaube zusätzlich `http://localhost:3000/reset-password`.
6. `npm run dev` ausführen und `http://localhost:3000` öffnen.

### Umgebungsvariablen

| Variable | Verwendung |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL des Supabase-Projekts |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable/anon key; darf im Browser verfügbar sein |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key; ausschließlich serverseitig, niemals mit `NEXT_PUBLIC_` |
| `MCOS_SETUP_SECRET` | Langes, zufälliges Geheimnis für die einmalige Erstellung des ersten Admin-Kontos |
| `NEXT_PUBLIC_SITE_URL` | Origin der Anwendung für Passwort-Reset-Links |

Generiere das Setup-Secret selbst (mindestens 24 Zeichen, z. B. mit einem Passwortmanager). Rufe `/setup` auf, erstelle den ersten Administrator und **entferne danach `MCOS_SETUP_SECRET` aus der lokalen Umgebung und allen Deploy-Umgebungen**. Das Setup kann serverseitig nur einmal erfolgreich sein. Es gibt keine Standard-Zugangsdaten.

## Supabase / Datenmodell

Die erste Migration erstellt Profile/Rollen, einmalig verwendbare Einladungen (nur SHA-256-Hash wird gespeichert), Mods, Versionen, Download-Historie und ein Admin-Audit-Log. Neue Auth-Konten starten als `pending`; nur Einladungseinlösung oder der einmalige Admin-Bootstrap aktiviert ein Profil. Die zweite Migration ergänzt Freundschaftsanfragen, private Einzel- und Support-Chats, Realtime-Nachrichten, internes McOS-Mail, Avatar-Speicher, Profiltext sowie serverseitig verwaltete PRO- und Premium-Mod-Felder. Die dritte Migration ermöglicht Schematics (.schem, .schematic und .litematic) im selben privaten Storage. Die vierte Migration benennt den bisherigen Admin-Rang in Owner um, ordnet eventuelle weitere Admin-Konten dem Co-Owner-Rang zu und aktualisiert die Support-Rechte. Die fünfte Migration richtet einen öffentlichen Cover-Bucket ein; Uploads können nur Owner und Co-Owner über kurzlebige Upload-Links starten, und Format sowie Größe werden geprüft. Die sechste Migration ergänzt Resourcepacks als Inhaltstyp und stellt ZIP-Dateien im privaten Dateispeicher bereit. Beide Ränge haben serverseitig geschützte Admin-Rechte. RLS schützt Nutzerdaten; Nachrichten werden über serverseitig autorisierte Endpunkte gesendet und über Supabase Realtime aktualisiert (mit kurzem Polling als Ausfallschutz). Owner und Co-Owner können Support-Chats lesen. Private Mod-, Schematic- und Resourcepack-Dateien sowie Profilbilder liegen in privaten Storage-Buckets.

E-Mail/Passwort-Anmeldung, serverseitige Einladungseinlösung, Owner-Bootstrap, Sperren und endgültiges Löschen von Konten, PRO-Freischaltung, Einstellungen und signierte Download-URLs verwenden Supabase Auth/DB/Storage. McOS-Mail ist ein virtuelles, internes Postfach: Willkommens- und Veröffentlichungsnachrichten werden dort zugestellt und Owner/Co-Owner können interne Rundnachrichten senden. Es wird **keine externe E-Mail** versendet. Premium-Profilbearbeitung und Premium-Downloads werden auf dem Server geprüft. JARs werden vor Veröffentlichung auf Größe, ZIP-Signatur und Archivverzeichnis geprüft; Schematics auf Größe sowie NBT-/GZIP-Signatur. Das ist **keine Malware- oder Bytecode-Sicherheitsprüfung**: Vor einem öffentlichen Betrieb sollte ein isolierter Virenscanner/Quarantäneprozess für hochgeladene Dateien ergänzt werden.

Direkt- und Support-Chats enthalten Audio- und Videoanruf-Schaltflächen. Diese öffnen für beide Chat-Teilnehmer denselben, schwer erratbaren Raum auf **meet.jit.si**; die Anrufe laufen außerhalb von MC OS und verwenden den öffentlichen Jitsi-Dienst. Es ist kein Jitsi-Konto oder API-Schlüssel erforderlich. Die PRO-Hinweise in beiden Bibliotheken führen zu Discord oder zum Support-Chat. Es gibt keine Zahlungsabwicklung: PRO wird weiterhin manuell von Owner/Co-Owner freigeschaltet.

Einladungscodes werden zufällig generiert, einmalig angezeigt und danach nicht im Klartext gespeichert. Admins können Gültigkeit/Status ansehen, deaktivieren und löschen; nach dem Schließen des Erstellungsdialogs lässt sich ein Code aus Sicherheitsgründen nicht wiederherstellen.

## Vercel und GitHub

1. Lege ein separates GitHub-Repository für **diesen Ordner `McOS`** an und pushe dessen Projektdateien. Prüfe vor dem Commit, dass `.env.local` nicht aufgenommen wird; `.gitignore` schließt Umgebungsdateien aus.
2. Importiere das GitHub-Repository in Vercel. Framework Preset: **Next.js**; Build Command `npm run build`, Install Command `npm install`.
3. Trage in Vercel **Project → Settings → Environment Variables** die oben genannten Supabase-Werte und `NEXT_PUBLIC_SITE_URL` mit deiner Produktions-URL ein. `MCOS_SETUP_SECRET` nur für den initialen Admin-Bootstrap setzen und anschließend entfernen. Keine Secrets in GitHub/Vercel Source Code speichern.
4. Füge die Vercel-Produktionsdomain als Site URL und `https://DEINE-DOMAIN/reset-password` als erlaubte Redirect URL in Supabase ein. Für Vorschau-Deployments deren URL ebenfalls nur dann freigeben, wenn sie gebraucht wird.
5. Führe alle sechs SQL-Migrationen in der angegebenen Reihenfolge auf dem Supabase-Projekt aus. Bei einem bestehenden Projekt, auf dem die ersten fünf Migrationen bereits aktiv sind, führe nur `202610120006_resourcepacks.sql` aus. Dein vorhandenes Administratorkonto bleibt bestehen und wird beim Ausführen der Rollen-Migration zum Owner; lege es nicht erneut über `/setup` an.

Ein GitHub-Remote, Supabase-Projekt und Vercel-Projekt sind in dieser Arbeitsumgebung nicht verbunden. Nach dem Eintragen echter Zugangsdaten und dem Erstellen des GitHub-Repositories muss der erste Vercel-Deploy in der Vercel-Oberfläche gestartet werden.

## Verfügbare Funktionen

- Einladungsgeschützte Kontoerstellung, Login, Abmelden und Passwort-Reset
- Desktop-Ansicht mit Startmenü, Fenstern, Taskleiste, Uhr, separater Mod-, Schematic- und Resourcepack-Bibliothek, Profil, Downloads, Einstellungen und Infoseite
- Fenster lassen sich per Titelleiste verschieben; Layout passt sich an kleinere Bildschirmgrößen an
- Freundschaftsanfragen per Benutzer-ID, private Direktnachrichten und Support-Chat mit Live-Aktualisierung
- Audio- und Videoanrufe aus Direkt- und Support-Chats (externer Jitsi-Raum)
- McOS-Mail mit Willkommensnachrichten, Mod-Veröffentlichungsinfos und internen Admin-Rundnachrichten
- Servergesteuerte PRO-Freischaltung, PRO-Profilbearbeitung sowie getrennt konfigurierbare öffentliche/PRO-Mod-, Schematic- und Resourcepack-Veröffentlichungen
- Serverseitig autorisiertes Owner-/Co-Owner-Center für Einladungen, Rollen, Kontosperren/-löschung, PRO-Rechte, Support, interne Nachrichten sowie Mod-, Schematic- und Resourcepack-Metadaten/Dateien
- PRO-Hinweis in beiden Bibliotheken mit Discord- und Support-Anfrage; PRO wird manuell freigeschaltet
- Discord-Link zur MC OS Community
- Optionale Mod- und Schematic-Cover per lokalem PNG/JPG/WEBP-Upload (bis 5 MB) oder HTTPS-URL
- Private JAR-Ablage, Größen- und Archivprüfung, kurzlebige signierte Downloads sowie Download-Verlauf
- Eigene Schematic-Bibliothek und Admin-Veröffentlichung für `.schem`, `.schematic` und `.litematic`
- Eigener Resourcepack-Browser sowie Admin-Upload und Veröffentlichung geprüfter `.zip`-Dateien (bis 250 MB)
- Supabase-RLS für nutzerseitige Daten und Audit-Einträge administrativer Änderungen

## Prüfungen

`npm run lint`, `npm run typecheck` und `npm run build`

## Community-Features nachrüsten

Wenn die ursprüngliche Datenbank bereits eingerichtet wurde, führe fehlende Migrationen der Reihe nach aus: `202610120002_community_features.sql`, `202610120003_schematics.sql`, `202610120004_owner_roles.sql`, `202610120005_mod_covers.sql` und `202610120006_resourcepacks.sql`. Wenn die Migrationen `001` bis `005` bereits aktiv sind, ist für den Resourcepack-Browser und ZIP-Uploads nur `202610120006_resourcepacks.sql` nötig. Die Migrationen löschen das bestehende Admin-Konto nicht; das erste Admin-Konto wird zum Owner. Danach die lokale App neu starten. Willkommensnachrichten werden bei neu aktivierten Konten automatisch angelegt; beim ersten Öffnen von McOS-Mail erhält auch ein schon bestehendes Konto seine Willkommensnachricht.
