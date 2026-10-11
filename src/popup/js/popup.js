const Logic = {

  workspaces: [],
  workspaceListElement: null,
  draggingItem: null,
  nextSibling: null,

  // Tree view state, kept across re-renders
  expanded: new Set(),
  tabs: new Map(), // workspaceId -> tabs of an expanded workspace, see Workspace.listTabs
  selected: null, // { workspaceId, tabPos }, tabPos is null for a workspace row
  pendingDelete: null, // workspace waiting for a second "d" to be deleted

  async init() {
    // We need the workspaces for rendering, so wait for this one
    await Logic.fetchWorkspaces();
    await Logic.fetchWorkspaceElements();
    await Logic.renderWorkspacesList();
    await Logic.renderWorkspacesEdit();
    await Logic.registerEventListeners();
    await Logic.addDragListeners();
    Logic.showStatus();
  },

  async registerEventListeners() {
    document.addEventListener("click", async e => {
      if (e.target.classList.contains("js-tree-edit-input")) {
        return;
      }

      const toggle = e.target.closest(".js-toggle-workspace");
      const removeTabButton = e.target.closest(".js-remove-tab");
      const tabRow = e.target.closest(".js-switch-tab");
      const workspaceRow = e.target.closest(".js-switch-workspace");

      if (toggle) {
        const workspaceId = toggle.closest(".workspace-node").dataset.workspaceId;
        await Logic.run(() => Logic.expanded.has(workspaceId) ? Logic.collapseWorkspace(workspaceId) : Logic.expandWorkspace(workspaceId));

      } else if (removeTabButton) {
        e.preventDefault();
        Logic.selectRow(removeTabButton.closest(".tree-row"));
        await Logic.run(() => Logic.deleteSelected());

      } else if (tabRow) {
        Logic.selectRow(tabRow);
        await Logic.run(async () => {
          await Logic.switchToTab(tabRow);
          await Logic.refreshWorkspacesList();
        });

      } else if (workspaceRow) {
        const workspaceId = workspaceRow.dataset.workspaceId;
        Logic.selectRow(workspaceRow);
        await Logic.callBackground("switchToWorkspace", {
          workspaceId: workspaceId
        });

        // And re-render the list panel
        await Logic.refreshWorkspacesList();

      } else if (e.target.classList.contains("js-new-workspace")) {
        await Logic.callBackground("createNewWorkspaceAndSwitch");

        // And re-render the list panel
        await Logic.refreshWorkspacesList();

      } else if (e.target.classList.contains("js-clone-workspace")) {
        await Logic.callBackground("cloneWorkspaceAndSwitch");

        // And re-render the list panel
        await Logic.refreshWorkspacesList();

      } else if (e.target.classList.contains("js-switch-panel")) {
        await Logic.renderWorkspacesEdit();
        await Logic.fetchWorkspaces();
        document.querySelectorAll(".container").forEach(el => el.classList.toggle("hide"));

        // And re-render the list panel
        await Logic.renderWorkspacesEdit();
        await Logic.refreshWorkspacesList();

      } else if (e.target.classList.contains("js-delete-workspace")) {
        // Delete element
        const li = e.target.parentNode;
        if (li.parentNode.childNodes.length == 1) {
          // Can't delete the last workspace
          return;
        }

        const workspaceId = li.dataset.workspaceId;
        li.parentNode.removeChild(li);

        // Delete the workspace
        await Logic.callBackground("deleteWorkspace", {
          workspaceId: workspaceId
        });

        // And re-render the list panel
        await Logic.refreshWorkspacesList();
      }
    });

    document.addEventListener("change", async e => {
      if (e.target.classList.contains("js-edit-workspace-input")) {
        // Re-disable the input
        const name = e.target.value;
        e.target.disabled = true;

        // Save new name
        const workspaceId = e.target.parentNode.dataset.workspaceId;
        await Logic.callBackground("renameWorkspace", {
          workspaceId: workspaceId,
          workspaceName: name
        });

        // And re-render the list panel
        await Logic.refreshWorkspacesList();
      }
    });

    // This focus is needed to capture key presses without user interaction
    document.querySelector("#keyTrap").focus();
    document.addEventListener("keydown", async e => {
      if (e.target.classList.contains("js-edit-workspace-input") || e.target.classList.contains("js-tree-edit-input")) {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }
      const key = e.key;
      const treeVisible = !document.querySelector("#workspace-list-container").classList.contains("hide");

      if (key != "d") {
        Logic.cancelDelete();
      }
      var index = parseInt(key);

      if (key.length == 1 && !isNaN(index)) {
        if (index == 0) {
          index = 10;
        }

        const el = document.querySelector(`#workspace-list > .workspace-node:nth-child(${index})`);
        if (el) {
          Logic.callBackground("switchToWorkspace", {
            workspaceId: el.dataset.workspaceId
          });

          window.close();
        }
      }

      if (key == "ArrowUp" || key == "k") {
        Logic.moveSelection(-1);
      }

      if (key == "ArrowDown" || key == "j") {
        Logic.moveSelection(1);
      }

      if ((key == "ArrowRight" || key == "l") && treeVisible) {
        await Logic.run(() => Logic.expandSelected());
      }

      if ((key == "ArrowLeft" || key == "h") && treeVisible) {
        await Logic.run(() => Logic.collapseSelected());
      }

      if (key == "d" && treeVisible) {
        await Logic.run(() => Logic.deleteSelected());
      }

      if (key == "e" && treeVisible) {
        // Don't type the "e" into the input that is about to get the focus
        e.preventDefault();
        Logic.editSelected();
      }

      if (key == "Enter" || key == " ") {
        const selected = Logic.selectedRow();
        if (selected && selected.classList.contains("tab-list-entry")) {
          await Logic.run(async () => {
            await Logic.switchToTab(selected);
            window.close();
          });
        } else if (selected) {
          Logic.callBackground("switchToWorkspace", {
            workspaceId: selected.dataset.workspaceId
          });

          window.close();
        }
      }

    });
  },

  async fetchWorkspaces() {
    this.workspaces = await Logic.callBackground("getWorkspacesForCurrentWindow");
  },

  // Re-fetch the workspaces, and the tabs of the expanded ones, then re-render the list panel
  async refreshWorkspacesList() {
    await Logic.fetchWorkspaces();

    const workspaceIds = new Set(this.workspaces.map(workspace => workspace.id));
    for (const workspaceId of Logic.expanded) {
      if (workspaceIds.has(workspaceId)) {
        Logic.tabs.set(workspaceId, await Logic.callBackground("getWorkspaceTabs", {workspaceId}));
      } else {
        Logic.expanded.delete(workspaceId);
        Logic.tabs.delete(workspaceId);
      }
    }

    await Logic.renderWorkspacesList();
  },

  async renderWorkspacesList() {
    const fragment = document.createDocumentFragment();

    this.workspaces.forEach((workspace, idx) => {
      const expanded = Logic.expanded.has(workspace.id);

      const node = document.createElement("li");
      node.classList.add("workspace-node");
      node.dataset.workspaceId = workspace.id;

      const row = document.createElement("div");
      row.classList.add("workspace-list-entry", "tree-row", "js-switch-workspace");
      if (workspace.active) {
        row.classList.add("active");
      }
      row.dataset.workspaceId = workspace.id;
      row.draggable = true;
      Logic.addRowDragListeners(row, node);

      const toggle = document.createElement("span");
      toggle.classList.add("tree-toggle", "js-toggle-workspace");
      toggle.textContent = expanded ? "▾" : "▸";
      row.appendChild(toggle);

      // Add order number
      const orderSpan = document.createElement("span");
      orderSpan.className = "workspace-order";
      orderSpan.textContent = (idx + 1) + ".";
      row.appendChild(orderSpan);

      const name = document.createElement("span");
      name.classList.add("workspace-name");
      name.textContent = workspace.name;
      row.appendChild(name);

      const span = document.createElement("span");
      span.classList.add("tabs-qty");
      span.textContent = workspace.tabCount;
      row.appendChild(span);

      node.appendChild(row);
      if (expanded) {
        node.appendChild(Logic.renderTabList(workspace, Logic.tabs.get(workspace.id) || []));
      }

      fragment.appendChild(node);
    });

    const list = document.querySelector("#workspace-list");
    list.innerHTML = '';
    list.appendChild(fragment);

    // Keep the selection, or select the active workspace
    const selected = Logic.findRow(Logic.selected) || list.querySelector(".workspace-list-entry.active");
    if (selected) {
      Logic.selectRow(selected);
    }
  },

  renderTabList(workspace, tabs) {
    const ul = document.createElement("ul");
    ul.classList.add("tab-list");

    if (tabs.length == 0) {
      const li = document.createElement("li");
      li.classList.add("tab-list-empty");
      li.textContent = "No tabs";
      ul.appendChild(li);
    }

    tabs.forEach((tab, pos) => {
      const li = document.createElement("li");
      li.classList.add("tab-list-entry", "tree-row", "js-switch-tab");
      li.dataset.workspaceId = workspace.id;
      li.dataset.tabPos = pos;
      li.title = tab.url;
      if (tab.active) {
        li.classList.add("current");
      }
      if (workspace.active && tab.hidden) {
        // Kept because it couldn't be opened when switching to this workspace
        li.classList.add("not-open");
        li.title = `Couldn't be opened, press Enter to try again: ${tab.url}`;
      }

      const title = document.createElement("span");
      title.classList.add("tab-title");
      title.textContent = tab.title || tab.url;
      li.appendChild(title);

      const removeBtn = document.createElement("a");
      removeBtn.classList.add("tab-remove", "js-remove-tab");
      removeBtn.href = "#";
      removeBtn.title = "Remove tab";
      li.appendChild(removeBtn);

      ul.appendChild(li);
    });

    return ul;
  },

  selectedRow() {
    return document.querySelector("#workspace-list .tree-row.selected");
  },

  selectRow(row) {
    document.querySelectorAll("#workspace-list .tree-row.selected").forEach(el => el.classList.remove("selected"));
    row.classList.add("selected");
    row.scrollIntoView({block: "nearest"});

    Logic.selected = {
      workspaceId: row.dataset.workspaceId,
      tabPos: row.dataset.tabPos === undefined ? null : parseInt(row.dataset.tabPos),
    };
  },

  // Find the row for a `Logic.selected` value. If its tab is gone, take the closest one.
  findRow(key) {
    const node = key && document.querySelector(`#workspace-list .workspace-node[data-workspace-id="${key.workspaceId}"]`);
    if (!node) {
      return null;
    }
    if (key.tabPos !== null) {
      const tabRows = node.querySelectorAll(".tab-list-entry");
      if (tabRows.length > 0) {
        return tabRows[Math.min(key.tabPos, tabRows.length - 1)];
      }
    }
    return node.querySelector(".workspace-list-entry");
  },

  moveSelection(delta) {
    const rows = Array.from(document.querySelectorAll("#workspace-list .tree-row"));
    if (rows.length == 0) {
      return;
    }
    const current = rows.findIndex(row => row.classList.contains("selected"));
    const next = current == -1 ? 0 : (current + delta + rows.length) % rows.length;
    Logic.selectRow(rows[next]);
  },

  async expandWorkspace(workspaceId) {
    Logic.tabs.set(workspaceId, await Logic.callBackground("getWorkspaceTabs", {workspaceId}));
    Logic.expanded.add(workspaceId);
    await Logic.renderWorkspacesList();
  },

  async collapseWorkspace(workspaceId) {
    Logic.expanded.delete(workspaceId);
    Logic.tabs.delete(workspaceId);
    if (Logic.selected && Logic.selected.workspaceId == workspaceId) {
      Logic.selected.tabPos = null;
    }
    await Logic.renderWorkspacesList();
  },

  async expandSelected() {
    const row = Logic.selectedRow();
    if (!row || row.classList.contains("tab-list-entry")) {
      return;
    }

    const workspaceId = row.dataset.workspaceId;
    if (!Logic.expanded.has(workspaceId)) {
      await Logic.expandWorkspace(workspaceId);
    } else {
      const firstTab = row.parentNode.querySelector(".tab-list-entry");
      if (firstTab) {
        Logic.selectRow(firstTab);
      }
    }
  },

  async collapseSelected() {
    const row = Logic.selectedRow();
    if (!row) {
      return;
    }

    if (row.classList.contains("tab-list-entry")) {
      Logic.selectRow(row.closest(".workspace-node").querySelector(".workspace-list-entry"));
    } else if (Logic.expanded.has(row.dataset.workspaceId)) {
      await Logic.collapseWorkspace(row.dataset.workspaceId);
    }
  },

  tabForRow(row) {
    return Logic.tabs.get(row.dataset.workspaceId)[parseInt(row.dataset.tabPos)];
  },

  async switchToTab(row) {
    await Logic.callBackground("switchToWorkspaceTab", {
      workspaceId: row.dataset.workspaceId,
      tab: Logic.tabForRow(row)
    });
  },

  // "d": remove the selected tab, or delete the selected workspace after a second "d"
  async deleteSelected() {
    const row = Logic.selectedRow();
    if (!row) {
      return;
    }
    const workspaceId = row.dataset.workspaceId;

    if (row.classList.contains("tab-list-entry")) {
      Logic.cancelDelete();
      await Logic.callBackground("removeWorkspaceTab", {
        workspaceId: workspaceId,
        tab: Logic.tabForRow(row)
      });
      await Logic.refreshWorkspacesList();
      return;
    }

    if (this.workspaces.length == 1) {
      Logic.showStatus("Can't delete the last workspace", true);
      return;
    }

    if (Logic.pendingDelete != workspaceId) {
      Logic.cancelDelete();
      Logic.pendingDelete = workspaceId;
      row.classList.add("confirm-delete");
      const workspace = this.workspaces.find(workspace => workspace.id == workspaceId);
      Logic.showStatus(`Press d again to delete "${workspace.name}"`, true);
      return;
    }

    Logic.pendingDelete = null;
    await Logic.callBackground("deleteWorkspace", {workspaceId});

    // Select the workspace that took its place
    const index = this.workspaces.findIndex(workspace => workspace.id == workspaceId);
    const next = this.workspaces[index + 1] || this.workspaces[index - 1];
    Logic.selected = {workspaceId: next.id, tabPos: null};
    await Logic.refreshWorkspacesList();
    Logic.showStatus();
  },

  cancelDelete() {
    if (!Logic.pendingDelete) {
      return;
    }
    Logic.pendingDelete = null;
    document.querySelectorAll("#workspace-list .confirm-delete").forEach(el => el.classList.remove("confirm-delete"));
    Logic.showStatus();
  },

  // "e": rename the selected workspace, or edit the url of the selected tab
  editSelected() {
    const row = Logic.selectedRow();
    if (!row) {
      return;
    }
    const workspaceId = row.dataset.workspaceId;
    const tab = row.classList.contains("tab-list-entry") ? Logic.tabForRow(row) : null;
    const workspace = this.workspaces.find(workspace => workspace.id == workspaceId);

    const input = document.createElement("input");
    input.type = "text";
    input.classList.add("tree-edit-input", "js-tree-edit-input");
    input.value = tab ? tab.url : workspace.name;
    row.querySelector(tab ? ".tab-title" : ".workspace-name").replaceWith(input);
    row.classList.add("editing");
    // Otherwise selecting text with the mouse drags the row
    row.draggable = false;
    input.focus();
    input.select();
    Logic.showStatus(tab ? "Enter: open the new URL · Esc: cancel" : "Enter: rename · Esc: cancel");

    let done = false;
    const finish = async save => {
      if (done) {
        return;
      }
      done = true;

      try {
        const value = input.value.trim();
        if (save && tab && value != tab.url) {
          const url = await Logic.callBackground("updateWorkspaceTabUrl", {
            workspaceId: workspaceId,
            tab: tab,
            url: value
          });
          // An open tab is still loading the new url, so show it right away instead of re-fetching
          tab.url = url;
          tab.title = url;
        } else if (save && !tab && value && value != workspace.name) {
          await Logic.callBackground("renameWorkspace", {
            workspaceId: workspaceId,
            workspaceName: value
          });
          await Logic.fetchWorkspaces();
        }
      } catch (error) {
        // Keep editing, so a typo can be fixed
        done = false;
        Logic.showStatus(Logic.errorMessage(error), true);
        input.focus();
        return;
      }

      await Logic.renderWorkspacesList();
      Logic.showStatus();
      document.querySelector("#keyTrap").focus();
    };

    input.addEventListener("keydown", e => {
      if (e.key == "Enter") {
        finish(true);
      } else if (e.key == "Escape") {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener("blur", () => finish(false));
  },

  // Run a tree action, showing its error instead of failing silently
  async run(action) {
    try {
      await action();
    } catch (error) {
      Logic.showStatus(Logic.errorMessage(error), true);
    }
  },

  errorMessage(error) {
    return String(error && error.message || error).replace(/^Error: /, "");
  },

  showStatus(message = "h/l expand · e edit · d delete · Enter open", isError = false) {
    const status = document.querySelector("#tree-status");
    status.textContent = message;
    status.classList.toggle("error", isError);
  },

  async renderWorkspacesEdit() {
    const fragment = document.createDocumentFragment();

    this.workspaces.forEach(workspace => {
      const li = document.createElement("li");
      li.classList.add("workspace-edit-entry");
      li.dataset.workspaceId = workspace.id;

      const input = document.createElement("input");
      input.classList.add("js-edit-workspace-input");
      input.type = "text";
      input.value = workspace.name;
      // input.disabled = true;
      li.appendChild(input);

      // const renameBtn = document.createElement("a");
      // renameBtn.classList.add("edit-button", "edit-button-rename", "js-edit-workspace");
      // renameBtn.href = "#";
      // li.appendChild(renameBtn);

      const deleteBtn = document.createElement("a");
      deleteBtn.classList.add("edit-button", "edit-button-delete", "js-delete-workspace");
      deleteBtn.href = "#";
      li.appendChild(deleteBtn);

      fragment.appendChild(li);
    });

    const list = document.querySelector("#workspace-edit");
    list.innerHTML = '';
    list.appendChild(fragment);
  },

  async callBackground(method, args) {
    const message = Object.assign({}, {method}, args);

    if (typeof browser != "undefined") {
      return await browser.runtime.sendMessage(message);
    } else {
      return BackgroundMock.sendMessage(message);
    }
  },

  async fetchWorkspaceElements() {
    Logic.workspaceListElement = document.querySelector("#workspace-list");
  },

  // The workspace row is the drag handle, but the whole node (with its tabs) is moved
  addRowDragListeners(row, node) {
    row.addEventListener("dragstart", () => {
      // Adding dragging class to item after a delay
      setTimeout(() => node.classList.add("dragging"), 0);
    });
    row.addEventListener("dragend", async () => {
      let workspaceIds = [];
      Logic.workspaceListElement.querySelectorAll(".workspace-node").forEach(item => workspaceIds.push(item.dataset.workspaceId));
      await Logic.callBackground("changeWorkspaceOrder", {
        orderedWorkspaceIds: workspaceIds
      });
      node.classList.remove("dragging");

      // Update the order numbers
      await Logic.refreshWorkspacesList();
    });
  },

  initDragOverBehavior(e) {

    e.preventDefault();
    const draggingItem = document.querySelector(".workspace-node.dragging");
    if (!draggingItem) {
      return;
    }

    // Get all items except currently dragging item.
    let siblings = [...Logic.workspaceListElement.querySelectorAll(".workspace-node:not(.dragging)")];

    // Find the sibling where the dragging item is being placed. The list can scroll, so use viewport coordinates.
    let nextSibling = siblings.find(sibling => {
      return e.clientY <= sibling.getBoundingClientRect().bottom;
    });

    // Insert the dragging item before the found sibling
    Logic.workspaceListElement.insertBefore(draggingItem, nextSibling);
    Logic.draggingItem = draggingItem;
    Logic.nextSibling = nextSibling;
  },
  async addDragListeners() {
    Logic.workspaceListElement.addEventListener("dragover", Logic.initDragOverBehavior);
    Logic.workspaceListElement.addEventListener("dragenter", e => e.preventDefault());
  }
}

Logic.init();
