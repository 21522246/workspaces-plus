class Workspace {
  constructor(id, state) {
    this.id = id;

    if (state) {
      this.name = state.name;
      this.active = state.active;
      this.hiddenTabs = state.hiddenTabs;
      this.windowId = state.windowId;
      this.groups = state.groups || [];
    }
  }

  static async create(windowId, name, active, tabs = [], groups = []) {
    const workspace = new Workspace(Util.generateUUID(), {
      name: name,
      active: active || false,
      hiddenTabs: tabs,
      windowId: windowId,
      groups: groups,
    });

    await workspace._storeState();
    await WorkspaceStorage.registerWorkspaceToWindow(windowId, workspace.id);

    return workspace;
  }

  static async find(workspaceId) {
    const workspace = new Workspace(workspaceId);
    await workspace._refreshState();

    return workspace;
  }

  async rename(newName) {
    this.name = newName;
    await this._storeState();
  }

  async getTabs() {
    if (this.active) {
      // Not counting pinned tabs. Should we?
      const tabs = await browser.tabs.query({
        pinned: false,
        windowId: this.windowId,
      });

      return tabs;
    } else {
      return this.hiddenTabs;
    }
  }

  async getGroups() {
    if (this.active) {
      // Fetch current groups from browser
      const tabs = await browser.tabs.query({
        pinned: false,
        windowId: this.windowId,
      });
      return await Workspace.fetchGroupsFromTabs(tabs);
    } else {
      // Return stored groups
      return this.groups || [];
    }
  }

  async toObject() {
    const obj = Object.assign({}, this);
    // The active workspace may also keep tabs that couldn't be opened
    obj.tabCount = (await this.getTabs()).length + (this.active ? this.hiddenTabs.length : 0);

    return obj;
  }

  // Store hidden tabs in storage
  async prepareToHide() {
    const tabs = await browser.tabs.query({
      windowId: this.windowId,
      pinned: false,
    });

    // Fetch group information from tabs
    this.groups = await Workspace.fetchGroupsFromTabs(tabs);

    // Only these tabs get closed by hide(). Hidden tabs kept from an earlier show() have ids from an old session,
    // which may now belong to unrelated tabs.
    this.tabIdsToClose = tabs.map((tab) => tab.id);

    this.hiddenTabs = [...tabs.map(Workspace.tabData), ...this.hiddenTabs];
  }

  // Then remove the tabs from the window
  async hide() {
    this.active = false;
    await this._storeState();

    await browser.tabs.remove(this.tabIdsToClose);
  }

  // Returns false if none of the tabs could be opened, in which case nothing is changed
  async show() {
    const tabs = this.hiddenTabs.filter((tab) =>
      Util.isPermissibleURL(tab.url),
    );

    if (tabs.length == 0) {
      tabs.push({
        url: null,
        active: true,
      });
    }

    // Create tabs and restore groups
    const { createdTabs, failedTabs } = await this._createTabs(tabs);
    if (createdTabs.length == 0) {
      return false;
    }
    await this._restoreGroups(createdTabs);

    // Clean up and mark as active. Tabs that couldn't be opened are kept, so they aren't lost.
    this.hiddenTabs = failedTabs;
    this.groups = [];
    this.active = true;
    await this._storeState();
    return true;
  }

  // Private helper method to create tabs from saved data
  async _createTabs(tabs) {
    const createdTabs = [];
    const failedTabs = [];

    for (const tab of tabs) {
      try {
        const createdTab = await browser.tabs.create({
          url: tab.url,
          title: tab.active != true ? tab.title : null,
          active: tab.active,
          cookieStoreId: tab.cookieStoreId,
          discarded: tab.active != true,
          windowId: this.windowId,
        });
        
        createdTabs.push({
          id: createdTab.id,
          originalGroupId: tab.groupId,
          originalTabId: tab.id,
        });
      } catch (error) {
        console.error(`Failed to create tab: ${tab.url}`, error);
        failedTabs.push(tab);
        Util.notify(`Failed to create tab: ${tab.url || "Unknown URL"}`);
      }
    }

    return { createdTabs, failedTabs };
  }

  // Private helper method to restore groups and assign tabs to them
  async _restoreGroups(createdTabs) {
    if (!this.groups || this.groups.length === 0) {
      return;
    }

    for (const groupInfo of this.groups) {
      try {
        // Find all tabs that should be in this group
        const tabsToGroup = createdTabs
          .filter(ct => ct.originalGroupId === groupInfo.id)
          .map(ct => ct.id);
        
        // Create the group with these tabs
        if (tabsToGroup.length > 0) {
          const newGroupId = await browser.tabs.group({
            tabIds: tabsToGroup,
          });
          
          // Update the group with saved properties
          await this._updateGroupProperties(newGroupId, groupInfo);
        }
      } catch (error) {
        console.error(`Failed to create group:`, error);
      }
    }
  }

  // Private helper method to update group properties (title, color, collapsed)
  async _updateGroupProperties(groupId, groupInfo) {
    try {
      await browser.tabGroups.update(groupId, {
        title: groupInfo.title,
        color: groupInfo.color,
        collapsed: groupInfo.collapsed,
      });
    } catch (error) {
      console.error(`Failed to update group ${groupId} properties:`, error);
    }
  }

  // Then remove the tabs from the window
  async delete() {
    await WorkspaceStorage.deleteWorkspaceState(this.id);
    await WorkspaceStorage.unregisterWorkspaceToWindow(this.windowId, this.id);
  }

  async attachTab(tab) {
    this.hiddenTabs.push(Workspace.tabData(tab));

    await this._storeState();
  }

  async detachTab(tab) {
    // We need to refresh the state because if the active workspace was switched we might have an old reference
    await this._refreshState();

    if (this.active) {
      // If the workspace is currently active, simply remove the tab.
      await browser.tabs.remove(tab.id);
    } else {
      // Otherwise, forget it from hiddenTabs
      const index = this.hiddenTabs.findIndex(
        (hiddenTab) => hiddenTab.id == tab.id,
      );
      if (index > -1) {
        this.hiddenTabs.splice(index, 1);
        await this._storeState();
      }
    }
  }

  // Private method to refresh state from storage
  async _refreshState() {
    const state = await WorkspaceStorage.fetchWorkspaceState(this.id);

    this.name = state.name;
    this.active = state.active;
    this.hiddenTabs = state.hiddenTabs;
    this.groups = state.groups;

    // Window ids change when the browser restarts (e.g. after an update), and all windows share the same workspaces,
    // so always use the current window instead of the one the workspace was saved in. Otherwise tabs are read from
    // and opened in a window that no longer exists, and the workspace is saved as empty.
    this.windowId = (await browser.windows.getCurrent()).id;
  }

  // Private method to store state to storage
  async _storeState() {
    await WorkspaceStorage.storeWorkspaceState(this.id, {
      name: this.name,
      active: this.active,
      hiddenTabs: this.hiddenTabs,
      windowId: this.windowId,
      groups: this.groups,
    });
  }

  // The data kept for each hidden tab
  static tabData(tab) {
    return {
      id: tab.id,
      url: tab.url,
      title: tab.title,
      active: tab.active,
      cookieStoreId: tab.cookieStoreId,
      groupId: tab.groupId,
    };
  }

  // Static helper method to fetch group information from tabs
  static async fetchGroupsFromTabs(tabs) {
    // Collect unique group IDs
    const groupIds = [...new Set(tabs.map(tab => tab.groupId).filter(id => id !== undefined && id !== -1))];
    
    // Fetch group information for all groups
    const groupsInfo = [];
    for (const groupId of groupIds) {
      try {
        const group = await browser.tabGroups.get(groupId);
        groupsInfo.push({
          id: group.id,
          title: group.title,
          color: group.color,
          collapsed: group.collapsed,
        });
      } catch (error) {
        console.error(`Failed to get info for group ${groupId}:`, error);
      }
    }
    
    return groupsInfo;
  }
}
