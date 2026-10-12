import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requestAdmin } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_FILE_BYTES = 250 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const SCHEMATIC_EXTENSIONS = new Set(["schem", "schematic", "litematic"]);
const COVER_TYPES: Record<string, { mime: string; signature: (bytes: Uint8Array) => boolean }> = {
  png: {
    mime: "image/png",
    signature: (bytes) =>
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a,
  },
  jpg: {
    mime: "image/jpeg",
    signature: (bytes) =>
      bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  jpeg: {
    mime: "image/jpeg",
    signature: (bytes) =>
      bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  webp: {
    mime: "image/webp",
    signature: (bytes) =>
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
  },
};

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

function validCoverPath(filePath: string) {
  return /^[a-f0-9-]{36}\.(?:png|jpe?g|webp)$/.test(filePath);
}

function coverSignature(filePath: string, bytes: Uint8Array) {
  const extension = extensionFor(filePath);
  return COVER_TYPES[extension]?.signature(bytes) ?? false;
}

async function ensureCoverBucket(admin: ReturnType<typeof createAdminClient>) {
  const { data: bucket, error: bucketError } = await admin.storage.getBucket("mod-covers");
  if (bucket) return;
  if (bucketError?.status !== 404 && bucketError?.statusCode !== "404") {
    throw bucketError ?? new Error("Supabase hat den Cover-Speicher nicht gefunden.");
  }

  const { error: createError } = await admin.storage.createBucket("mod-covers", {
    public: true,
    fileSizeLimit: MAX_COVER_BYTES,
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  });
  if (!createError) return;

  // A parallel first upload may have created the bucket after getBucket returned 404.
  const { data: createdBucket, error: retryError } = await admin.storage.getBucket("mod-covers");
  if (createdBucket && !retryError) return;
  throw createError;
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
  if (body?.action === "cover-prepare") {
    const fileName = typeof body.fileName === "string" ? body.fileName : "";
    const extension = extensionFor(fileName);
    const size = Number(body.size);
    const coverType = COVER_TYPES[extension];
    if (
      !/^[^\\/]+$/.test(fileName) ||
      !coverType ||
      !Number.isSafeInteger(size) ||
      size < 12 ||
      size > MAX_COVER_BYTES
    ) {
      return NextResponse.json(
        { error: "Nur PNG-, JPG- oder WEBP-Bilder bis maximal 5 MB sind erlaubt." },
        { status: 400 },
      );
    }
    const header = typeof body.header === "string" ? body.header : "";
    const signature = Uint8Array.from(
      header.match(/.{1,2}/g)?.map((byte: string) => Number.parseInt(byte, 16)) ?? [],
    );
    if (!coverSignature(`cover.${extension}`, signature)) {
      return NextResponse.json(
        { error: "Das Bildformat stimmt nicht mit dem Dateiinhalt überein." },
        { status: 400 },
      );
    }
    const filePath = `${randomUUID()}.${extension}`;
    const admin = createAdminClient();
    try {
      await ensureCoverBucket(admin);
    } catch (error) {
      console.error("Failed to ensure the mod-covers storage bucket.", error);
      return NextResponse.json(
        {
          error:
            "Der Cover-Speicher fehlt und konnte nicht angelegt werden. Bitte prüfe den Supabase-Service-Key oder führe die Migration 202610120005_mod_covers.sql aus.",
        },
        { status: 500 },
      );
    }
    const { data, error } = await admin.storage
      .from("mod-covers")
      .createSignedUploadUrl(filePath, { upsert: false });
    if (error || !data?.token) {
      console.error("Failed to create a signed mod cover upload URL.", error);
      return NextResponse.json(
        {
          error: `Supabase konnte den sicheren Cover-Upload-Link nicht erstellen${error?.message ? `: ${error.message}` : "."}`,
        },
        { status: 500 },
      );
    }
    return NextResponse.json({ path: filePath, token: data.token, mime: coverType.mime });
  }

  if (body?.action === "cover-verify") {
    const filePath = typeof body.filePath === "string" ? body.filePath : "";
    if (!validCoverPath(filePath)) {
      return NextResponse.json({ error: "Ungültiger Cover-Dateischlüssel." }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data: objects, error: listError } = await admin.storage
      .from("mod-covers")
      .list("", { search: filePath });
    const object = objects?.find((item) => item.name === filePath);
    const size = object?.metadata?.size;
    const mime = COVER_TYPES[extensionFor(filePath)]?.mime;
    if (
      listError ||
      !object ||
      typeof size !== "number" ||
      size <= 0 ||
      size > MAX_COVER_BYTES ||
      object.metadata?.mimetype !== mime
    ) {
      return NextResponse.json(
        { error: "Cover-Upload fehlt oder überschreitet die Größenbegrenzung von 5 MB." },
        { status: 400 },
      );
    }
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!baseUrl || !serviceKey)
      return NextResponse.json({ error: "Storage ist nicht konfiguriert." }, { status: 500 });
    const response = await fetch(`${baseUrl}/storage/v1/object/public/mod-covers/${filePath}`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Range: "bytes=0-15",
      },
    });
    if (response.status !== 206)
      return NextResponse.json(
        { error: "Das Cover konnte nicht sicher geprüft werden." },
        { status: 400 },
      );
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!coverSignature(filePath, bytes))
      return NextResponse.json(
        { error: "Das gespeicherte Cover besitzt keine passende Bildsignatur." },
        { status: 400 },
      );
    const { data: publicUrl } = admin.storage.from("mod-covers").getPublicUrl(filePath);
    return NextResponse.json({ ok: true, imageUrl: publicUrl.publicUrl });
  }

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
