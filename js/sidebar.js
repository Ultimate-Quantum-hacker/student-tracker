/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — sidebar.js
   Sidebar navigation and mobile menu functionality.
   ═══════════════════════════════════════════════ */

import app from './state.js';

const sidebar = {
  initialized: false,

  init: function () {
    if (this.initialized) return;
    this.initialized = true;

    console.log("Initializing sidebar...");
    
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const items = document.querySelectorAll('.sidebar-item');
    const toggleBtn = document.getElementById('mobileMenuToggle');
    const appMain = document.getElementById('app-main');
    let isSidebarOpen = true;

    console.log("Sidebar elements found:", {
      items: items.length,
      sidebar: !!sidebar,
      overlay: !!overlay,
      toggleBtn: !!toggleBtn
    });

    const isMobileViewport = () => window.innerWidth <= 768;

    const applySidebarState = () => {
      if (!sidebar) return;

      sidebar.classList.toggle('open', isSidebarOpen);
      sidebar.classList.toggle('closed', !isSidebarOpen);

      if (appMain) {
        appMain.classList.toggle('sidebar-collapsed', !isSidebarOpen);
      }

      if (overlay) {
        const shouldShowOverlay = isMobileViewport() && isSidebarOpen;
        overlay.classList.toggle('active', shouldShowOverlay);
      }

      if (toggleBtn) {
        toggleBtn.setAttribute('aria-expanded', String(isSidebarOpen));
        toggleBtn.title = isSidebarOpen ? 'Close menu' : 'Open menu';
      }
    };

    const setSidebarOpen = (nextState) => {
      isSidebarOpen = Boolean(nextState);
      applySidebarState();
    };

    const toggleSidebar = () => {
      setSidebarOpen(!isSidebarOpen);
    };

    if (isMobileViewport()) {
      setSidebarOpen(false);
    } else {
      applySidebarState();
    }

    if (toggleBtn) {
      toggleBtn.setAttribute('aria-controls', 'sidebar-nav');
      toggleBtn.setAttribute('aria-expanded', String(isSidebarOpen));

      toggleBtn.addEventListener('click', (e) => {
        console.log("Menu toggle clicked", e);
        e.preventDefault();
        e.stopPropagation();

        toggleSidebar();
      });
    } else {
      console.warn("Mobile menu toggle button not found!");
    }

    if (overlay) {
      overlay.addEventListener('click', () => {
        setSidebarOpen(false);
      });
    }

    items.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = item.dataset.section;
        console.log("Sidebar item clicked:", section);
        this.showSection(section);

        // Update active state
        items.forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        // Close mobile sidebar after selection
        if (window.innerWidth <= 768) {
          setSidebarOpen(false);
        }
      });
    });

    // Close sidebar when navigating away/resizing to desktop
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    });
    
    console.log("Sidebar initialization complete");
  },

  showSection: function (sectionId) {
    const sections = document.querySelectorAll('.content-section');
    sections.forEach(section => section.classList.remove('active'));

    const activeSection = document.getElementById(sectionId);
    if (activeSection) {
      activeSection.classList.add('active');
      // Render bulk table when bulk-scores section is shown
      if (window.TrackerApp && window.TrackerApp.ui) {
        if (sectionId === 'bulk-scores') {
          window.TrackerApp.ui.renderBulkTable();
        }
        if (sectionId === 'account-settings') {
          window.TrackerApp.ui.renderAccountSettings({ preserveFeedback: true });
        }
      }
    }
  }
};

app.sidebar = sidebar;

// Export sidebar module
export default sidebar;
