import app from './state.js';

const dashboardUi = {
  parseDashboardStatValue: function (raw) {
    const parsed = Number(String(raw ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  },

  formatDashboardStatValue: function (value, format) {
    const numeric = this.toFiniteNumber(value);
    const safeValue = numeric === null ? 0 : numeric;
    if (format === 'percent') return `${Math.round(safeValue)}%`;
    if (format === 'decimal') return `${safeValue.toFixed(1)}%`;
    return Math.round(safeValue).toLocaleString();
  },

  animateDashboardStatValue: function (node, targetValue, format = 'int') {
    if (!node) return;

    const target = Number(targetValue);
    const safeTarget = Number.isFinite(target) ? target : 0;
    const currentTarget = Number(node.dataset.targetValue || NaN);
    if (Number.isFinite(currentTarget) && Math.abs(currentTarget - safeTarget) < 0.001) {
      node.textContent = this.formatDashboardStatValue(safeTarget, format);
      return;
    }

    const isFirstRun = !node.dataset.hasAnimated;
    const startValue = isFirstRun ? 0 : this.parseDashboardStatValue(node.textContent);
    const duration = isFirstRun ? 880 : 620;
    const startTime = performance.now();

    if (node._dashboardStatFrame) {
      cancelAnimationFrame(node._dashboardStatFrame);
    }

    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const animate = (time) => {
      const progress = Math.min((time - startTime) / duration, 1);
      const eased = easeOut(progress);
      const value = startValue + (safeTarget - startValue) * eased;
      node.textContent = this.formatDashboardStatValue(value, format);

      if (progress < 1) {
        node._dashboardStatFrame = requestAnimationFrame(animate);
        return;
      }

      node.textContent = this.formatDashboardStatValue(safeTarget, format);
      node.dataset.targetValue = String(safeTarget);
      node.dataset.hasAnimated = '1';
    };

    node._dashboardStatFrame = requestAnimationFrame(animate);
  },

  updateDashboardStats: function () {
    const fallbackTotal = app.state.students.length;
    const hasScopedTotal = Number.isFinite(Number(app.state.dashboardStudentCount));
    const shouldShowLoading = app.state.isLoading && !hasScopedTotal && fallbackTotal <= 0;

    if (shouldShowLoading && app.dom.statTotalStudents) {
      app.dom.statTotalStudents.textContent = 'Loading...';
    }

    const total = hasScopedTotal
      ? Number(app.state.dashboardStudentCount)
      : fallbackTotal;
    if (!shouldShowLoading) {
      this.animateDashboardStatValue(app.dom.statTotalStudents, total, 'int');
    }

    const latestExam = app.analytics.getLatestExam();
    const { groups: statusGroups } = app.analytics.groupStudentsByStatus(latestExam);
    const categories = app.analytics.getPerformanceCategories();
    const measured = (app.state.students || [])
      .map(student => app.analytics.getStudentAverageForExam(student, latestExam))
      .map(avg => Number(avg))
      .filter(avg => Number.isFinite(avg));

    const sum = measured.reduce((acc, value) => acc + value, 0);
    const count = measured.length;
    const pass = measured.filter(avg => avg >= 50).length;
    const atRisk = (statusGroups['at-risk'] || []).length;
    const countTargets = {
      strong: 'statStrongCount',
      good: 'statGoodCount',
      average: 'statAverageCount',
      borderline: 'statBorderlineCount',
      'at-risk': 'statAtRiskCountSummary'
    };

    const classAverage = count ? (sum / count) : 0;
    const passRate = count ? Math.round((pass / count) * 100) : 0;

    this.animateDashboardStatValue(app.dom.statClassAvg, classAverage, 'decimal');
    this.animateDashboardStatValue(app.dom.statPassRate, passRate, 'percent');
    if (app.dom.statFailRate) app.dom.statFailRate.textContent = count ? Math.round(((count - pass) / count) * 100) + '%' : '0%';
    this.animateDashboardStatValue(app.dom.statAtRiskCount, atRisk, 'int');

    categories.forEach(category => {
      const domKey = countTargets[category.key];
      if (domKey && app.dom[domKey]) {
        app.dom[domKey].textContent = (statusGroups[category.key] || []).length;
      }
    });

    this.renderDashboardPerformanceChart(statusGroups, categories);
  },

  renderDashboardPerformanceChart: function (statusGroups, categories) {
    if (!app.dom.dashboardPerformanceChart) return;

    const categoryCounts = (categories || []).map(category => ({
      ...category,
      count: (statusGroups?.[category.key] || []).length
    }));
    const maxCount = categoryCounts.reduce((max, item) => Math.max(max, item.count), 0);
    const step = Math.max(1, Math.ceil(Math.max(maxCount, 4) / 4));
    const scaleTop = step * 4;
    const yTicks = [4, 3, 2, 1, 0].map(multiplier => multiplier * step);

    const yAxisHtml = yTicks
      .map(tick => `<span class="dashboard-chart-tick">${tick}</span>`)
      .join('');

    const barsHtml = categoryCounts.map(item => {
      const barHeight = item.count > 0
        ? Math.max((item.count / scaleTop) * 100, 6)
        : 0;
      const tooltip = `${item.label} - ${item.count} student${item.count === 1 ? '' : 's'}`;

      return `
        <div class="dashboard-chart-col">
          <div class="dashboard-chart-col-inner">
            <div class="dashboard-chart-value">${item.count}</div>
            <div class="dashboard-chart-bar risk-${item.key}" style="height:${barHeight}%" title="${app.utils.esc(tooltip)}" aria-label="${app.utils.esc(tooltip)}"></div>
          </div>
          <div class="dashboard-chart-label">${item.label}</div>
        </div>
      `;
    }).join('');

    app.dom.dashboardPerformanceChart.innerHTML = `
      <div class="dashboard-chart-inner">
        <div class="dashboard-chart-y-axis" aria-label="Student count axis">
          ${yAxisHtml}
        </div>
        <div class="dashboard-chart-plot" aria-label="Category distribution bars">
          ${barsHtml}
        </div>
      </div>
    `;
  },

  applyLaunchRoute: function () {
    const params = new URLSearchParams(window.location.search);
    const sectionId = String(params.get('section') || '').trim();
    const requestedCategory = String(params.get('category') || '').trim();

    if (sectionId !== 'performance-analysis') {
      return;
    }

    if (requestedCategory) {
      this.openPerformanceCategory(requestedCategory);
      return;
    }

    this.showContentSection('performance-analysis');
    this.renderPerformanceAnalysisPanel();
  },

  openPerformanceCategory: function (categoryKey) {
    const categories = app.analytics.getPerformanceCategories();
    const fallbackCategory = categories[0]?.key || 'strong';
    const selectedCategory = categories.some(category => category.key === categoryKey)
      ? categoryKey
      : fallbackCategory;

    app.state.selectedPerformanceCategory = selectedCategory;
    if (app.dom.performanceCategorySelect) {
      app.dom.performanceCategorySelect.value = selectedCategory;
    }

    this.showContentSection('performance-analysis');

    this.renderPerformanceAnalysisPanel();
  },

  renderPerformanceAnalysisPanel: function () {
    if (!app.dom.performanceCategorySelect || !app.dom.performanceCategoryCounts || !app.dom.performanceFilteredList || !app.dom.performanceInterventionNeededList) return;

    const categories = app.analytics.getPerformanceCategories();
    const fallbackCategory = categories[0]?.key || 'strong';

    if (!app.dom.performanceCategorySelect.options.length) {
      app.dom.performanceCategorySelect.innerHTML = categories
        .map(option => `<option value="${option.key}">${option.label}</option>`)
        .join('');
    }

    if (!categories.some(option => option.key === app.state.selectedPerformanceCategory)) {
      app.state.selectedPerformanceCategory = fallbackCategory;
    }
    app.dom.performanceCategorySelect.value = app.state.selectedPerformanceCategory;

    const { groups, latestExam } = app.analytics.groupStudentsByStatus();
    app.dom.performanceCategoryCounts.innerHTML = categories.map(option => {
      const count = (groups[option.key] || []).length;
      return `<div class="performance-count-chip risk-${option.key}"><span>${option.label}</span><strong>${count}</strong></div>`;
    }).join('');

    const selectedList = groups[app.state.selectedPerformanceCategory] || [];
    const selectedLabel = categories.find(option => option.key === app.state.selectedPerformanceCategory)?.label || 'Category';
    const selectedRows = selectedList.map(item => `
      <div class="performance-analysis-item">
        <div>
          <div class="performance-analysis-name">${app.utils.esc(item.name)}</div>
          <div class="performance-analysis-meta">${latestExam ? `Latest exam: ${app.utils.esc(latestExam)}` : 'No exam data yet'}</div>
        </div>
        <div class="performance-analysis-side">
          <span class="risk-pill status-pill risk-${app.state.selectedPerformanceCategory}">${selectedLabel}</span>
          <span class="performance-analysis-avg">${item.average !== null && item.average !== undefined ? item.average.toFixed(1) + '%' : 'N/A'}</span>
        </div>
      </div>
    `).join('');

    app.dom.performanceFilteredList.innerHTML = selectedRows || `<p class="performance-analysis-empty">No students in ${selectedLabel} category.</p>`;

    const interventionRows = (groups['at-risk'] || []).map(item => `
      <div class="performance-analysis-item intervention">
        <div>
          <div class="performance-analysis-name">${app.utils.esc(item.name)}</div>
          <div class="performance-analysis-meta">Immediate support recommended</div>
        </div>
        <div class="performance-analysis-side">
          <span class="risk-pill status-pill risk-at-risk">Intervention Needed</span>
          <span class="performance-analysis-avg">${item.average !== null && item.average !== undefined ? item.average.toFixed(1) + '%' : 'N/A'}</span>
        </div>
      </div>
    `).join('');
    app.dom.performanceInterventionNeededList.innerHTML = interventionRows || '<p class="performance-analysis-empty">No students currently in At Risk category.</p>';
  },

  renderClassSummary: function () {
    if (!app.dom.classChart) return;
    const avgs = app.analytics.calcClassAverages();
    const hasData = avgs.some(v => v.overall !== null);

    if (app.charts) app.charts.renderClassChart(avgs, hasData, app);

    if (!hasData) {
      if (app.dom.classSummaryCards) app.dom.classSummaryCards.innerHTML = '<p>No data available</p>';
      return;
    }

    if (app.dom.classSummaryCards) {
      let cardsHtml = '';

      avgs.forEach((exam, idx) => {
        let badge = '';
        const hasCurrent = exam.overall !== null && exam.overall !== undefined && !isNaN(exam.overall);

        if (idx > 0) {
          const previousExam = avgs[idx - 1];
          const hasPrevious = previousExam && previousExam.overall !== null && previousExam.overall !== undefined && !isNaN(previousExam.overall);

          if (hasCurrent && hasPrevious) {
            const diff = Number(exam.overall) - Number(previousExam.overall);
            if (diff > 0) badge = '<span class="trend-badge badge-improved">Improved</span>';
            else if (diff < 0) badge = '<span class="trend-badge badge-declined">Declined</span>';
            else badge = '<span class="trend-badge badge-no-change">No Change</span>';
          }
        }

        const avgDisplay = hasCurrent ? `${this.formatFixedOrFallback(exam.overall, 1, '—')}%` : '—';

        cardsHtml += `
          <div class="trend-card">
            <div class="trend-card-header">
              <span class="trend-card-title">${app.utils.esc(exam.name)}</span>
              ${badge}
            </div>
            <div class="trend-card-value">${avgDisplay}</div>
          </div>
        `;
      });
      app.dom.classSummaryCards.innerHTML = cardsHtml;
    }

    if (app.dom.classInsightBox && avgs.length >= 2) {
      const current = avgs[avgs.length - 1];
      const previous = avgs[avgs.length - 2];
      const currentOverall = this.toFiniteNumber(current?.overall);
      const previousOverall = this.toFiniteNumber(previous?.overall);

      if (currentOverall !== null && previousOverall !== null) {
        const diff = currentOverall - previousOverall;
        const trendClass = diff >= 0 ? 'trend-up' : 'trend-down';
        const icon = diff >= 0 ? '↑' : '↓';
        const statusText = diff >= 0 ? 'improved overall' : 'declined slightly';
        const trendMessage = diff >= 0
          ? 'Performance trend is upward'
          : 'Performance trend is downward';

        app.dom.classInsightBox.innerHTML = `
          <div class="insight-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            Performance Insight
          </div>
          <div class="insight-text">
            Class performance <span class="trend-indicator ${trendClass}">${icon} ${statusText}</span> by <strong>${Math.abs(diff).toFixed(1)}%</strong> from ${app.utils.esc(previous.name)} to ${app.utils.esc(current.name)}.
            <br><span style="font-weight:600; color:var(--text); margin-top:0.35rem; display:inline-block;">${trendMessage}.</span>
          </div>
        `;
        return;
      }
    }

    if (app.dom.classInsightBox) {
      app.dom.classInsightBox.innerHTML = '<div class="insight-text">Add scores for another exam to see performance trends and insights.</div>';
    }
  }
};

export default dashboardUi;
