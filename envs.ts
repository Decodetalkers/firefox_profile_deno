import * as path from "@std/path";
import * as fs from "@std/fs";

export const userHomeDir = Deno.env.get("HOME");
export const defaultConfigDir = (() => {
  if (userHomeDir === undefined) {
    return undefined;
  }
  return path.join(
    Deno.env.get("XDG_CONFIG_DIR") ||
      path.join(userHomeDir, ".config"),
    "mozilla/firefox",
  );
})();
import * as log from "@std/log";
export function locateLinuxDirectory(): string {
  if (userHomeDir === undefined) {
    throw new Error("home dir cannot find");
  }
  const firefox_homes = [
    path.join(userHomeDir, "snap/firefox/common", ".mozilla/firefox"),
    path.join(userHomeDir, "snap/firefox/common", ".config/mozilla/firefox"),
    path.join(userHomeDir, ".var/app/org.mozilla.firefox", ".mozilla/firefox"),
    path.join(
      userHomeDir,
      ".var/app/org.mozilla.firefox",
      ".config/mozilla/firefox",
    ),
  ];
  for (const dir in firefox_homes) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  if (defaultConfigDir === undefined) {
    throw new Error("config dir cannot find");
  }
  if (!fs.existsSync(defaultConfigDir)) {
    log.warn(
      "detected firefox profile directory:",
      defaultConfigDir,
      "not found",
    );
  }
  return defaultConfigDir;
}

export function locateUserDirectory(platform?: string): string {
  const pa = platform || Deno.build.os;
  switch (pa) {
    case "darwin":
      if (userHomeDir === undefined) {
        throw new Error("home dir cannot find");
      }
      return path.join(userHomeDir, "/Library/Application Support/Firefox");
    case "linux":
      return locateLinuxDirectory();
    case "win32":
      return path.join(Deno.env.get("APPDATA")!, "/Mozilla/Firefox");
    default:
      throw new Error("unsupported platform" + platform);
  }
}
