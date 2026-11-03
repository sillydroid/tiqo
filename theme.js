/**
 * TIKO — Universal Theme Manager (Dark & Light Mode)
 * Persists theme selection and automatically toggles between logo.png (dark) & logos.png (light)
 */
(function () {
  const THEME_KEY = "tiko_theme";

  function getSavedTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark") return saved;
    } catch (e) {}
    return "dark"; // Default to dark mode
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {}

    // Update all logo images across the page
    const logos = document.querySelectorAll(".logo-img, .splash-logo, .footer-logo, .admin-logo");
    logos.forEach((img) => {
      if (theme === "light") {
        img.src = "assets/logos.png";
      } else {
        img.src = "assets/logo.png";
      }
    });

    // Update all theme toggle buttons
    const toggles = document.querySelectorAll(".theme-toggle-btn");
    toggles.forEach((btn) => {
      btn.setAttribute("aria-label", theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode");
      btn.setAttribute("title", theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode");
      if (theme === "light") {
        btn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        `;
      } else {
        btn.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
          </svg>
        `;
      }
    });
  }

  // Set theme attribute immediately on script load to eliminate FOUC
  const initialTheme = getSavedTheme();
  document.documentElement.setAttribute("data-theme", initialTheme);

  // Initialize once DOM is ready
  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(getSavedTheme());

    // Bind event listeners to all theme toggles
    document.addEventListener("click", (e) => {
      const toggle = e.target.closest(".theme-toggle-btn");
      if (toggle) {
        e.preventDefault();
        const current = document.documentElement.getAttribute("data-theme") || "dark";
        const next = current === "light" ? "dark" : "light";
        applyTheme(next);
      }
    });
  });

  window.tikoTheme = {
    get: () => document.documentElement.getAttribute("data-theme") || "dark",
    set: applyTheme,
    toggle: () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      applyTheme(current === "light" ? "dark" : "light");
    }
  };
})();
