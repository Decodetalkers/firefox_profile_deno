import * as log from "@std/log";
import { FirefoxProfile } from "./mod.ts";

const profile = new FirefoxProfile();

log.info(profile.path);

profile.setPreference("urlclassifier.updateinterval", 172800);

await profile.updatePreferences();

await profile.addExtension("./asserts/test.xpi", (_, details) => {
  log.info(details);
});

const server = Deno.serve((_req) => new Response("Hello, world"));

Deno.addSignalListener("SIGINT", () => {
  server.shutdown();
});
