import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requestAdmin } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_FILE_BYTES = 250 * 1024 * 1024;
const SCHEMATIC_EXTENSIONS = new Set(["schem", "schematic", "litematic"]);

type AssetType = "mod" | "schematic";

function extensionFor(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function hasValidSignature(assetType: AssetType, extension: string, bytes: Uint8Array) {
  if (assetType === "mod") {
    return (
      extension === "jar" &&
      bytes.length >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      [0x03, 0x05, 0x07].includes(bytes[2]) &&
      [0x04, 0x06, 0x08].includes(bytes[3])
    );
  }
  return (
    SCHEMATIC_EXTENSIONS.has(extension) &&
    ((bytes[0] === 0x1f && bytes[1] === 0x8b) || bytes[0] === 0x0a)
  );
}

function validFilePath(filePath: string, assetType: AssetType) {
  const extension = assetType === "mod" ? "jar" : "(?:schem|schematic|litematic)";
  return new RegExp(`^[a-f0-9-]{36}\\.${extension}$`).test(filePath);
}

async function verifyJarArchive(filePath: string, size: number) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) {
    return { ok: false as const, error: "Storage ist nicht konfiguriert.", status: 500 };
  }
  const objectUrl = `${baseUrl}/storage/v1/object/authenticated/mod-files/${filePath}`;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const response = await fetch(objectUrl, {
    headers: { ...headers, Range: "bytes=0-7" },
  });
  if (response.status !== 206) {
    return {
      ok: false as const,
      error: "Die Dateiprüfung konnte nicht sicher durchgeführt werden.",
      status: 400,
    };
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!hasValidSignature("mod", "jar", bytes)) {
    return {
      ok: false as const,
      error: "Die hochgeladene Datei ist kein ZIP/JAR-Archiv.",
      status: 400,
    };
  }

  const start = Math.max(0, size - 65_557);
  const tailResponse = await fetch(objectUrl, {
    headers: { ...headers, Range: `bytes=${start}-${size - 1}` },
  });
  if (tailResponse.status !== 206) {
    return {
      ok: false as const,
      error: "Das ZIP-Archivende konnte nicht sicher geprüft werden.",
      status: 400,
    };
  }
  const tail = new Uint8Array(await tailResponse.arrayBuffer());
  let endRecord = -1;
  for (let index = tail.length - 22; index >= Math.max(0, tail.length - 65_557); index--) {
    if (
      tail[index] === 0x50 &&
      tail[index + 1] === 0x4b &&
      tail[index + 2] === 0x05 &&
      tail[index + 3] === 0x06
    ) {
      endRecord = index;
      break;
    }
  }
  if (endRecord < 0 || endRecord + 22 > tail.length) {
    return {
      ok: false as const,
      error: "Das ZIP/JAR-Archiv ist unvollständig oder beschädigt.",
      status: 400,
    };
  }
  const view = new DataView(tail.buffer, tail.byteOffset + endRecord);
  const entries = view.getUint16(10, true);
  const directorySize = view.getUint32(12, true);
  const directoryOffset = view.getUint32(16, true);
  if (entries === 0 || directoryOffset + directorySize > start + endRecord) {
    return {
      ok: false as const,
      error: "Das Archiv enthält kein gültiges JAR-Dateiverzeichnis.",
      status: 400,
    };
  }
  return { ok: true as const };
}

export async function POST(request: Request) {
  if (!(await requestAdmin()))
    return NextResponse.json({ error: "Keine Administratorrechte." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (body?.assetType !== "mod" && body?.assetType !== "schematic") {
    return NextResponse.json({ error: "Ungültiger Inhaltstyp." }, { status: 400 });
  }
  const assetType: AssetType = body?.assetType === "schematic" ? "schematic" : "mod";

  if (body?.action === "prepare") {
    const fileName = typeof body.fileName === "string" ? body.fileName : "";
    const extension = extensionFor(fileName);
    const size = Number(body.size);
    const isAllowedExtension =
      assetType === "mod" ? extension === "jar" : SCHEMATIC_EXTENSIONS.has(extension);
    if (
      !/^[^\\/]+$/.test(fileName) ||
      !isAllowedExtension ||
      !Number.isSafeInteger(size) ||
      size < 4 ||
      size > MAX_FILE_BYTES
    ) {
      return NextResponse.json(
        {
          error:
            assetType === "mod"
              ? "Nur JAR-Dateien zwischen 4 Byte und 250 MB sind erlaubt."
              : "Nur SCHEM-, SCHEMATIC- oder LITEMATIC-Dateien zwischen 4 Byte und 250 MB sind erlaubt.",
        },
        { status: 400 },
      );
    }
    const header = typeof body.header === "string" ? body.header : "";
    const signature = Uint8Array.from(
      header.match(/.{1,2}/g)?.map((byte: string) => Number.parseInt(byte, 16)) ?? [],
    );
    if (!hasValidSignature(assetType, extension, signature)) {
      return NextResponse.json(
        {
          error:
            assetType === "mod"
              ? "Die Datei besitzt keine erkennbare ZIP/JAR-Signatur."
              : "Die Datei besitzt keine erkennbare NBT- oder GZIP-Signatur.",
        },
        { status: 400 },
      );
    }

    const filePath = `${randomUUID()}.${extension}`;
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from("mod-files")
      .createSignedUploadUrl(filePath, { upsert: false });
    if (error || !data?.token)
      return NextResponse.json(
        { error: "Sicherer Upload-Link konnte nicht erstellt werden." },
        { status: 500 },
      );
    return NextResponse.json({ path: filePath, token: data.token });
  }

  if (body?.action === "verify") {
    const filePath = typeof body.filePath === "string" ? body.filePath : "";
    if (!validFilePath(filePath, assetType)) {
      return NextResponse.json({ error: "Ungültiger Dateischlüssel." }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data: objects, error: listError } = await admin.storage
      .from("mod-files")
      .list("", { search: filePath });
    const object = objects?.find((item) => item.name === filePath);
    const size = object?.metadata?.size;
    if (listError || !object || typeof size !== "number" || size <= 0 || size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Upload fehlt oder überschreitet das Größenlimit von 250 MB." },
        { status: 400 },
      );
    }

    if (assetType === "mod") {
      const archive = await verifyJarArchive(filePath, size);
      if (!archive.ok)
        return NextResponse.json({ error: archive.error }, { status: archive.status });
    } else {
      const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!baseUrl || !serviceKey)
        return NextResponse.json({ error: "Storage ist nicht konfiguriert." }, { status: 500 });
      const response = await fetch(
        `${baseUrl}/storage/v1/object/authenticated/mod-files/${filePath}`,
        {
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Range: "bytes=0-7",
          },
        },
      );
      if (response.status !== 206)
        return NextResponse.json(
          { error: "Die Dateiprüfung konnte nicht sicher durchgeführt werden." },
          { status: 400 },
        );
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!hasValidSignature("schematic", extensionFor(filePath), bytes))
        return NextResponse.json(
          { error: "Die Datei besitzt keine erkennbare NBT- oder GZIP-Signatur." },
          { status: 400 },
        );
    }
    return NextResponse.json({ ok: true, filePath, size });
  }
  return NextResponse.json({ error: "Ungültige Upload-Aktion." }, { status: 400 });
}
