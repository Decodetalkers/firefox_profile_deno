import * as fs from "@std/fs";
import * as path from "@std/path";
import * as log from "@std/log";
import { CommonDecoder, CommonEncoder } from "./common.ts";

import { ProfileFinder } from "./profile_finder.ts";

import { type AddonInfo, getID, readExtInfo } from "@nobody/xpi-util";
export type { AddonInfo };

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
  noProxy?: boolean;
}

export type ProxySettings =
  | NoProxySettings
  | SystemProxySettings
  | AutomaticProxySettings
  | ManualProxySettings;

export interface CopyFromUserProfileOptions {
  name: string;
  userProfilePath?: string;
  destinationDirectory?: string;
}

// only '1' found in proxy.js
const ffValues = {
  direct: 0,
  manual: 1,
  pac: 2,
  system: 3,
};

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
  [key: string]: string | number | boolean | undefined;
};

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

  private copy(profileDirectory: string, cb: (err: Error | null) => void) {
    try {
      fs.copySync(
        profileDirectory,
        this.profileDir,
      );
    } catch (e) {
      cb(e as Error);
    }
  }

  static copy = function (
    options: ConstructorOptions,
    cb?: (err: Error | null, profile?: FirefoxProfile) => void,
  ) {
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
    profile.copy(opts.profileDirectory, function () {
      cb && cb(null, profile);
    });
  };

  static CopyFromUserProfile(
    opts: CopyFromUserProfileOptions,
    cb?: (err: Error | null, profile?: FirefoxProfile) => void,
  ) {
    if (!opts.name) {
      cb &&
        cb(
          new Error(
            "firefoxProfile: .copyFromUserProfile() requires a name options",
          ),
        );
      return;
    }
    const finder = new ProfileFinder(opts.userProfilePath);
    finder.getPath(opts.name, function (err, profilePath) {
      if (err) {
        cb && cb(err);
        return;
      }
      FirefoxProfile.copy(
        {
          destinationDirectory: opts.destinationDirectory,
          profileDirectory: profilePath,
        },
        cb,
      );
    });
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

  get willDeleteOnExit(): boolean {
    return this.deleteOnExit;
  }

  get path(): string {
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
    const data = CommonEncoder.encode(content);
    await Deno.writeFile(this.userPrefs, data);
  }

  private readExistingUserjs() {
    const regExp = /user_pref\(['"](.*)["'],\s*(.*)\)/;
    const data = Deno.readFileSync(this.userPrefs);
    const contentLines = CommonDecoder.decode(data).split("\n");
    for (const line of contentLines) {
      const found = line.match(regExp);
      if (found) {
        this.defaultPreferences[found[1]] = found[2];
      }
    }
  }

  addExtensions(
    extensions: string[],
    cb: (err: Error | null, addonDetails?: AddonInfo) => void,
  ): Promise<void[]> {
    const promises = extensions.map(async (extension) => {
      const normalizedExtension = path.normalize(extension);
      return await this.addExtension(normalizedExtension, cb);
    });
    return Promise.all(promises);
  }

  async addExtension(
    extension: string,
    cb: (err: Error | null, addonDetails?: AddonInfo) => void,
  ): Promise<void> {
    if (!fs.existsSync(extension)) {
      cb(new Error("file does exist"));
      return;
    }
    const isDir = (await Deno.stat(extension)).isDirectory;
    if (!isDir && path.extname(extension) !== ".xpi") {
      cb(new Error("Just accept extname with xpi"));
      return;
    }
    try {
      const addonDetailsResult = await readExtInfo(extension, CommonDecoder);
      if (addonDetailsResult.is_err()) {
        cb(addonDetailsResult.err()!);
        return;
      }

      const addonDetails = addonDetailsResult.unwrap().info;
      const addonId = getID(addonDetails);
      if (!addonId) {
        cb(new Error("FirefoxProfile: the addon id could not be found!"));
        return;
      }
      const addonXpiName = addonId + ".xpi";
      let addonPath;
      if (isDir) {
        addonPath = path.join(
          this.extensionDir,
          addonId,
        );
      } else {
        addonPath = path.join(
          this.extensionDir,
          addonXpiName,
        );
      }
      await fs.ensureDir(this.extensionDir);

      await fs.copy(extension, addonPath);
      cb(null, addonDetails);
    } catch (e) {
      cb(e as Error);
    }
  }

  /**
   * Set network proxy settings.
   *
   * The parameter `proxy` is a hash which structure depends on the value of mandatory `proxyType` key,
   * which takes one of the following string values:
   *
   * * `direct` - direct connection (no proxy)
   * * `system` - use operating system proxy settings
   * * `pac` - use automatic proxy configuration set based on the value of `autoconfigUrl` key
   * * `manual` - manual proxy settings defined separately for different protocols using values from following keys:
   * `ftpProxy`, `httpProxy`, `sslProxy`, `socksProxy`
   *
   * Examples:
   *
   * * set automatic proxy:
   *
   *      profile.setProxy({
   *          proxyType: 'pac',
   *          autoconfigUrl: 'http://myserver/proxy.pac'
   *      });
   *
   * * set manual http proxy:
   *
   *      profile.setProxy({
   *          proxyType: 'manual',
   *          httpProxy: '127.0.0.1:8080'
   *      });
   *
   * * set manual http and https proxy:
   *
   *      profile.setProxy({
   *          proxyType: 'manual',
   *          httpProxy: '127.0.0.1:8080',
   *          sslProxy: '127.0.0.1:8080'
   *      });
   */
  setProxy(proxy: ProxySettings): void {
    if (!proxy || !proxy.proxyType) {
      throw new Error("firefoxProfile: not a valid proxy type");
    }
    this.setPreference("network.proxy.type", ffValues[proxy.proxyType]);
    switch (proxy.proxyType) {
      case "manual":
        if (proxy.noProxy) {
          this.setPreference("network.proxy.no_proxies_on", proxy.noProxy);
        }
        this.setManualProxyPreference("ftp", proxy.ftpProxy);
        this.setManualProxyPreference("http", proxy.httpProxy);
        this.setManualProxyPreference("ssl", proxy.sslProxy);
        this.setManualProxyPreference("socks", proxy.socksProxy);
        break;
      case "pac":
        this.setPreference("network.proxy.autoconfig_url", proxy.autoConfigUrl);
        break;
    }
  }

  setNativeEventsEnabled(val: boolean) {
    this.defaultPreferences["webdriver_enable_native_events"] = val;
  }

  /**
   * return true if native events are eanbled
   */
  get nativeEnventsEnabled(): boolean {
    const enabled = this.defaultPreferences["webdriver_enable_native_events"];
    return enabled === true || enabled === "true";
  }

  private setManualProxyPreference(key: string, setting: string | undefined) {
    if (!setting || setting === "") {
      return;
    }
    const hostDetails = setting.split(":");
    this.setPreference("network.proxy." + key, hostDetails[0]);
    if (hostDetails[1]) {
      this.setPreference(
        "network.proxy." + key + "_port",
        parseInt(hostDetails[1], 10),
      );
    }
  }
}
