(() => {
  const lightColor = "#f4f5f7";
  const darkColor = "#0b0d10";
  const meta = document.querySelector('meta[name="theme-color"]');
  const syncBrowserChrome = (mode) => {
    if (!meta) return;
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches || false;
    meta.content = mode === "dark" || (mode === "system" && prefersDark) ? darkColor : lightColor;
  };
  try {
    const value = localStorage.getItem("jingxing-theme");
    const mode = value === "light" || value === "dark" || value === "system" ? value : "system";
    document.documentElement.dataset.theme = mode;
    syncBrowserChrome(mode);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener?.("change", () => syncBrowserChrome(document.documentElement.dataset.theme || "system"));
  } catch {
    document.documentElement.dataset.theme = "system";
    syncBrowserChrome("system");
  }
})();
