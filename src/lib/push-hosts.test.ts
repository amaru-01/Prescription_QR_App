import { afterEach, describe, expect, it } from "vitest";

import { isAllowedPushEndpoint } from "./push-hosts";

afterEach(() => {
  delete process.env.PUSH_ALLOWED_HOSTS;
});

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
    "https://web.push.apple.com/abc",
  ])("accepts %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc", // not https
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/push",
    "https://internal.example.com/hook",
    "https://fcm.googleapis.com.evil.com/x", // lookalike suffix
    "https://evilfcm.googleapis.com/x",
    "https://evil.com/fcm.googleapis.com",
    "https://fcm.googleapis.com@evil.com/x", // userinfo trick -> host is evil.com
    "https://user:pw@fcm.googleapis.com/x", // credentials
    "https://fcm.googleapis.com:8443/x", // custom port
    "https://push.services.mozilla.com/x", // bare suffix domain itself is not a push host
    "not a url",
  ])("rejects %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });

  it("allows extra hosts from PUSH_ALLOWED_HOSTS", () => {
    process.env.PUSH_ALLOWED_HOSTS = "push.internal.example, .corp.example";
    expect(isAllowedPushEndpoint("https://push.internal.example/x")).toBe(true);
    expect(isAllowedPushEndpoint("https://a.corp.example/x")).toBe(true);
    expect(isAllowedPushEndpoint("https://other.example/x")).toBe(false);
  });
});
