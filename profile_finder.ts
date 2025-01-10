import { locateUserDirectory } from "./envs.ts";

import * as ini from "@std/ini";

import * as path from "@std/path";
import { ConstDecoder } from "./common.ts";

export class ProfileFinder {
  public directory: string;
  public profiles: string[];
  public hasReadProfiles = false;

  constructor(directory?: string) {
    this.directory = directory || locateUserDirectory();
    this.profiles = [];
  }

  public async readProfiles(
    cb: (err: Error | null, profiles?: string[]) => void,
  ) {
    if (this.hasReadProfiles) {
      cb(null, this.profiles);
      return;
    }

    const result = await Deno.readFile(
      path.join(this.directory, "profiles.ini"),
    );
    const data = ConstDecoder.decode(result);
    Object.entries(ini.parse(data)).forEach(([key, value]) => {
      if (typeof key === "string" && key.match(/^Profile/)) {
        this.profiles.push(value as string);
      }
    });
    this.hasReadProfiles = true;
    cb(null, this.profiles);
  }

  public getPath(
    name: string,
    cb: (err: Error | null, path: string | undefined) => void,
  ): string | undefined {
    const findInProfiles = (
      name: string,
      cb: (err: Error | null, path: string | undefined) => void,
    ) => {
      let pathFound;
      const found = this.profiles.find((profile) => profile === name);
      if (found) {
        pathFound = path.isAbsolute(found)
          ? found
          : path.join(this.directory, found);
      }
      cb &&
        cb(found ? null : new Error("cannot find profile " + name), pathFound);
      return pathFound;
    };
    if (!this.hasReadProfiles) {
      this.readProfiles(() => findInProfiles(name, cb));
      return;
    }
    return findInProfiles(name, cb);
  }
}
