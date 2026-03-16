/* Sidebar Navigation Handler */
(function (app) {
  'use strict';
  
  app.sidebar = {
    init: function () {
      const items = document.querySelectorAll('.sidebar-item');
      items.forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          const section = item.dataset.section;
          this.showSection(section);
          
          // Update active state
          items.forEach(i => i.classList.remove('active'));
          item.classList.add('active');
        });
      });
    },

    showSection: function (sectionId) {
      const sections = document.querySelectorAll('.content-section');
      sections.forEach(section => section.classList.remove('active'));
      
      const activeSection = document.getElementById(sectionId);
      if (activeSection) {
        activeSection.classList.add('active');
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
