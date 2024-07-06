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

export default class FirefoxProfile {
  static copy(
    options: ConstructorOptions | string | null | undefined,
    cb: (err: Error | null, profile?: FirefoxProfile) => void,
  ): void {
  }
  static copyFromUserProfile(
    options: CopyFromUserProfileOptions,
    cb: (err: Error | null, profile?: FirefoxProfile) => void,
  ): void {
  }
  constructor(options?: ConstructorOptions | string) {
  }
}
