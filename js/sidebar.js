/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — sidebar.js
   Sidebar navigation and mobile menu functionality.
   ═══════════════════════════════════════════════ */

import app from './state.js';

const sidebar = {
  init: function () {
    console.log("Initializing sidebar...");
    
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const items = document.querySelectorAll('.sidebar-item');
    const toggleBtn = document.getElementById('mobileMenuToggle');

    console.log("Sidebar elements found:", {
      items: items.length,
      sidebar: !!sidebar,
      overlay: !!overlay,
      toggleBtn: !!toggleBtn
    });

    const closeSidebar = () => {
      console.log("Closing sidebar");
      if (sidebar) sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('active');
    };

    const openSidebar = () => {
      console.log("Opening sidebar");
      if (sidebar) sidebar.classList.add('open');
      if (overlay) overlay.classList.add('active');
    };

    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        console.log("Menu toggle clicked", e);
        e.preventDefault();
        e.stopPropagation();
        
        if (sidebar && sidebar.classList.contains('open')) {
          closeSidebar();
        } else {
          openSidebar();
        }
      });
      
      // Also add touch event for mobile
      toggleBtn.addEventListener('touchstart', (e) => {
        console.log("Menu toggle touched", e);
        e.preventDefault();
        e.stopPropagation();
        
        if (sidebar && sidebar.classList.contains('open')) {
          closeSidebar();
        } else {
          openSidebar();
        }
      });
    } else {
      console.warn("Mobile menu toggle button not found!");
    }

    if (overlay) {
      overlay.addEventListener('click', closeSidebar);
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
          closeSidebar();
        }
      });
    });

    // Close sidebar when navigating away/resizing to desktop
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        closeSidebar();
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
      if (sectionId === 'bulk-scores' && app.ui) {
        app.ui.renderBulkTable();
      }
    }
  }
};

// Export sidebar module and assign to global app
app.sidebar = sidebar;
export default sidebar;
