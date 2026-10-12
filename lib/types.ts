export type Profile = {
  id: string;
  username: string;
  role: "owner" | "co_owner" | "admin" | "user";
  status: "pending" | "active" | "suspended";
  created_at: string;
  premium: boolean;
  bio: string;
  avatar_path: string | null;
  avatar_url?: string | null;
  settings: {
    accent?: string;
    wallpaper?: string;
  };
};

export function isStaffRole(role: string) {
  return role === "owner" || role === "co_owner" || role === "admin";
}

export type ModVersion = {
  id: string;
  mod_id: string;
  version: string;
  minecraft_version: string;
  loaders: string[];
  changelog: string;
  file_path: string;
  file_size: number;
  created_at: string;
  downloads: number;
  premium_only: boolean;
  published: boolean;
};

export type AssetType = "mod" | "schematic" | "resourcepack";

export function isAssetType(value: unknown): value is AssetType {
  return value === "mod" || value === "schematic" || value === "resourcepack";
}

export type Mod = {
  id: string;
  name: string;
  slug: string;
  description: string;
  asset_type: AssetType;
  category: string;
  image_url: string | null;
  active: boolean;
  created_at: string;
  mod_versions: ModVersion[];
};

export type Invite = {
  id: string;
  reference: string;
  expires_at: string;
  used_at: string | null;
  disabled: boolean;
  created_at: string;
};
