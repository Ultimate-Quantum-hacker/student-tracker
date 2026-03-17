/* Sidebar Navigation Handler */
(function (app) {
  'use strict';
  
  app.sidebar = {
    init: function () {
      const items = document.querySelectorAll('.sidebar-item');
      const sidebar = document.querySelector('.sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      const toggleBtn = document.getElementById('mobileMenuToggle');

      const closeSidebar = () => {
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
      };

      const openSidebar = () => {
        if (sidebar) sidebar.classList.add('open');
        if (overlay) overlay.classList.add('active');
      };

      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          if (sidebar && sidebar.classList.contains('open')) {
            closeSidebar();
          } else {
            openSidebar();
          }
        });
      }

      if (overlay) {
        overlay.addEventListener('click', closeSidebar);
      }

      items.forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const section = item.dataset.section;
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
    },

    showSection: function (sectionId) {
      const sections = document.querySelectorAll('.content-section');
      sections.forEach(section => section.classList.remove('active'));

      const activeSection = document.getElementById(sectionId);
      if (activeSection) {
        activeSection.classList.add('active');
        // Render bulk table when bulk-scores section is shown
        if (sectionId === 'bulk-scores' && window.TrackerApp && window.TrackerApp.ui) {
          window.TrackerApp.ui.renderBulkTable();
        }
      }
    }
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.sidebar.init());
  } else {
    app.sidebar.init();
  }

})(window.TrackerApp);
