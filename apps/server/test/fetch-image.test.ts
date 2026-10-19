import { expect, test } from "bun:test";

import { isPublicAddress } from "../src/lib/fetch-image.ts";

test.each([
  "127.0.0.1",
  "10.1.2.3",
  "172.20.0.1",
  "192.168.1.10",
  "169.254.169.254",
  "100.64.0.1",
  "0.0.0.0",
  "::1",
  "::",
  "::ffff:127.0.0.1",
  "64:ff9b::10.0.0.1",
  "::ffff:7f00:1",
  "0:0:0:0:0:ffff:a00:1",
  "::127.0.0.1",
  "2002:7f00:1::",
  "2001:0:4136:e378::1",
  "fd00::1",
  "fe80::1",
])("blocks %s", (address) => {
  expect(isPublicAddress(address)).toBe(false);
});

test.each([
  "8.8.8.8",
  "142.250.80.27",
  "2606:4700::6810:85e5",
  "::ffff:8.8.8.8",
])("allows %s", (address) => {
  expect(isPublicAddress(address)).toBe(true);
});
