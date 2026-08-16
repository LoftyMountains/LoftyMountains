(() => {
  try {
    const value = localStorage.getItem("jingxing-theme");
    document.documentElement.dataset.theme = value === "light" || value === "dark" || value === "system" ? value : "system";
  } catch {
    document.documentElement.dataset.theme = "system";
  }
})();
