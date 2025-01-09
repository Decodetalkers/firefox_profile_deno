import * as fs from "@std/fs";
import * as path from "@std/path";
import * as log from "@std/log";

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

function parseOptions(
  options?: ConstructorOptions | string,
): ConstructorOptions {
  if (typeof options === "string") {
    return { profileDirectory: options };
  }
  return options || {};
}

export type PrefercenceMap = {
  [key: string]: string | number | boolean;
};

const decoder = new TextDecoder("utf-8");
const encoder = new TextEncoder();
export default class FirefoxProfile {
  private profileDir: string;
  private extensionDir: string;
  private userPrefs: string;
  private defaultPreferences: PrefercenceMap;
  private deleteOnExit: boolean;

  private preferencesModified: boolean = false;
  private onSigInt: () => void;
  private onExit: () => void;

  constructor(options?: ConstructorOptions | string) {
    const opts = parseOptions(options);
    const hasDestDir = opts?.destinationDirectory;
    const profileCopied = opts.profileDirectory;
    this.defaultPreferences = { ...config.DEFAULT_PREFERENCES };
    this.deleteOnExit = !hasDestDir;
    if (!profileCopied) {
      this.profileDir = opts.destinationDirectory || this.createTempFolder();
    } else {
      // NOTE: copy the existed profileDir
      const tmpDir = opts.destinationDirectory ||
        this.createTempFolder("copy-");
      fs.copySync(opts.profileDirectory!, tmpDir, {});
      this.profileDir = tmpDir;
    }
    this.extensionDir = path.join(this.profileDir, "extensions");
    log.debug(`extensionDir is ${this.extensionDir}`);
    this.userPrefs = path.join(this.profileDir, "user.js");
    this.onSigInt = () => {
      Deno.exit(0);
    };

    this.onExit = () => {
      if (this.deleteOnExit) {
        this.cleanOnExit();
      }
    };
    if (fs.existsSync(this.userPrefs)) {
      this.readExistingUserjs();
    }
    globalThis.addEventListener("unload", this.onExit);
    Deno.addSignalListener("SIGINT", this.onSigInt);
  }

  private cleanOnExit() {
    if (fs.existsSync(this.profileDir)) {
      try {
        Deno.removeSync(this.profileDir, { recursive: true });
      } catch (e) {
        log.warn(
          "[firefox-profile] cannot delete profileDir on exit",
          this.profileDir,
          e,
        );
      }
    }
  }
  private createTempFolder(prefix?: string): string {
    return Deno.makeTempDirSync({ prefix: prefix || "firefox-profile" });
  }

  public deleteDir(cb?: () => void): void {
    globalThis.removeEventListener("unload", this.onExit);
    Deno.removeSignalListener("SIGINT", this.onSigInt);
    fs.exists(this.profileDir).then((doesExist) => {
      if (!doesExist) {
        cb && cb();
        return;
      }
      Deno.remove(this.profileDir).then((_) => {
        cb && cb();
      });
    });
  }

  public path(): string {
    return this.profileDir;
  }

  public setPreference(key: string, value: string | number | boolean) {
    let cleanValue = value.toString();
    if (typeof value === "string") {
      cleanValue = '"' + value.replace("\n", "\\n") + '"';
    }
    this.defaultPreferences[key] = cleanValue;
    this.preferencesModified = true;
  }

  public async updatePreferences() {
    if (!this.preferencesModified) {
      return;
    }
    const userPrefs = this.defaultPreferences;
    let content = "";
    Object.keys(userPrefs).forEach(function (val) {
      content = content + 'user_pref("' + val + '", ' + userPrefs[val] + ");\n";
    });
    if (content.length == 0) {
      return;
    }
    const data = encoder.encode(content);
    await Deno.writeFile(this.userPrefs, data);
  }

  private readExistingUserjs() {
    const regExp = /user_pref\(['"](.*)["'],\s*(.*)\)/;
    const data = Deno.readFileSync(this.userPrefs);
    const contentLines = decoder.decode(data).split("\n");
    for (const line of contentLines) {
      const found = line.match(regExp);
      if (found) {
        this.defaultPreferences[found[1]] = found[2];
      }
    }
  }
}
