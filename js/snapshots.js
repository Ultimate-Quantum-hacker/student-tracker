/* ═══════════════════════════════════════════════
   JHS 3 Mock Exam Tracker — snapshots.js
   Lightweight restore point (snapshot) manager.
   ═══════════════════════════════════════════════ */

import app from './state.js';

const SNAPSHOT_STORAGE_KEY = 'studentAppSnapshots';
const MAX_SNAPSHOTS = 10;

const snapshotsModule = {
  getSnapshots: function () {
    const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('Ignoring invalid snapshot cache:', error);
      localStorage.removeItem(SNAPSHOT_STORAGE_KEY);
      return [];
    }
  },

  persistSnapshots: function (snapshots) {
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshots));
  },

  saveSnapshot: function (name = 'Manual Backup') {
    try {
      const snapshots = this.getSnapshots();
      const safeName = String(name || 'Manual Backup').trim() || 'Manual Backup';
      const snapshot = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: safeName,
        date: new Date().toISOString(),
        data: JSON.parse(JSON.stringify(app.state))
      };

      snapshots.unshift(snapshot);
      const limited = snapshots.slice(0, MAX_SNAPSHOTS);
      this.persistSnapshots(limited);

      if (app.ui?.showToast) {
        app.ui.showToast('Snapshot saved successfully');
      }

      return snapshot;
    } catch (error) {
      console.error('Failed to save snapshot:', error);
      if (app.ui?.showToast) {
        app.ui.showToast('Failed to save snapshot');
      }
      return null;
    }
  },

  restoreSnapshot: async function (id) {
    const snapshots = this.getSnapshots();
    const snapshot = snapshots.find(item => item.id === id);

    if (!snapshot) {
      app.ui?.showToast?.('Snapshot not found');
      return false;
    }

    const ok = confirm('Are you sure you want to restore this snapshot? Current data will be overwritten.');
    if (!ok) return false;

    try {
      const migrated = app.migrateToRawData(snapshot.data);
      await app.importData(migrated);
      app.ui?.showToast?.('Snapshot restored. Reloading...');
      setTimeout(() => {
        location.reload();
      }, 120);
      return true;
    } catch (error) {
      console.error('Failed to restore snapshot:', error);
      app.ui?.showToast?.('Failed to restore snapshot');
      return false;
    }
  },

  deleteSnapshot: function (id) {
    const snapshots = this.getSnapshots();
    const filtered = snapshots.filter(item => item.id !== id);

    if (filtered.length === snapshots.length) {
      app.ui?.showToast?.('Snapshot not found');
      return false;
    }

    this.persistSnapshots(filtered);
    app.ui?.showToast?.('Snapshot deleted');
    return true;
  }
};

app.snapshots = snapshotsModule;
export default snapshotsModule;
