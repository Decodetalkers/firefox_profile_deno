import * as xml from "@libs/xml";
import { ProfileFinder } from "./profile_finder.ts";

import * as fs from "@std/fs";
import * as path from "@std/path";
export interface ConstructorOptions {
  profileDirectory?: string;
  destinationDirectory?: string;
}

export interface NoProxySettings {
  proxyType: "direct";
}

export interface SystemProxySettings {
  proxyType: "system";
}

export interface AutomaticProxySettings {
  proxyType: "pac";
  autoConfigUrl: string;
}

export interface ManualProxySettings {
  proxyType: "manual";
  ftpProxy?: string;
  httpProxy?: string;
  sslProxy?: string;
  socksProxy?: string;
}

export type ProxySettings =
  | NoProxySettings
  | SystemProxySettings
  | AutomaticProxySettings
  | ManualProxySettings;

export interface AddonDetails {
  id: string;
  name: string;
  version: string;
  unpack: boolean;
  isNative: boolean;
}

export interface CopyFromUserProfileOptions {
  name: string;
  userProfilePath?: string;
  destinationDirectory?: string;
}

const config = {
  // from python... Not used
  // WEBDRIVER_EXT: 'webdriver.xpi',
  // EXTENSION_NAME: 'fxdriver@googlecode.com',
  ANONYMOUS_PROFILE_NAME: "WEBDRIVER_ANONYMOUS_PROFILE",
  DEFAULT_PREFERENCES: {
    "app.update.auto": "false",
    "app.update.enabled": "false",
    "browser.download.manager.showWhenStarting": "false",
    "browser.EULA.override": "true",
    "browser.EULA.3.accepted": "true",
    "browser.link.open_external": "2",
    "browser.link.open_newwindow": "2",
    "browser.offline": "false",
    "browser.safebrowsing.enabled": "false",
    "browser.search.update": "false",
    "extensions.blocklist.enabled": "false",
    "browser.sessionstore.resume_from_crash": "false",
    "browser.shell.checkDefaultBrowser": "false",
    "browser.tabs.warnOnClose": "false",
    "browser.tabs.warnOnOpen": "false",
    "browser.startup.page": "0",
    "browser.safebrowsing.malware.enabled": "false",
    "startup.homepage_welcome_url": '"about:blank"',
    "devtools.errorconsole.enabled": "true",
    "dom.disable_open_during_load": "false",
    "extensions.autoDisableScopes": 10,
    "extensions.logging.enabled": "true",
    "extensions.update.enabled": "false",
    "extensions.update.notifyUser": "false",
    "network.manage-offline-status": "false",
    "network.http.max-connections-per-server": "10",
    "network.http.phishy-userpass-length": "255",
    "offline-apps.allow_by_default": "true",
    "prompts.tab_modal.enabled": "false",
    "security.fileuri.origin_policy": "3",
    "security.fileuri.strict_origin_policy": "false",
    "security.warn_entering_secure": "false",
    "security.warn_entering_secure.show_once": "false",
    "security.warn_entering_weak": "false",
    "security.warn_entering_weak.show_once": "false",
    "security.warn_leaving_secure": "false",
    "security.warn_leaving_secure.show_once": "false",
    "security.warn_submit_insecure": "false",
    "security.warn_viewing_mixed": "false",
    "security.warn_viewing_mixed.show_once": "false",
    "signon.rememberSignons": "false",
    "toolkit.networkmanager.disable": "true",
    "toolkit.telemetry.enabled": "false",
    "toolkit.telemetry.prompted": "2",
    "toolkit.telemetry.rejected": "true",
    "javascript.options.showInConsole": "true",
    "browser.dom.window.dump.enabled": "true",
    webdriver_accept_untrusted_certs: "true",
    webdriver_enable_native_events: "true",
    webdriver_assume_untrusted_issuer: "true",
    "dom.max_script_run_time": "30",
  },
};

/**
 * Regex taken from XPIProvider.jsm in the Addon Manager to validate proper
 * IDs that are able to be used:
 * https://searchfox.org/mozilla-central/rev/c8ce16e4299a3afd560320d8d094556f2b5504cd/toolkit/mozapps/extensions/internal/XPIProvider.jsm#182
 */
function isValidAOMAddonId(s: string) {
  return /^(\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}|[a-z0-9-\._]*\@[a-z0-9-\._]+)$/i
    .test(
      s || "",
    );
}

export function copyFromUserProfile(
  options: CopyFromUserProfileOptions,
  cb: (err: Error | null, profile?: FirefoxProfile) => void,
): void {
}

function parseOptions(
  options?: ConstructorOptions | string,
): ConstructorOptions {
  if (typeof options === "string") {
    return { profileDirectory: options };
  }
  return options || {};
}

export default class FirefoxProfile {
  static Finder: typeof ProfileFinder;

  private profileDir: string;
  private extensionDir: string;
  private userPrefs: string;
  // deno-lint-ignore no-explicit-any
  private defaultPreferences: any;
  private deleteOnExit: boolean;
  private deleteZippedProfile: boolean = true;
  private preferencesModified: boolean = false;
  public static copy(
    options?: ConstructorOptions | string | undefined,
    cb?: (err: Error | null, profile?: FirefoxProfile) => void,
  ): void {
    const opts = parseOptions(options);
    if (!opts.profileDirectory) {
      cb &&
        cb(
          new Error("firefoxProfile: .copy() requires profileDirectory option"),
        );
      return;
    }
    const profile = new FirefoxProfile({
      profileDirectory: opts.profileDirectory,
      destinationDirectory: opts.destinationDirectory,
    });
    profile._copy(opts.profileDirectory);
  }
  public onExit: () => void;
  public onSigInt: () => void;
  constructor(options?: ConstructorOptions | string) {
    const opts = parseOptions(options);
    const hasDestDir = opts?.destinationDirectory;
    const profileDirPre = opts.profileDirectory;
    this.defaultPreferences = { ...config.DEFAULT_PREFERENCES };
    this.deleteOnExit = !hasDestDir;
    if (!profileDirPre) {
      this.profileDir = opts.destinationDirectory || this.createTempFolder();
    } else {
      const tmpDir = opts.destinationDirectory ||
        this.createTempFolder("copy-");
      // TODO:
      fs.copySync(opts.profileDirectory!, tmpDir, {});
      this.profileDir = tmpDir;
    }
    this.extensionDir = path.join(this.profileDir, "extensions");
    this.userPrefs = path.join(this.profileDir, "user.js");
    if (fs.existsSync(this.userPrefs)) {
      this.readExistingUserjs();
    }
    this.onExit = function () {
      if (this.deleteOnExit) {
        this.cleanOnExit();
      }
    };
    this.onSigInt = () => Deno.exit(130);
    Deno.addSignalListener("SIGQUIT", this.onExit);
    Deno.addSignalListener("SIGINT", this.onSigInt);
  }
  private cleanOnExit() {
  }
  // TODO: fix me
  private createTempFolder(prefix?: string): string {
    return Deno.makeTempDirSync({ prefix: prefix || "firefox-profile" });
  }
  private addonDetails(addonPath: string) {
    let details = {
      id: null,
      name: null,
      unpack: true,
      version: null,
      isNative: false,
    };
  }
  public deleteDir(cb: () => void): void {
  }
  public path(): string {
    return "";
  }
  private readExistingUserjs() {
    // TODO:
  }
  private _copy(dir: string) {
    fs.copySync(dir, this.profileDir);
  }
}
