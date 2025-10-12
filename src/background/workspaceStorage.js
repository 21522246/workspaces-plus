const WorkspaceStorage = {
  async fetchWorkspaceState(workspaceId) {
    const key = WorkspaceStorage._getKeyForWorkspace(workspaceId);
    const state = await WorkspaceStorage._localStorageGet(key);
    if (state) {
      return state;
    }
    throw `Workspace ${workspaceId} has no state.`;
  },

  async storeWorkspaceState(workspaceId, state) {
    const key = WorkspaceStorage._getKeyForWorkspace(workspaceId);
    await WorkspaceStorage._localStorageSet(key, state);
  },

  async deleteWorkspaceState(workspaceId) {
    const key = WorkspaceStorage._getKeyForWorkspace(workspaceId);
    await browser.storage.local.remove(key);
  },

  async fetchWorkspacesCountForWindow(windowId) {
    const key = WorkspaceStorage._getKeyForWindow(windowId);
    const workspaceIds = await WorkspaceStorage._localStorageGet(key) || [];
    return workspaceIds.length;
  },
  async changeWorkspaceOrder(windowId, orderedWorkspaceIds) {
    const key = WorkspaceStorage._getKeyForWindow(windowId);
    await WorkspaceStorage._localStorageSet(key, orderedWorkspaceIds);
  },

  async fetchWorkspacesForWindow(windowId) {
    const key = WorkspaceStorage._getKeyForWindow(windowId);
    const workspaceIds = await WorkspaceStorage._localStorageGet(key) || [];
    const promises = workspaceIds.map(async (workspaceId) => {
      const state = await WorkspaceStorage.fetchWorkspaceState(workspaceId);
      return new Workspace(workspaceId, state);
    });
    return await Promise.all(promises);
  },

  async registerWorkspaceToWindow(windowId, workspaceId) {
    const key = WorkspaceStorage._getKeyForWindow(windowId);
    const workspacesForWindow = await WorkspaceStorage._localStorageGet(key) || [];
    workspacesForWindow.push(workspaceId);
    await WorkspaceStorage._localStorageSet(key, workspacesForWindow);
  },

  async unregisterWorkspaceToWindow(windowId, workspaceId) {
    const key = WorkspaceStorage._getKeyForWindow(windowId);
    const workspacesForWindow = await WorkspaceStorage._localStorageGet(key) || [];
    const index = workspacesForWindow.findIndex(
      (aWorkspaceId) => aWorkspaceId == workspaceId,
    );
    workspacesForWindow.splice(index, 1);
    await WorkspaceStorage._localStorageSet(key, workspacesForWindow);
  },

  async fetchNextWorkspaceId(windowId, referenceWorkspaceId) {
    const key = WorkspaceStorage._getKeyForWindow(windowId);
    const workspaceIds = await WorkspaceStorage._localStorageGet(key) || [];
    const index = workspaceIds.findIndex(
      (aWorkspaceId) => aWorkspaceId == referenceWorkspaceId,
    );
    if (index == -1 || workspaceIds.length == 1) {
      throw "There is no other workspace";
    }
    const nextIndex = index < workspaceIds.length - 1 ? index + 1 : index - 1;
    return workspaceIds[nextIndex];
  },

  async tearDownWindow(windowId) {
    // Fetch workspaces in closed window
    const key = WorkspaceStorage._getKeyForWindow(windowId);
    const workspaceIds = await WorkspaceStorage._localStorageGet(key) || [];
    // Remove entry in windows list
    await browser.storage.local.remove(key);
    // Then remove the state of all the workspaces in the window
    const promises = workspaceIds.map(WorkspaceStorage.deleteWorkspaceState);
    await Promise.all(promises);
  },

  _getKeyForWorkspace(workspaceId) {
    return `workspaces@${workspaceId}`;
  },
  _getKeyForWindow(_windowId) {
    return `windows@0`;
  },

  async _localStorageGet(key) {
    const results = await browser.storage.local.get(key);
    const decompressed = LZString.decompress(results[key]) || results[key] || "";
    return JSON.parse(decompressed != "" ? decompressed : null);
  },
  async _localStorageSet(key, value) {
    const compressedValue = LZString.compress(JSON.stringify(value));
    await browser.storage.local.set({
      [key]: compressedValue,
    });
  },

};
